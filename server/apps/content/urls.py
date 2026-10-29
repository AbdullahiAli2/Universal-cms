from django.urls import path

from . import views

# Mounted under /api/v1/websites/<slug>/ so every route is scoped to one website.
urlpatterns = [
    path("content-types/", views.ContentTypeListView.as_view(), name="content-types"),
    path("entries/", views.EntryListCreateView.as_view(), name="entries"),
    path("entries/<int:pk>/", views.EntryDetailView.as_view(), name="entry-detail"),
    path("entries/<int:pk>/transition/", views.EntryTransitionView.as_view(), name="entry-transition"),
    path("entries/<int:pk>/revisions/", views.EntryRevisionListView.as_view(), name="entry-revisions"),
    path(
        "entries/<int:pk>/revisions/<int:revision_id>/restore/",
        views.EntryRevisionRestoreView.as_view(),
        name="entry-revision-restore",
    ),
]
