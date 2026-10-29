from rest_framework.response import Response
from rest_framework.views import APIView

from apps.content.services import publish_due_entries
from apps.websites.permissions import get_visible_website

from . import services
from .serializers import SeoSettingsSerializer


class SeoSettingsView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        return Response(SeoSettingsSerializer(services.get_settings(website)).data)

    def patch(self, request, slug):
        website = get_visible_website(request.user, slug)
        serializer = SeoSettingsSerializer(services.get_settings(website), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings = services.update_settings(website, request.user, dict(serializer.validated_data))
        return Response(SeoSettingsSerializer(settings).data)


class GrowthReportView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        publish_due_entries(website)
        settings = services.get_settings(website)
        sitemap = services.sitemap_entries(website)
        return Response(
            {
                "output": services.publishing_output(website),
                "seo_health": services.seo_health(website),
                "sitemap": {"count": len(sitemap), "entries": sitemap[:50]},
                "analytics": {
                    "ga4_measurement_id": settings.ga4_measurement_id,
                    "plausible_domain": settings.plausible_domain,
                    "connected": bool(settings.ga4_measurement_id or settings.plausible_domain),
                },
            }
        )
