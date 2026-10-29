"""Encryption for secrets stored in the database, such as the SMTP password."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet():
    secret = settings.CMS_ENCRYPTION_KEY or settings.SECRET_KEY
    # Domain-separated, so the key is not simply the SECRET_KEY used for signing.
    key = hashlib.sha256(f"universal-cms:secrets:{secret}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt(value):
    return _fernet().encrypt(value.encode()).decode() if value else ""


def decrypt(token):
    """Returns the secret, or None when it cannot be read (for example after the key changed)."""
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, ValueError):
        return None
