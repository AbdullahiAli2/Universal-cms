from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils.dateparse import parse_date
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import services as accounts
from apps.audit import services as audit
from apps.audit.models import AuditLog
from apps.audit.serializers import AuditLogSerializer
from apps.content.models import Entry, EntryStatus
from apps.content.services import publish_due_entries, readable_type_keys
from apps.mail import services as mail

from . import dashboard
from .filters import WebsiteFilter
from .models import Membership, Role, RolePermission, Website, WebsiteSource
from .permissions import (
    CONTENT_ACTIONS,
    GENERAL_PERMISSIONS,
    all_codes,
    get_visible_website,
    has_perm,
    is_owner,
    require_perm,
    role_permissions,
    user_permissions,
    visible_websites,
)
from .serializers import (
    DOMAIN_UNAVAILABLE,
    MemberInviteSerializer,
    MemberSerializer,
    MemberUpdateSerializer,
    RolePermissionsSerializer,
    WebsiteSerializer,
)
from .services import create_website, ensure_default_workspace

User = get_user_model()

ROLE_DESCRIPTIONS = {
    Role.OWNER: "Full control, including deleting the website. Always has every permission.",
    Role.ADMIN: "Manages settings, users and roles.",
    Role.EDITOR: "Edits and publishes everyone's content.",
    Role.AUTHOR: "Writes content and submits it for review.",
    Role.VIEWER: "Reads content without changing it.",
}


class WorkspaceView(APIView):
    """The website the dashboard opens after sign-in. Created on first use for platform administrators."""

    def get(self, request):
        website = ensure_default_workspace(request.user)
        websites = visible_websites(request.user)
        return Response(
            {
                "website": WebsiteSerializer(website).data if website else None,
                "website_count": websites.count(),
            }
        )


class WebsiteListCreateView(generics.ListCreateAPIView):
    serializer_class = WebsiteSerializer
    filter_backends = [DjangoFilterBackend, SearchFilter]
    filterset_class = WebsiteFilter
    search_fields = ["name", "slug", "primary_domain"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Website.objects.none()
        return visible_websites(self.request.user).order_by("name", "id")

    def perform_create(self, serializer):
        fields = dict(serializer.validated_data)
        serializer.instance = create_website(self.request.user, **fields)


class WebsiteDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = WebsiteSerializer
    lookup_field = "slug"

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Website.objects.none()
        return visible_websites(self.request.user)

    def update(self, request, *args, **kwargs):
        require_perm(self.get_object(), "settings.manage")
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                website = serializer.save()
        except IntegrityError:
            raise ValidationError({"primary_domain": [DOMAIN_UNAVAILABLE]})
        changed = ", ".join(sorted(serializer.validated_data.keys()))
        audit.record(
            action="website.updated",
            actor=self.request.user,
            website=website,
            target=website,
            summary=f"Updated {changed}"[:255],
        )

    def destroy(self, request, *args, **kwargs):
        website = self.get_object()
        if not is_owner(website):
            raise PermissionDenied("Only an owner can delete a website.")
        if website.is_default:
            raise ValidationError({"detail": "This is the default workspace, so it cannot be deleted."})
        audit.record(
            action="website.deleted",
            actor=request.user,
            summary=f"Deleted website “{website.name}”",
        )
        website.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebsiteDashboardView(APIView):
    """Real counts and activity only."""

    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        members = Membership.objects.filter(website=website)
        member_count = members.count()
        by_role = {role.value: members.filter(role=role).count() for role in Role}
        recent = AuditLog.objects.filter(website=website).select_related("actor")[:8]

        checklist = [{"key": "details", "label": "Describe the website", "done": bool(website.description.strip())}]
        if website.source == WebsiteSource.CONNECTED:
            checklist.append({"key": "frontend", "label": "Add your website's address", "done": bool(website.frontend_url)})
        publish_due_entries(website)
        type_keys = readable_type_keys(website)
        entries = Entry.objects.filter(website=website, content_type__key__in=type_keys)
        content = {key: 0 for key in EntryStatus.values}
        for row in entries.values("status").annotate(n=Count("id")):
            content[row["status"]] = row["n"]
        articles = entries.filter(content_type__key="article")
        attention = (
            entries.filter(status__in=[EntryStatus.DRAFT, EntryStatus.IN_REVIEW])
            .select_related("content_type", "author")
            .order_by("-updated_at", "-id")[:6]
        )

        checklist += [
            {"key": "domain", "label": "Set the primary domain", "done": bool(website.primary_domain)},
            {"key": "team", "label": "Invite a teammate", "done": member_count > 1},
            {"key": "content", "label": "Publish your first entry", "done": content[EntryStatus.PUBLISHED] > 0},
        ]

        return Response(
            {
                "website": WebsiteSerializer(website).data,
                "stats": {
                    "members": member_count,
                    "by_role": by_role,
                    "content": content,
                    "articles_published": articles.filter(status=EntryStatus.PUBLISHED).count(),
                    "upcoming_scheduled": content[EntryStatus.SCHEDULED],
                },
                "needs_attention": [
                    {
                        "id": entry.id,
                        "title": entry.title,
                        "status": entry.status,
                        "type": entry.content_type.key,
                        "type_name": entry.content_type.name,
                        "author_email": entry.author.email if entry.author else None,
                        "updated_at": entry.updated_at,
                    }
                    for entry in attention
                ],
                # Real values only. api_base_url is empty until the administrator sets CMS_PUBLIC_API_URL.
                "connection": {"api_base_url": settings.CMS_PUBLIC_API_URL, "website_id": website.slug},
                "setup_checklist": checklist,
                "recent_activity": AuditLogSerializer(recent, many=True).data,
                "overview": dashboard.overview(website, type_keys),
            }
        )


# --- Users --------------------------------------------------------------------------


def _invite_message(website, inviter, url):
    return (
        f"{inviter.full_name or inviter.email} invited you to manage {website.name} in Universal CMS.\n\n"
        f"Choose your password here (the link works for {accounts.INVITATION_DAYS} days):\n{url}\n\n"
        "If you were not expecting this, you can ignore this email."
    )


def _send_invitation(website, inviter, user):
    raw = accounts.create_invitation(user, inviter)
    url = accounts.invitation_url(raw)
    sent, error = mail.send(user.email, f"You're invited to {website.name}", _invite_message(website, inviter, url))
    return {"invite_url": url, "email_sent": sent, "email_error": "" if sent else error}


class MemberListCreateView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        memberships = Membership.objects.filter(website=website).select_related("user")
        if search := request.query_params.get("search", "").strip():
            memberships = memberships.filter(
                Q(user__email__icontains=search) | Q(user__first_name__icontains=search) | Q(user__last_name__icontains=search)
                | Q(user__username__icontains=search)
            )
        return Response(MemberSerializer(memberships, many=True).data)

    @transaction.atomic
    def post(self, request, slug):
        """Adds an existing account, or creates one and sends an invitation to choose a password."""
        website = get_visible_website(request.user, slug)
        require_perm(website, "users.manage")

        serializer = MemberInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        email = User.objects.normalize_email(data["email"]).strip()

        user = User.objects.filter(email__iexact=email).first()
        created = user is None
        if created:
            user = User.objects.create_user(
                email=email, password=None, first_name=data.get("first_name", "").strip(), last_name=data.get("last_name", "").strip()
            )
            user.display_name = user.full_name
            user.save(update_fields=["display_name"])
            audit.record(action="user.invited", actor=request.user, website=website, target=user, summary=f"Invited {email}")
        elif Membership.objects.filter(website=website, user=user).exists():
            raise ValidationError({"email": ["This person is already a member of this website."]})

        membership = Membership.objects.create(website=website, user=user, role=data["role"])
        audit.record(
            action="member.added", actor=request.user, website=website, target=membership,
            summary=f"Added {user.email} as {membership.role}"[:255],
        )
        body = MemberSerializer(membership).data
        if created:
            body.update(_send_invitation(website, request.user, user))
        return Response(body, status=status.HTTP_201_CREATED)


class MemberDetailView(APIView):
    def _membership(self, website, pk):
        membership = Membership.objects.select_related("user").filter(website=website, pk=pk).first()
        if membership is None:
            raise NotFound("Member not found.")
        return membership

    def _guard_owner_changes(self, website, membership, new_role=None):
        """Only owners may touch owner roles, and a website must always keep one owner."""
        touches_owner = membership.role == Role.OWNER or new_role == Role.OWNER
        if touches_owner and not is_owner(website):
            raise PermissionDenied("Only an owner can change an owner's role.")
        removing_owner = membership.role == Role.OWNER and new_role != Role.OWNER
        if removing_owner and Membership.objects.filter(website=website, role=Role.OWNER).count() <= 1:
            raise ValidationError({"role": ["A website must keep at least one owner."]})

    @transaction.atomic
    def patch(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        membership = self._membership(website, pk)
        serializer = MemberUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = membership.user

        if "role" in data and data["role"] != membership.role:
            require_perm(website, "users.manage")
            self._guard_owner_changes(website, membership, data["role"])
            old_role, membership.role = membership.role, data["role"]
            membership.save(update_fields=["role"])
            audit.record(
                action="member.role_changed", actor=request.user, website=website, target=membership,
                summary=f"Changed {user.email} from {old_role} to {membership.role}"[:255],
            )

        account = {key: data[key] for key in ("first_name", "last_name", "is_active") if key in data}
        if account:
            # These change the person's account on every website, so they need a platform administrator.
            if not request.user.is_superuser:
                raise PermissionDenied("Only platform administrators can edit or disable accounts.")
            if account.get("is_active") is False and (user == request.user or user.is_superuser):
                raise ValidationError({"is_active": ["You cannot disable your own account or another platform administrator."]})
            for key, value in account.items():
                setattr(user, key, value.strip() if isinstance(value, str) else value)
            user.display_name = user.full_name
            user.save()
            if account.get("is_active") is False:
                accounts.revoke_sessions(user)
            label = {True: "Enabled", False: "Disabled"}.get(account.get("is_active"), "Edited")
            audit.record(action="user.updated", actor=request.user, website=website, target=user, summary=f"{label} account {user.email}")
        return Response(MemberSerializer(membership).data)

    @transaction.atomic
    def delete(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        require_perm(website, "users.manage")
        membership = self._membership(website, pk)
        self._guard_owner_changes(website, membership, new_role=None)

        audit.record(
            action="member.removed", actor=request.user, website=website, target=membership,
            summary=f"Removed {membership.user.email}"[:255],
        )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MemberInvitationView(APIView):
    """Sends a fresh invitation link to a member who has not chosen a password yet."""

    def post(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        require_perm(website, "users.manage")
        membership = Membership.objects.select_related("user").filter(website=website, pk=pk).first()
        if membership is None:
            raise NotFound("Member not found.")
        if membership.user.has_usable_password():
            raise ValidationError({"detail": "This person has already set a password."})
        result = _send_invitation(website, request.user, membership.user)
        audit.record(action="user.invited", actor=request.user, website=website, target=membership.user, summary=f"Sent a new invitation to {membership.user.email}")
        return Response(result)


# --- Roles & permissions ----------------------------------------------------------------


def permission_catalog(website):
    from apps.content.models import ContentType

    return {
        "content_actions": [{"key": key, "label": label} for key, label in CONTENT_ACTIONS],
        "content_types": [{"key": t.key, "name": t.name} for t in ContentType.objects.filter(website=website)],
        "groups": [{"name": name, "permissions": [{"code": code, "label": label} for code, label in items]} for name, items in GENERAL_PERMISSIONS],
    }


class RoleListView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        counts = dict(Membership.objects.filter(website=website).values_list("role").annotate(n=Count("id")))
        customised = set(RolePermission.objects.filter(website=website).values_list("role", flat=True))
        roles = [
            {
                "key": role.value,
                "label": role.label,
                "description": ROLE_DESCRIPTIONS[role],
                "member_count": counts.get(role.value, 0),
                "permissions": sorted(role_permissions(website, role.value)),
                "editable": role != Role.OWNER,
                "customised": role.value in customised,
            }
            for role in Role
        ]
        return Response({"roles": roles, "catalog": permission_catalog(website), "can_manage": has_perm(website, "roles.manage")})


class RoleDetailView(APIView):
    @transaction.atomic
    def put(self, request, slug, role):
        website = get_visible_website(request.user, slug)
        require_perm(website, "roles.manage")
        if role not in Role.values:
            raise NotFound("Role not found.")
        if role == Role.OWNER:
            raise ValidationError({"detail": "Owners always have every permission."})
        serializer = RolePermissionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        wanted = set(serializer.validated_data["permissions"])
        unknown = wanted - all_codes(website)
        if unknown:
            raise ValidationError({"permissions": [f"Unknown permission: {sorted(unknown)[0]}"]})
        # Nobody can hand out more than they have, or take away the access they are using to make the change.
        before = role_permissions(website, role)
        granted, revoked = wanted - before, before - wanted
        mine = user_permissions(website)
        if granted - mine:
            raise PermissionDenied("You can only grant permissions you have yourself.")
        if website.my_role == role and "roles.manage" in revoked:
            raise ValidationError({"permissions": ["You cannot remove “Change role permissions” from your own role."]})
        RolePermission.objects.update_or_create(website=website, role=role, defaults={"permissions": sorted(wanted)})
        website.__dict__.pop("_role_permissions", None)
        audit.record(
            action="role.permissions_changed", actor=request.user, website=website,
            summary=f"Changed {Role(role).label} permissions: +{len(granted)} / −{len(revoked)}",
        )
        return Response({"key": role, "permissions": sorted(wanted)})


# --- Audit logs --------------------------------------------------------------------------


class AuditPagination(PageNumberPagination):
    page_size = 50


class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    pagination_class = AuditPagination

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return AuditLog.objects.none()
        website = get_visible_website(self.request.user, self.kwargs["slug"])
        require_perm(website, "audit.view")
        params = self.request.query_params
        logs = AuditLog.objects.filter(website=website)
        # Platform administrators may include installation-wide events (sign-ins, email settings).
        if params.get("scope") == "all" and self.request.user.is_superuser:
            logs = AuditLog.objects.filter(Q(website=website) | Q(website__isnull=True))
        if action := params.get("action", "").strip():
            logs = logs.filter(action__startswith=action)
        if actor := params.get("actor", "").strip():
            logs = logs.filter(actor__email__icontains=actor)
        if search := params.get("search", "").strip():
            logs = logs.filter(summary__icontains=search)
        if (start := parse_date(params.get("date_from", "") or "")) is not None:
            logs = logs.filter(created_at__date__gte=start)
        if (end := parse_date(params.get("date_to", "") or "")) is not None:
            logs = logs.filter(created_at__date__lte=end)
        return logs.select_related("actor", "website")
