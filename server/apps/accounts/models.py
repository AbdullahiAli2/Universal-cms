import hashlib
import secrets

from django.conf import settings
from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.db.models.functions import Lower


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=self.normalize_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields["is_staff"] or not extra_fields["is_superuser"]:
            raise ValueError("Superusers must have is_staff=True and is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class Language(models.TextChoices):
    EN = "en", "English"
    SO = "so", "Somali"
    AR = "ar", "Arabic"


class Theme(models.TextChoices):
    SYSTEM = "system", "Match my device"
    LIGHT = "light", "Light"
    DARK = "dark", "Dark"


class User(AbstractUser):
    """Email-based account. Website roles live in apps.websites.Membership."""

    # Optional public handle. Sign-in always uses the email address.
    username = models.CharField(max_length=30, null=True, blank=True)
    email = models.EmailField("email address", unique=True)
    display_name = models.CharField(max_length=150, blank=True)
    language = models.CharField(max_length=8, choices=Language.choices, default=Language.EN)
    theme = models.CharField(max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    # Path of the profile photo in media storage, e.g. "avatars/<random>.webp". Empty when none.
    avatar = models.CharField(max_length=120, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["email"]
        constraints = [
            models.UniqueConstraint(Lower("username"), name="unique_username_ci"),
        ]

    def __str__(self):
        return self.full_name or self.email

    @property
    def full_name(self):
        return " ".join(part for part in (self.first_name, self.last_name) if part).strip() or self.display_name


def hash_key(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


class UserSession(models.Model):
    """
    One signed-in browser or device. Only a hash of the key is stored, so a database leak does not
    expose usable sessions. Sessions expire after CMS_TOKEN_TTL_DAYS and can be revoked one by one.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sessions")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    user_agent = models.CharField(max_length=300, blank=True)
    ip_address = models.CharField(max_length=64, blank=True)

    class Meta:
        ordering = ["-last_used_at", "-id"]

    def __str__(self):
        return f"{self.user} since {self.created_at:%Y-%m-%d}"

    @classmethod
    def issue(cls, user, *, user_agent="", ip_address=""):
        raw = secrets.token_urlsafe(32)
        session = cls.objects.create(
            user=user, key_hash=hash_key(raw), user_agent=user_agent[:300], ip_address=ip_address[:64]
        )
        return session, raw


class Invitation(models.Model):
    """A one-time link that lets a new user choose their password. Only a hash of the token is stored."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invitations")
    token_hash = models.CharField(max_length=64, unique=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class SetupLock(models.Model):
    """
    One row per completed first-run setup. The unique key makes the database
    reject a second concurrent bootstrap, even when both requests pass the
    "no users yet" check at the same time.
    """

    key = models.CharField(max_length=32, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.key
