from django.urls import include, path

from . import views

urlpatterns = [
    path("", views.WebsiteListCreateView.as_view(), name="website-list"),
    path("<slug:slug>/", views.WebsiteDetailView.as_view(), name="website-detail"),
    path("<slug:slug>/dashboard/", views.WebsiteDashboardView.as_view(), name="website-dashboard"),
    path("<slug:slug>/members/", views.MemberListCreateView.as_view(), name="website-members"),
    path("<slug:slug>/members/<int:pk>/", views.MemberDetailView.as_view(), name="website-member-detail"),
    path("<slug:slug>/members/<int:pk>/invitation/", views.MemberInvitationView.as_view(), name="website-member-invitation"),
    path("<slug:slug>/roles/", views.RoleListView.as_view(), name="website-roles"),
    path("<slug:slug>/roles/<slug:role>/", views.RoleDetailView.as_view(), name="website-role-detail"),
    path("<slug:slug>/audit-logs/", views.AuditLogListView.as_view(), name="website-audit-logs"),
    path("<slug:slug>/", include("apps.content.urls")),
    path("<slug:slug>/", include("apps.media.urls")),
    path("<slug:slug>/", include("apps.branding.urls")),
    path("<slug:slug>/", include("apps.growth.urls")),
]
