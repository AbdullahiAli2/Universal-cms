import re

from rest_framework import serializers

from apps.media.models import MediaAsset, MediaKind
from apps.media.serializers import MediaAssetSerializer
from apps.websites.serializers import HOSTNAME_RE

from .models import Branding, Domain

HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
SOCIAL_NETWORKS = ["facebook", "x", "linkedin", "youtube", "instagram", "tiktok", "whatsapp", "telegram"]
# Fonts the dashboard offers. Frontends load them themselves, usually from Google Fonts.
FONTS = [
    "Inter", "Plus Jakarta Sans", "Source Serif 4", "Merriweather", "Lora", "Playfair Display", "Roboto", "Open Sans",
    "Lato", "Montserrat", "Poppins", "Noto Sans", "Noto Naskh Arabic", "Tajawal", "Cairo",
]


class MediaRefField(serializers.PrimaryKeyRelatedField):
    """An image from the same website's media library, or null."""

    def get_queryset(self):
        return MediaAsset.objects.filter(website=self.context["website"], kind=MediaKind.IMAGE)

    default_error_messages = {"does_not_exist": "Choose an image from this website's media library."}


class SocialLinkSerializer(serializers.Serializer):
    network = serializers.ChoiceField(choices=SOCIAL_NETWORKS)
    url = serializers.URLField(max_length=500)


class BrandingSerializer(serializers.ModelSerializer):
    logo = MediaRefField(allow_null=True, required=False)
    logo_reversed = MediaRefField(allow_null=True, required=False)
    icon = MediaRefField(allow_null=True, required=False)
    share_image = MediaRefField(allow_null=True, required=False)
    socials = SocialLinkSerializer(many=True, required=False)
    heading_font = serializers.ChoiceField(choices=[""] + FONTS, required=False)
    body_font = serializers.ChoiceField(choices=[""] + FONTS, required=False)

    class Meta:
        model = Branding
        fields = [
            "tagline", "logo", "logo_reversed", "icon", "share_image", "primary_color", "accent_color",
            "heading_font", "body_font", "contact_email", "contact_phone", "address", "office_hours", "maps_url",
            "socials", "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_primary_color(self, value):
        return self._color(value)

    def validate_accent_color(self, value):
        return self._color(value)

    def _color(self, value):
        if value and not HEX_COLOR.match(value):
            raise serializers.ValidationError("Use a hex colour such as #064b63.")
        return value.lower()

    def validate_socials(self, value):
        if len(value) > 12:
            raise serializers.ValidationError("Add up to 12 links.")
        return value

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Include the chosen images, so the page can show them without another request.
        context = {**self.context}
        data["assets"] = {
            field: MediaAssetSerializer(getattr(instance, field), context=context).data if getattr(instance, field) else None
            for field in ("logo", "logo_reversed", "icon", "share_image")
        }
        return data


class DomainSerializer(serializers.ModelSerializer):
    is_primary = serializers.SerializerMethodField()
    record_name = serializers.CharField(read_only=True)
    record_value = serializers.CharField(read_only=True)

    class Meta:
        model = Domain
        fields = [
            "id", "hostname", "is_primary", "verified_at", "last_checked_at", "last_error", "record_name",
            "record_value", "created_at",
        ]
        read_only_fields = fields

    def get_is_primary(self, obj):
        return obj.hostname == self.context["website"].primary_domain


class AddDomainSerializer(serializers.Serializer):
    hostname = serializers.CharField(max_length=253)

    def validate_hostname(self, value):
        value = value.strip().lower().rstrip(".")
        if value.startswith(("http://", "https://")):
            value = value.split("://", 1)[1].split("/", 1)[0]
        if not HOSTNAME_RE.match(value):
            raise serializers.ValidationError("Enter a host name only, such as www.example.com.")
        return value
