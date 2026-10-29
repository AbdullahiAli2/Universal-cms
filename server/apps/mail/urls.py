from django.urls import path

from . import views

# Mounted under /api/v1/settings/.
urlpatterns = [
    path("email/", views.EmailSettingsView.as_view(), name="email-settings"),
    path("email/test/", views.TestEmailView.as_view(), name="email-test"),
]
