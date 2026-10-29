from django.urls import path

from . import views

# Mounted under /api/v1/websites/<slug>/.
urlpatterns = [
    path("media/", views.MediaListCreateView.as_view(), name="media"),
    path("media/<int:pk>/", views.MediaDetailView.as_view(), name="media-detail"),
]
