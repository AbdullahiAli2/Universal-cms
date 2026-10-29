from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import UserSession, hash_key

# Writing last_used_at on every request would be a write per API call; once every few minutes is enough.
TOUCH_EVERY = timedelta(minutes=5)


class SessionTokenAuthentication(BaseAuthentication):
    """
    `Authorization: Token <key>`, checked against UserSession by hash. Sessions expire after
    CMS_TOKEN_TTL_DAYS and stop working as soon as they are revoked or the account is disabled.
    """

    keyword = "Token"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword.lower().encode():
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Invalid token header.")
        try:
            raw = parts[1].decode()
        except UnicodeError:
            raise AuthenticationFailed("Invalid token.")

        session = UserSession.objects.select_related("user").filter(key_hash=hash_key(raw)).first()
        if session is None:
            raise AuthenticationFailed("Invalid token.")
        now = timezone.now()
        if session.created_at < now - timedelta(days=settings.CMS_TOKEN_TTL_DAYS):
            session.delete()
            raise AuthenticationFailed("Your session has expired. Please sign in again.")
        if not session.user.is_active:
            raise AuthenticationFailed("This account is disabled.")
        if now - session.last_used_at > TOUCH_EVERY:
            UserSession.objects.filter(pk=session.pk).update(last_used_at=now)
        return session.user, session

    def authenticate_header(self, request):
        return self.keyword


# Kept so existing imports keep working.
ExpiringTokenAuthentication = SessionTokenAuthentication
