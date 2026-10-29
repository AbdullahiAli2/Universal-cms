import re
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers

from .models import Membership, Role, Website, WebsiteSource

HOSTNAME_RE = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
LANGUAGE_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$")
ASSIGNABLE_ROLES = [role.value for role in Role if role is not Role.OWNER]

# Deliberately generic: it confirms the domain is unavailable but never says which website or tenant holds it.
DOMAIN_UNAVAILABLE = "This domain cannot be used. Choose a different domain, or check with the administrator who manages it."


class WebsiteSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = Website
        fields = [
            "id",
            "name",
            "slug",
            "description",
            "website_type",
            "default_language",
            "primary_domain",
            "timezone",
            "status",
            "source",
            "frontend_url",
            "frontend_framework",
            "is_default",
            "role",
            "permissions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "slug", "is_default", "created_at", "updated_at"]
        # validate() checks uniqueness itself, with a message that does not confirm who owns the domain.
        extra_kwargs = {"primary_domain": {"validators": []}}

    permissions = serializers.SerializerMethodField()

    def get_role(self, obj):
        return getattr(obj, "my_role", None)

    def get_permissions(self, obj):
        """The caller's permission codes here, so the dashboard shows only what they can do."""
        from .permissions import user_permissions

        return sorted(user_permissions(obj))

    def validate_timezone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError("Choose a valid time zone, for example Africa/Nairobi or UTC.")
        return value

    def validate_default_language(self, value):
        if not LANGUAGE_RE.match(value):
            raise serializers.ValidationError("Use a language code such as en, fr or ar-EG.")
        return value

    def validate_frontend_url(self, value):
        value = (value or "").strip()
        if not value:
            return ""
        try:
            parts = urlsplit(value)
            port = parts.port
        except ValueError:
            parts, port = None, None
        if parts is None or parts.scheme not in ("http", "https") or not parts.hostname:
            raise serializers.ValidationError(
                "Enter the full address, starting with https://, for example https://www.example.com."
            )
        if parts.username or parts.password:
            raise serializers.ValidationError("Leave out any user name or password from the address.")
        if parts.query or parts.fragment:
            raise serializers.ValidationError("Enter the address without ? or # parts.")
        port_part = f":{port}" if port else ""
        return f"{parts.scheme}://{parts.hostname}{port_part}{parts.path.rstrip('/')}"

    def validate_primary_domain(self, value):
        value = (value or "").strip().lower()
        if not value:
            return None
        if not HOSTNAME_RE.match(value):
            raise serializers.ValidationError(
                "Enter a host name only, such as news.example.com (no https:// and no path)."
            )
        return value

    def validate(self, attrs):
        if self.instance is not None:
            attrs.pop("source", None)  # how a website was registered is fixed once it exists
        source = self.instance.source if self.instance is not None else attrs.get("source", WebsiteSource.CREATED)
        frontend_url = attrs.get("frontend_url", self.instance.frontend_url if self.instance else "")
        if source == WebsiteSource.CONNECTED and not frontend_url:
            raise serializers.ValidationError({"frontend_url": ["Enter the address of the website you are connecting."]})
        derived = False
        if self.instance is None and source == WebsiteSource.CONNECTED and not attrs.get("primary_domain"):
            # Fill the domain from the address so owners do not type it twice. Addresses such as
            # http://localhost:3000 have no public domain and leave it empty.
            host = (urlsplit(frontend_url).hostname or "").lower()
            if HOSTNAME_RE.match(host):
                attrs["primary_domain"] = host
                derived = True

        domain = attrs.get("primary_domain")
        if domain:
            from apps.branding.models import Domain  # branding depends on websites

            taken = Website.objects.filter(primary_domain=domain)
            claimed = Domain.objects.filter(hostname=domain)
            if self.instance is not None:
                taken = taken.exclude(pk=self.instance.pk)
                claimed = claimed.exclude(website=self.instance)
            if taken.exists() or claimed.exists():
                # A domain filled in from the address is reported on the address, the field the owner typed.
                raise serializers.ValidationError({"frontend_url" if derived else "primary_domain": [DOMAIN_UNAVAILABLE]})
        return attrs


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    display_name = serializers.CharField(source="user.display_name", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True, allow_null=True)
    is_active = serializers.BooleanField(source="user.is_active", read_only=True)
    is_superuser = serializers.BooleanField(source="user.is_superuser", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True, allow_null=True)
    status = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = [
            "id", "user_id", "email", "display_name", "first_name", "last_name", "username", "role", "is_active",
            "is_superuser", "last_login", "status", "avatar_url", "created_at",
        ]
        read_only_fields = fields

    def get_avatar_url(self, obj):
        from apps.accounts.avatars import avatar_url

        return avatar_url(obj.user)

    def get_status(self, obj):
        user = obj.user
        if not user.is_active:
            return "disabled"
        if not user.has_usable_password():
            return "invited"
        return "active"


class MemberInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ASSIGNABLE_ROLES)
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)


class MemberRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.values)


class MemberUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.values, required=False)
    # Account fields. They change the person's account everywhere, so only platform administrators may set them.
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class RolePermissionsSerializer(serializers.Serializer):
    permissions = serializers.ListField(child=serializers.CharField(max_length=80), max_length=500)
