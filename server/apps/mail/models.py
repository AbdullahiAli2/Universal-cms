from django.conf import settings
from django.db import models


class Security(models.TextChoices):
    STARTTLS = "starttls", "STARTTLS (usually port 587)"
    SSL = "ssl", "SSL/TLS (usually port 465)"
    NONE = "none", "None (not recommended)"


class EmailSettings(models.Model):
    """
    How this installation sends email (invitations and other system messages). One row, id 1.
    The password is stored encrypted and never sent back to the browser.
    """

    enabled = models.BooleanField(default=False)
    # A label for the preset chosen in the dashboard; every provider here is reached over SMTP.
    provider = models.CharField(max_length=30, default="smtp")
    host = models.CharField(max_length=253, blank=True)
    port = models.PositiveIntegerField(default=587)
    security = models.CharField(max_length=10, choices=Security.choices, default=Security.STARTTLS)
    username = models.CharField(max_length=254, blank=True)
    password_encrypted = models.TextField(blank=True)
    from_name = models.CharField(max_length=100, blank=True)
    from_email = models.EmailField(blank=True)
    reply_to = models.EmailField(blank=True)
    timeout = models.PositiveIntegerField(default=15)
    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_ok = models.BooleanField(null=True, blank=True)
    last_test_error = models.CharField(max_length=300, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "email settings"

    def __str__(self):
        return f"Email via {self.host or 'not set'}"

    @classmethod
    def load(cls):
        settings_row, _created = cls.objects.get_or_create(pk=1)
        return settings_row
