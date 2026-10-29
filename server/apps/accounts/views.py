from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit import services as audit

from . import avatars, services
from .models import SetupLock, User, UserSession
from .serializers import (
    BootstrapSerializer,
    InvitationAcceptSerializer,
    LoginSerializer,
    PasswordChangeSerializer,
    ProfileSerializer,
    SessionSerializer,
    UserSerializer,
)
from .throttles import LoginEmailThrottle

SETUP_LOCK_KEY = "bootstrap"


def _signed_in(user, request):
    return {"token": services.issue_session(user, request), "user": UserSerializer(user).data}


class AuthStatusView(APIView):
    """Tells the dashboard whether first-run setup is still needed."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"initialized": User.objects.exists()})


class _SetupAlreadyDone(Exception):
    pass


class BootstrapView(APIView):
    """Creates the first administrator and the default workspace. Only one request can ever succeed."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=BootstrapSerializer, responses={201: None, 409: None})
    def post(self, request):
        from apps.websites.services import ensure_default_workspace  # websites depends on accounts

        serializer = BootstrapSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        already = Response(
            {"detail": "This installation is already set up. Sign in instead."},
            status=status.HTTP_409_CONFLICT,
        )
        try:
            with transaction.atomic():
                # Insert the lock first. If another request already committed it, this raises IntegrityError
                # and the whole transaction rolls back, so no second administrator can be created.
                SetupLock.objects.create(key=SETUP_LOCK_KEY)
                if User.objects.exists():
                    raise _SetupAlreadyDone()
                name = data["display_name"].strip()
                first, _space, last = name.partition(" ")
                user = User.objects.create_superuser(
                    email=data["email"], password=data["password"], display_name=name, first_name=first, last_name=last
                )
                audit.record(action="auth.bootstrap", actor=user, summary=f"Created platform administrator {user.email}")
                ensure_default_workspace(user)
        except (IntegrityError, _SetupAlreadyDone):
            return already
        return Response(_signed_in(user, request), status=status.HTTP_201_CREATED)


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle, LoginEmailThrottle]
    throttle_scope = "login"

    @extend_schema(request=LoginSerializer, responses={200: None, 401: None})
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(
            request,
            username=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )
        if user is None:
            audit.record(action="auth.login_failed", summary="Failed sign-in attempt")
            return Response(
                {"detail": "Email or password is incorrect."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        audit.record(action="auth.login", actor=user, summary=f"{user.email} signed in")
        return Response(_signed_in(user, request))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        user = request.user
        serializer = ProfileSerializer(data=request.data, partial=True, context={"user": user})
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        for field, value in changes.items():
            setattr(user, field, value)
        if {"first_name", "last_name"} & changes.keys():
            user.display_name = user.full_name
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            raise ValidationError({"username": ["This username is taken."]})
        quiet = {"language", "theme"}  # preferences are not worth an audit entry
        if changes.keys() - quiet:
            audit.record(
                action="profile.updated", actor=user, target=user,
                summary=f"Updated profile: {', '.join(sorted(changes.keys() - quiet))}",
            )
        return Response(UserSerializer(user).data)


class AvatarView(APIView):
    """Upload (multipart field "avatar") or remove your profile photo."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get("avatar")
        if upload is None:
            raise ValidationError({"avatar": ["Choose a photo to upload."]})
        avatars.replace(request.user, upload)
        audit.record(action="profile.avatar_updated", actor=request.user, target=request.user, summary="Changed profile photo")
        return Response(UserSerializer(request.user).data)

    def delete(self, request):
        avatars.remove(request.user)
        audit.record(action="profile.avatar_removed", actor=request.user, target=request.user, summary="Removed profile photo")
        return Response(UserSerializer(request.user).data)


class PasswordChangeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        serializer = PasswordChangeSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        # Anyone who learned the old password loses access; this browser stays signed in.
        ended = services.revoke_sessions(user, keep=request.auth)
        audit.record(
            action="auth.password_changed", actor=user, target=user,
            summary=f"Changed password and signed out {ended} other session{'s' if ended != 1 else ''}",
        )
        return Response({"other_sessions_ended": ended})


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = UserSession.objects.filter(user=request.user)
        return Response(SessionSerializer(sessions, many=True, context={"current": request.auth}).data)


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        session = UserSession.objects.filter(user=request.user, pk=pk).first()
        if session is None:
            raise NotFound("Session not found.")
        session.delete()
        audit.record(action="auth.session_revoked", actor=request.user, summary="Signed out a session")
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionRevokeOthersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ended = services.revoke_sessions(request.user, keep=request.auth)
        if ended:
            audit.record(action="auth.session_revoked", actor=request.user, summary=f"Signed out {ended} other session(s)")
        return Response({"ended": ended})


class InvitationView(APIView):
    """Lets the invitation page show who the invitation is for before the password is chosen."""

    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def get(self, request):
        invitation = services.find_invitation(request.query_params.get("token", ""))
        if invitation is None:
            return Response({"valid": False})
        user = invitation.user
        return Response({"valid": True, "email": user.email, "first_name": user.first_name, "last_name": user.last_name})


class InvitationAcceptView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        serializer = InvitationAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        with transaction.atomic():
            invitation = services.find_invitation(data["token"])
            if invitation is None:
                raise ValidationError({"token": ["This invitation link has expired or was already used. Ask for a new one."]})
            user = invitation.user
            try:
                validate_password(data["password"], user)
            except DjangoValidationError as error:
                raise ValidationError({"password": list(error.messages)})
            for field in ("first_name", "last_name"):
                if data.get(field, "").strip():
                    setattr(user, field, data[field].strip())
            user.display_name = user.full_name
            user.set_password(data["password"])
            user.save()
            invitation.used_at = timezone.now()
            invitation.save(update_fields=["used_at"])
            audit.record(action="auth.invitation_accepted", actor=user, target=user, summary=f"{user.email} accepted the invitation")
        return Response(_signed_in(user, request), status=status.HTTP_201_CREATED)
