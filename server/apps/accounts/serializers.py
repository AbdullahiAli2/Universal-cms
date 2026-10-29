import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .avatars import avatar_url
from .models import Language, Theme, User, UserSession

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,29}$")


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "display_name", "first_name", "last_name", "full_name", "username", "language", "theme",
            "is_superuser", "date_joined", "last_login", "avatar_url",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj):
        return avatar_url(obj)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


def _check_password(password, user=None):
    try:
        validate_password(password, user)
    except DjangoValidationError as error:
        raise serializers.ValidationError(list(error.messages))
    return password


class BootstrapSerializer(serializers.Serializer):
    """First-run setup: creates the platform administrator."""

    email = serializers.EmailField()
    display_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False, min_length=12)

    def validate(self, attrs):
        try:
            validate_password(attrs["password"])
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)})
        return attrs


def clean_username(value, user=None):
    value = (value or "").strip().lower()
    if not value:
        return None
    if not USERNAME_RE.match(value):
        raise serializers.ValidationError("Use 3–30 lowercase letters, numbers, dots, dashes or underscores.")
    taken = User.objects.filter(username__iexact=value)
    if user is not None:
        taken = taken.exclude(pk=user.pk)
    if taken.exists():
        raise serializers.ValidationError("This username is taken.")
    return value


class ProfileSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    username = serializers.CharField(max_length=30, required=False, allow_blank=True)
    email = serializers.EmailField(required=False)
    language = serializers.ChoiceField(choices=Language.choices, required=False)
    theme = serializers.ChoiceField(choices=Theme.choices, required=False)
    # Needed only to change the email address, which is also the sign-in name.
    current_password = serializers.CharField(required=False, write_only=True, trim_whitespace=False)

    def validate_username(self, value):
        return clean_username(value, self.context["user"])

    def validate_email(self, value):
        value = User.objects.normalize_email(value).strip()
        if User.objects.filter(email__iexact=value).exclude(pk=self.context["user"].pk).exists():
            raise serializers.ValidationError("Another account uses this email address.")
        return value

    def validate(self, attrs):
        user = self.context["user"]
        if "email" in attrs and attrs["email"].lower() != user.email.lower():
            if not user.check_password(attrs.get("current_password") or ""):
                raise serializers.ValidationError({"current_password": ["Enter your current password to change your email."]})
        attrs.pop("current_password", None)
        for field in ("first_name", "last_name"):
            if field in attrs:
                attrs[field] = attrs[field].strip()
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False, min_length=12)

    def validate(self, attrs):
        user = self.context["user"]
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": ["Your current password is not correct."]})
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({"new_password": ["Choose a password you have not used here before."]})
        try:
            validate_password(attrs["new_password"], user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"new_password": list(error.messages)})
        return attrs


class SessionSerializer(serializers.ModelSerializer):
    current = serializers.SerializerMethodField()

    def to_representation(self, obj):
        from apps.audit.agent import describe_agent, describe_ip  # audit depends on accounts

        data = super().to_representation(obj)
        data.update(describe_agent(obj.user_agent))
        data.update(describe_ip(obj.ip_address))
        return data

    class Meta:
        model = UserSession
        fields = ["id", "created_at", "last_used_at", "user_agent", "ip_address", "current"]
        read_only_fields = fields

    def get_current(self, obj):
        current = self.context.get("current")
        return current is not None and obj.pk == current.pk


class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=100)
    password = serializers.CharField(trim_whitespace=False, min_length=12)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
