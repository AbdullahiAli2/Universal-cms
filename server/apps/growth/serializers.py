import re

from rest_framework import serializers

from apps.websites.serializers import HOSTNAME_RE

from .models import SeoSettings

GA4_ID = re.compile(r"^G-[A-Z0-9]{4,15}$")
VERIFICATION = re.compile(r"^[A-Za-z0-9_\-]{10,100}$")


class SeoSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SeoSettings
        fields = [
            "title_template", "default_description", "allow_indexing", "google_site_verification",
            "bing_site_verification", "ga4_measurement_id", "plausible_domain", "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def validate_title_template(self, value):
        value = value.strip()
        if "{title}" not in value:
            raise serializers.ValidationError("Include {title}, where the page title goes.")
        return value

    def validate_ga4_measurement_id(self, value):
        value = value.strip().upper()
        if value and not GA4_ID.match(value):
            raise serializers.ValidationError("A Google Analytics 4 ID looks like G-XXXXXXXXXX.")
        return value

    def validate_plausible_domain(self, value):
        value = value.strip().lower()
        if value and not HOSTNAME_RE.match(value):
            raise serializers.ValidationError("Enter the domain registered in Plausible, such as example.com.")
        return value

    def _token(self, value):
        value = value.strip()
        if 'content="' in value:  # accept the whole <meta> tag pasted from the search console
            value = value.split('content="', 1)[1].split('"', 1)[0]
        if value and not VERIFICATION.match(value):
            raise serializers.ValidationError("Paste the verification code from the search console.")
        return value

    def validate_google_site_verification(self, value):
        return self._token(value)

    def validate_bing_site_verification(self, value):
        return self._token(value)
