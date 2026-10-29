from django.urls import path

from . import views

urlpatterns = [
    path("status/", views.AuthStatusView.as_view(), name="auth-status"),
    path("bootstrap/", views.BootstrapView.as_view(), name="auth-bootstrap"),
    path("login/", views.LoginView.as_view(), name="auth-login"),
    path("logout/", views.LogoutView.as_view(), name="auth-logout"),
    path("me/", views.MeView.as_view(), name="auth-me"),
    path("me/password/", views.PasswordChangeView.as_view(), name="auth-password"),
    path("me/avatar/", views.AvatarView.as_view(), name="auth-avatar"),
    path("sessions/", views.SessionListView.as_view(), name="auth-sessions"),
    path("sessions/revoke-others/", views.SessionRevokeOthersView.as_view(), name="auth-sessions-revoke-others"),
    path("sessions/<int:pk>/", views.SessionDetailView.as_view(), name="auth-session-detail"),
    path("invitation/", views.InvitationView.as_view(), name="auth-invitation"),
    path("invitation/accept/", views.InvitationAcceptView.as_view(), name="auth-invitation-accept"),
]
