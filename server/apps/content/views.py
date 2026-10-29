from django.db.models import Count, Q
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.websites.permissions import get_visible_website

from . import services
from .models import ContentType, Entry, EntryStatus
from .serializers import (
    ContentTypeSerializer,
    EntryCreateSerializer,
    EntryListSerializer,
    EntrySerializer,
    EntryUpdateSerializer,
    RestoreSerializer,
    RevisionSerializer,
    TransitionSerializer,
)


def status_counts(website):
    """{content_type_id: {status: count, "total": n}} for one website."""
    rows = Entry.objects.filter(website=website).values("content_type_id", "status").annotate(n=Count("id"))
    counts = {}
    for row in rows:
        bucket = counts.setdefault(row["content_type_id"], {"total": 0})
        bucket[row["status"]] = row["n"]
        bucket["total"] += row["n"]
    return counts


class ContentTypeListView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        services.publish_due_entries(website)
        if not ContentType.objects.filter(website=website).exists():
            services.ensure_builtin_types(website)
        types = ContentType.objects.filter(website=website, key__in=services.readable_type_keys(website))
        context = {"counts": status_counts(website), "website": website}
        return Response(ContentTypeSerializer(types, many=True, context=context).data)


class EntryListCreateView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        services.publish_due_entries(website)
        entries = Entry.objects.filter(website=website, content_type__key__in=services.readable_type_keys(website)).select_related(
            "content_type", "author"
        )

        if type_key := request.query_params.get("type"):
            entries = entries.filter(content_type__key=type_key)
        if wanted := request.query_params.get("status"):
            statuses = [value for value in wanted.split(",") if value in EntryStatus.values]
            entries = entries.filter(status__in=statuses)
        if search := request.query_params.get("search", "").strip():
            entries = entries.filter(Q(title__icontains=search) | Q(summary__icontains=search))
        if request.query_params.get("mine") == "1":
            entries = entries.filter(author=request.user)

        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(entries.order_by("-updated_at", "-id"), request, view=self)
        context = {"request": request, "website": website}
        return paginator.get_paginated_response(EntryListSerializer(page, many=True, context=context).data)

    def post(self, request, slug):
        website = get_visible_website(request.user, slug)
        serializer = EntryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = dict(serializer.validated_data)
        content_type = services.get_content_type(website, fields.pop("type"))
        entry = services.create_entry(website, request.user, content_type, **fields)
        context = {"request": request, "website": website}
        return Response(EntrySerializer(entry, context=context).data, status=status.HTTP_201_CREATED)


class EntryDetailView(APIView):
    def _context(self, request, website):
        return {"request": request, "website": website}

    def get(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        entry = services.get_entry(website, pk)
        return Response(EntrySerializer(entry, context=self._context(request, website)).data)

    def patch(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        serializer = EntryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = dict(serializer.validated_data)
        version = changes.pop("version", None)
        if version is None:
            return Response({"version": ["Send the version you edited."]}, status=status.HTTP_400_BAD_REQUEST)
        entry = services.update_entry(website, request.user, pk, version=version, changes=changes)
        return Response(EntrySerializer(services.get_entry(website, entry.pk), context=self._context(request, website)).data)

    def delete(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        services.delete_entry(website, request.user, pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EntryTransitionView(APIView):
    def post(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        serializer = TransitionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        entry = services.transition_entry(
            website, request.user, pk, data["action"], version=data.get("version"), publish_at=data.get("publish_at")
        )
        context = {"request": request, "website": website}
        return Response(EntrySerializer(services.get_entry(website, entry.pk), context=context).data)


class EntryRevisionListView(APIView):
    def get(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        entry = services.get_entry(website, pk)
        revisions = entry.revisions.select_related("created_by")[:50]
        return Response(RevisionSerializer(revisions, many=True).data)


class EntryRevisionRestoreView(APIView):
    def post(self, request, slug, pk, revision_id):
        website = get_visible_website(request.user, slug)
        serializer = RestoreSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = services.restore_revision(website, request.user, pk, revision_id, version=serializer.validated_data["version"])
        context = {"request": request, "website": website}
        return Response(EntrySerializer(services.get_entry(website, entry.pk), context=context).data)
