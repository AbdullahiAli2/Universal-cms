"""Sessions and invitations."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import Invitation, UserSession, hash_key

INVITATION_DAYS = 7


def client_details(request):
    """
    Browser and address to show in Active sessions. The dashboard server forwards them, because
    every request reaches the API from that server. They are for display only, never for access.
    """
    agent = request.headers.get("X-Client-User-Agent") or request.META.get("HTTP_USER_AGENT", "")
    address = request.headers.get("X-Client-IP") or request.META.get("REMOTE_ADDR", "")
    return agent[:300], address.split(",")[0].strip()[:64]


def issue_session(user, request):
    expired = timezone.now() - timedelta(days=settings.CMS_TOKEN_TTL_DAYS)
    UserSession.objects.filter(user=user, created_at__lt=expired).delete()
    agent, address = client_details(request)
    _session, raw = UserSession.issue(user, user_agent=agent, ip_address=address)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])
    return raw


def revoke_sessions(user, *, keep=None):
    sessions = UserSession.objects.filter(user=user)
    if keep is not None:
        sessions = sessions.exclude(pk=keep.pk)
    return sessions.delete()[0]


def create_invitation(user, created_by):
    """Returns the raw token. Earlier unused invitations for the user stop working."""
    Invitation.objects.filter(user=user, used_at__isnull=True).delete()
    raw = secrets.token_urlsafe(32)
    Invitation.objects.create(
        user=user,
        token_hash=hash_key(raw),
        created_by=created_by,
        expires_at=timezone.now() + timedelta(days=INVITATION_DAYS),
    )
    return raw


def invitation_url(raw):
    return f"{settings.CMS_DASHBOARD_URL}/invite?token={raw}"


def find_invitation(raw):
    """The pending, unexpired invitation for this token, or None."""
    if not raw:
        return None
    return (
        Invitation.objects.select_related("user")
        .filter(token_hash=hash_key(raw), used_at__isnull=True, expires_at__gt=timezone.now(), user__is_active=True)
        .first()
    )


def pending_invitation(user):
    return Invitation.objects.filter(user=user, used_at__isnull=True, expires_at__gt=timezone.now()).first()
