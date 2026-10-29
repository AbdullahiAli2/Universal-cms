from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.audit import services as audit

from . import services
from .crypto import encrypt
from .models import EmailSettings
from .serializers import EmailSettingsSerializer, TestEmailSerializer


def _require_platform_admin(user):
    # Email settings serve the whole installation, so only platform administrators manage them.
    if not user.is_superuser:
        raise PermissionDenied("Only platform administrators can manage email settings.")


class TestEmailThrottle(UserRateThrottle):
    scope = "email_test"
    rate = "10/hour"


class EmailSettingsView(APIView):
    def get(self, request):
        _require_platform_admin(request.user)
        return Response(EmailSettingsSerializer(EmailSettings.load()).data)

    def put(self, request):
        _require_platform_admin(request.user)
        config = EmailSettings.load()
        serializer = EmailSettingsSerializer(config, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "password" in data:
            config.password_encrypted = encrypt(data.pop("password"))
        for field, value in data.items():
            setattr(config, field, value)
        config.updated_by = request.user
        config.save()
        changed = sorted(set(serializer.validated_data) - {"password"}) + (["password"] if "password" in serializer.validated_data else [])
        audit.record(action="email.settings_updated", actor=request.user, summary=f"Updated email settings: {', '.join(changed)}"[:255])
        return Response(EmailSettingsSerializer(config).data)


class TestEmailView(APIView):
    throttle_classes = [TestEmailThrottle]

    def post(self, request):
        _require_platform_admin(request.user)
        serializer = TestEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        config = EmailSettings.load()
        if not config.host or not config.from_email:
            return Response({"detail": "Save a server and sender address first."}, status=400)
        to = serializer.validated_data["to"]
        ok, error = services.send_test(config, to)
        audit.record(
            action="email.test_sent" if ok else "email.test_failed", actor=request.user,
            summary=f"Test email to {to}: {'sent' if ok else error}"[:255],
        )
        return Response({"ok": ok, "error": error, "settings": EmailSettingsSerializer(config).data})
