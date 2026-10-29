from django.urls import path

from . import views

# Mounted under /api/v1/websites/<slug>/.
urlpatterns = [
    path("branding/", views.BrandingView.as_view(), name="branding"),
    path("domains/", views.DomainListView.as_view(), name="domains"),
    path("domains/<int:pk>/", views.DomainDetailView.as_view(), name="domain-detail"),
    path("domains/<int:pk>/verify/", views.DomainVerifyView.as_view(), name="domain-verify"),
    path("domains/<int:pk>/make-primary/", views.DomainPrimaryView.as_view(), name="domain-primary"),
]
