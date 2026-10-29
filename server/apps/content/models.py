from django.conf import settings
from django.db import models


class EntryStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    IN_REVIEW = "in_review", "In review"
    SCHEDULED = "scheduled", "Scheduled"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"


class ContentType(models.Model):
    """
    A kind of content on one website, such as News & Articles or Events.

    Built-in types are created for every website (see builtins.py). `fields` describes the extra,
    type-specific values an entry stores in Entry.data; title, summary and body are common to all.
    """

    website = models.ForeignKey("websites.Website", on_delete=models.CASCADE, related_name="content_types")
    key = models.SlugField(max_length=50)
    name = models.CharField(max_length=80)
    singular_name = models.CharField(max_length=60)
    description = models.CharField(max_length=255, blank=True)
    is_builtin = models.BooleanField(default=False)
    fields = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["website", "key"], name="unique_content_type_key")]

    def __str__(self):
        return f"{self.name} ({self.website})"


class Entry(models.Model):
    # Denormalised from content_type so every query can be scoped to the website directly.
    website = models.ForeignKey("websites.Website", on_delete=models.CASCADE, related_name="entries")
    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT, related_name="entries")
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, allow_unicode=True)
    summary = models.TextField(blank=True)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    # Search and social overrides: title, description, image (media id), canonical_url, noindex.
    seo = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=EntryStatus.choices, default=EntryStatus.DRAFT, db_index=True)
    # For scheduled entries, when they go live. For published entries, when they first went live.
    publish_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="authored_entries"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Increases on every change. Clients send it back so two people cannot silently overwrite each other.
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        verbose_name_plural = "entries"
        constraints = [
            models.UniqueConstraint(fields=["website", "content_type", "slug"], name="unique_entry_slug"),
        ]
        indexes = [models.Index(fields=["website", "content_type", "status"])]

    def __str__(self):
        return self.title


class EntryRevision(models.Model):
    """Snapshot of an entry after each change. Read-only once written."""

    entry = models.ForeignKey(Entry, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, allow_unicode=True)
    summary = models.TextField(blank=True)
    body = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    seo = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=EntryStatus.choices)
    note = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version", "-id"]

    def __str__(self):
        return f"{self.entry} v{self.version}"
