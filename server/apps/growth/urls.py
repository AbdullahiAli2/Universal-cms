from django.urls import path

from . import views

# Mounted under /api/v1/websites/<slug>/.
urlpatterns = [
    path("seo/", views.SeoSettingsView.as_view(), name="seo-settings"),
    path("growth/", views.GrowthReportView.as_view(), name="growth"),
]
