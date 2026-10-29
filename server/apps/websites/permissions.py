"""
Website isolation and permission checks.

Every website-scoped query starts from visible_websites(user), which only returns websites the user
has a Membership for. A website the user cannot see returns 404, the same as a website that does not
exist, so the API does not reveal which slugs exist on other tenants.

Inside a website, each role has a set of permission codes. Owners always have every permission.
The other roles start from default_permissions(), and admins can change them per website in
Settings → Roles & Permissions (stored in RolePermission).
"""

from django.db.models import OuterRef, Subquery
from rest_framework.exceptions import NotFound, PermissionDenied

from .models import ROLE_RANK, Membership, Role, RolePermission, Website

CONTENT_ACTIONS = [
    ("read", "Read"),
    ("create", "Create"),
    ("update", "Edit any"),
    ("publish", "Publish"),
    ("delete", "Delete any"),
]

GENERAL_PERMISSIONS = [
    ("Media", [("media.upload", "Upload files"), ("media.manage", "Edit and delete anyone's files")]),
    (
        "Settings",
        [
            ("settings.manage", "Change general settings"),
            ("branding.manage", "Change branding"),
            ("domains.manage", "Manage domains"),
            ("seo.manage", "Change SEO and analytics settings"),
        ],
    ),
    (
        "Administration",
        [
            ("users.manage", "Invite users and change their roles"),
            ("roles.manage", "Change role permissions"),
            ("audit.view", "View audit logs"),
        ],
    ),
]


def content_codes(type_keys, actions):
    return {f"content.{key}.{action}" for key in type_keys for action in actions}


def default_permissions(role, type_keys):
    """Today's built-in behaviour, expressed as permission codes."""
    if role == Role.VIEWER:
        return content_codes(type_keys, ["read"])
    if role == Role.AUTHOR:
        return content_codes(type_keys, ["read", "create"]) | {"media.upload"}
    if role == Role.EDITOR:
        return content_codes(type_keys, ["read", "create", "update", "publish", "delete"]) | {"media.upload", "media.manage"}
    if role == Role.ADMIN:
        return default_permissions(Role.EDITOR, type_keys) | {code for _group, items in GENERAL_PERMISSIONS for code, _label in items}
    return set()


def all_codes(website):
    keys = _type_keys(website)
    return content_codes(keys, [action for action, _label in CONTENT_ACTIONS]) | {
        code for _group, items in GENERAL_PERMISSIONS for code, _label in items
    }


def _type_keys(website):
    from apps.content.models import ContentType  # content depends on websites

    cached = getattr(website, "_type_keys", None)
    if cached is None:
        cached = list(ContentType.objects.filter(website=website).values_list("key", flat=True))
        website._type_keys = cached
    return cached


def role_permissions(website, role):
    """The permission codes a role has on this website."""
    if role == Role.OWNER:
        return all_codes(website)
    cache = website.__dict__.setdefault("_role_permissions", {})
    if role not in cache:
        stored = RolePermission.objects.filter(website=website, role=role).first()
        cache[role] = set(stored.permissions) if stored else default_permissions(role, _type_keys(website))
    return cache[role]


def user_permissions(website):
    """Codes for the caller on `website` (which carries my_role from visible_websites)."""
    role = getattr(website, "my_role", None)
    return role_permissions(website, role) if role else set()


def has_perm(website, code):
    return code in user_permissions(website)


def require_perm(website, code, message="Your role on this website does not allow this action."):
    if not has_perm(website, code):
        raise PermissionDenied(message)


def visible_websites(user):
    if not user.is_authenticated:
        return Website.objects.none()
    my_role = Membership.objects.filter(website=OuterRef("pk"), user=user).values("role")[:1]
    member_of = Membership.objects.filter(user=user).values("website_id")
    return Website.objects.filter(pk__in=member_of).annotate(my_role=Subquery(my_role))


def get_visible_website(user, slug):
    website = visible_websites(user).filter(slug=slug).first()
    if website is None:
        raise NotFound("Website not found.")
    return website


def require_role(website, minimum):
    """Raise 403 unless the caller's role on this website is at least `minimum`."""
    role = getattr(website, "my_role", None)
    if role is None or ROLE_RANK[role] < ROLE_RANK[minimum]:
        raise PermissionDenied("Your role on this website does not allow this action.")


def is_owner(website):
    return getattr(website, "my_role", None) == Role.OWNER
