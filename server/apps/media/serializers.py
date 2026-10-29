import re
from urllib.parse import urlsplit

from django.conf import settings
from rest_framework import serializers

from . import services
from .models import MediaAsset

FOCAL_POINT = re.compile(r"^(100|[1-9]?\d)% (100|[1-9]?\d)%$")


def file_path(asset):
    """Path on this server, e.g. /media/3/ab12….jpg. The dashboard serves it through its own /media route."""
    return f"{settings.MEDIA_URL}{asset.file.name}" if asset.file else ""


def public_file_url(asset):
    """Absolute address for websites to use, when the administrator has published the API address."""
    if not asset.file or not settings.CMS_PUBLIC_API_URL:
        return None
    parts = urlsplit(settings.CMS_PUBLIC_API_URL)
    return f"{parts.scheme}://{parts.netloc}{file_path(asset)}"


class MediaAssetSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    public_url = serializers.SerializerMethodField()
    uploaded_by_email = serializers.EmailField(source="uploaded_by.email", read_only=True, allow_null=True)
    can_change = serializers.SerializerMethodField()

    class Meta:
        model = MediaAsset
        fields = [
            "id", "kind", "title", "url", "public_url", "embed_url", "original_name", "mime_type", "size", "width",
            "height", "alt_text", "caption", "credit", "focal_point", "uploaded_by_email", "created_at", "updated_at",
            "can_change",
        ]
        read_only_fields = fields

    def get_url(self, obj):
        return file_path(obj) or obj.embed_url

    def get_public_url(self, obj):
        return public_file_url(obj)

    def get_can_change(self, obj):
        context = self.context
        return services.can_change(context["website"], context["request"].user, obj) if "website" in context else False


class MediaDetailsSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    alt_text = serializers.CharField(max_length=300, required=False, allow_blank=True)
    caption = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    credit = serializers.CharField(max_length=200, required=False, allow_blank=True)
    focal_point = serializers.CharField(max_length=20, required=False, allow_blank=True)
    embed_url = serializers.CharField(max_length=500, required=False)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give it a name.")
        return value

    def validate_focal_point(self, value):
        if value and not FOCAL_POINT.match(value):
            raise serializers.ValidationError("Use two percentages, for example 50% 30%.")
        return value


class UploadSerializer(MediaDetailsSerializer):
    file = serializers.FileField(required=False)
    title = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get("file") and not attrs.get("embed_url"):
            raise serializers.ValidationError({"file": ["Choose a file to upload, or paste a video link."]})
        if attrs.get("embed_url") and not (attrs.get("title") or "").strip():
            raise serializers.ValidationError({"title": ["Give the video a name."]})
        return attrs
