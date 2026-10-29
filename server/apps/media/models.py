import uuid
from pathlib import Path

from django.conf import settings
from django.db import models


class MediaKind(models.TextChoices):
    IMAGE = "image", "Image"
    DOCUMENT = "document", "Document"
    VIDEO = "video", "Video link"


def asset_path(instance, filename):
    # Random names: files are served without sign-in, so a URL must not be guessable from another one.
    return f"{instance.website_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


class MediaAsset(models.Model):
    website = models.ForeignKey("websites.Website", on_delete=models.CASCADE, related_name="media")
    kind = models.CharField(max_length=20, choices=MediaKind.choices)
    file = models.FileField(upload_to=asset_path, blank=True, max_length=255)
    # For videos: a YouTube or Vimeo embed address. Video files themselves are not stored.
    embed_url = models.URLField(max_length=500, blank=True)
    title = models.CharField(max_length=200)
    original_name = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    alt_text = models.CharField(max_length=300, blank=True)
    caption = models.TextField(blank=True)
    credit = models.CharField(max_length=200, blank=True)
    # CSS object-position, e.g. "60% 55%", so sites crop around the subject.
    focal_point = models.CharField(max_length=20, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["website", "kind"])]

    def __str__(self):
        return self.title
