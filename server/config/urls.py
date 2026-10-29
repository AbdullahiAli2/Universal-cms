from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import HealthView
from apps.media.views import serve_media
from apps.websites.views import WorkspaceView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", HealthView.as_view(), name="health"),
    path("api/v1/auth/", include("apps.accounts.urls")),
    path("api/v1/websites/", include("apps.websites.urls")),
    path("api/v1/workspace/", WorkspaceView.as_view(), name="workspace"),
    path("api/v1/settings/", include("apps.mail.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="api-docs"),
    re_path(r"^media/(?P<path>(?:\d+|avatars)/[0-9a-f]{32}\.(?:jpg|png|webp|gif|pdf))$", serve_media, name="media-file"),
]
