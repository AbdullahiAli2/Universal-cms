from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Append-only record of changes. Entries are never edited by the application."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_entries",
    )
    website = models.ForeignKey(
        "websites.Website",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_entries",
    )
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=64, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    summary = models.CharField(max_length=255)
    # Where the change came from. Empty for changes made outside a request, such as scheduled publishing.
    method = models.CharField(max_length=10, blank=True)
    path = models.CharField(max_length=300, blank=True)
    ip_address = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "audit logs"

    def __str__(self):
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.action}"
