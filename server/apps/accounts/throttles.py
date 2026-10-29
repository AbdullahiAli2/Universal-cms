import hashlib

from rest_framework.throttling import SimpleRateThrottle


class LoginEmailThrottle(SimpleRateThrottle):
    """
    Limits sign-in attempts per account, whatever address they come from.

    The per-address "login" throttle alone is weak here: every dashboard sign-in
    reaches Django from the Next.js server, and an attacker can rotate addresses.
    The email is hashed so the cache never holds it in clear text.
    """

    scope = "login_email"

    def get_cache_key(self, request, view):
        email = request.data.get("email") if hasattr(request.data, "get") else None
        if not isinstance(email, str) or not email.strip():
            return None  # the serializer rejects the request anyway
        digest = hashlib.sha256(email.strip().lower().encode()).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": digest}
