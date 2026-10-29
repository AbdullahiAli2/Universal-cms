from django.db import IntegrityError, transaction
from rest_framework.exceptions import ValidationError
from django.utils.text import slugify

from apps.audit import services as audit
from apps.content.services import ensure_builtin_types

from .models import Membership, Role, Website, WebsiteSource
from .serializers import DOMAIN_UNAVAILABLE


def unique_slug(name):
    base = slugify(name)[:70] or "website"
    slug, counter = base, 2
    while Website.objects.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


DEFAULT_WORKSPACE_NAME = "My website"


@transaction.atomic
def ensure_default_workspace(user):
    """
    The website the dashboard opens after sign-in. Platform administrators get one created on first use
    (and are made its owner if needed), so nobody has to create or connect a website before starting.
    Other users get the default workspace if they belong to it, else their first website, else None.
    """
    from .permissions import visible_websites

    mine = visible_websites(user)
    default = Website.objects.filter(is_default=True).first()
    if default is None and user.is_superuser:
        default = Website.objects.order_by("created_at", "id").first()
        if default is not None:
            Website.objects.filter(pk=default.pk).update(is_default=True)
        else:
            default = create_website(user, name=DEFAULT_WORKSPACE_NAME, is_default=True)
    if default is not None and user.is_superuser and not Membership.objects.filter(website=default, user=user).exists():
        Membership.objects.create(website=default, user=user, role=Role.OWNER)
        audit.record(action="member.added", actor=user, website=default, summary=f"Added platform administrator {user.email} as owner")
    if default is not None:
        found = mine.filter(pk=default.pk).first()
        if found is not None:
            return found
    return mine.order_by("created_at", "id").first()


@transaction.atomic
def create_website(user, **fields):
    try:
        with transaction.atomic():  # savepoint, so the outer transaction stays usable after a conflict
            website = Website.objects.create(slug=unique_slug(fields["name"]), created_by=user, **fields)
    except IntegrityError:
        # Lost a race for the domain (or the slug). Report it the same way as a normal conflict.
        if fields.get("primary_domain"):
            raise ValidationError({"primary_domain": [DOMAIN_UNAVAILABLE]})
        raise ValidationError({"name": ["Could not create this website. Try a slightly different name."]})
    Membership.objects.create(website=website, user=user, role=Role.OWNER)
    ensure_builtin_types(website)
    website.my_role = Role.OWNER
    connected = website.source == WebsiteSource.CONNECTED
    audit.record(
        action="website.connected" if connected else "website.created",
        actor=user,
        website=website,
        target=website,
        summary=f"Connected existing website “{website.name}”" if connected else f"Created website “{website.name}”",
    )
    return website
