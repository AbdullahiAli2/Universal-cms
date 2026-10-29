import ipaddress
import re

from rest_framework import serializers

from .models import EmailSettings

# Public names (smtp.example.com) and local ones: localhost or a Docker service such as "mailpit".
SERVER_NAME = re.compile(r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$")

PROVIDERS = ["smtp", "gmail", "outlook", "sendgrid", "mailgun", "ses", "brevo", "postmark"]


class EmailSettingsSerializer(serializers.ModelSerializer):
    # Write-only. Leave it out to keep the saved password; send "" to clear it.
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False, max_length=500)
    has_password = serializers.SerializerMethodField()
    provider = serializers.ChoiceField(choices=PROVIDERS, required=False)
    updated_by_email = serializers.EmailField(source="updated_by.email", read_only=True, allow_null=True)

    class Meta:
        model = EmailSettings
        fields = [
            "enabled", "provider", "host", "port", "security", "username", "password", "has_password", "from_name",
            "from_email", "reply_to", "timeout", "last_test_at", "last_test_ok", "last_test_error", "updated_by_email",
            "updated_at",
        ]
        read_only_fields = ["has_password", "last_test_at", "last_test_ok", "last_test_error", "updated_by_email", "updated_at"]

    def get_has_password(self, obj):
        return bool(obj.password_encrypted)

    def validate_host(self, value):
        value = value.strip().lower()
        if not value:
            return value
        try:
            ipaddress.ip_address(value.strip("[]"))
            return value.strip("[]")
        except ValueError:
            pass
        if not SERVER_NAME.match(value):
            raise serializers.ValidationError("Enter the server's host name or IP address, such as smtp.example.com.")
        return value

    def validate_port(self, value):
        if not 1 <= value <= 65535:
            raise serializers.ValidationError("Enter a port between 1 and 65535.")
        return value

    def validate_timeout(self, value):
        if not 3 <= value <= 60:
            raise serializers.ValidationError("Use 3 to 60 seconds.")
        return value

    def validate_from_name(self, value):
        if any(char in value for char in "\r\n<>\""):
            raise serializers.ValidationError("Use letters, numbers and spaces only.")
        return value.strip()

    def validate(self, attrs):
        merged = {field: attrs.get(field, getattr(self.instance, field, "")) for field in ("enabled", "host", "from_email")}
        if merged["enabled"]:
            missing = {field: ["Required to send email."] for field in ("host", "from_email") if not merged[field]}
            if missing:
                raise serializers.ValidationError(missing)
        return attrs


class TestEmailSerializer(serializers.Serializer):
    to = serializers.EmailField()
