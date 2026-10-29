from django.db.models import Q, Sum
from django.http import Http404
from django.views.static import serve
from rest_framework import status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.websites.permissions import get_visible_website

from . import services
from .models import MediaAsset, MediaKind
from .serializers import MediaAssetSerializer, MediaDetailsSerializer, UploadSerializer


SORTS = {
    "recent": ("-updated_at", "-id"),
    "oldest": ("created_at", "id"),
    "newest": ("-created_at", "-id"),
    "name": ("title", "id"),
    "-name": ("-title", "-id"),
    "size": ("-size", "-id"),
}


class MediaPagination(PageNumberPagination):
    page_size = 48


class MediaListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        assets = MediaAsset.objects.filter(website=website).select_related("uploaded_by")
        assets = assets.order_by(*SORTS.get(request.query_params.get("sort", ""), SORTS["recent"]))
        if (kind := request.query_params.get("kind")) in MediaKind.values:
            assets = assets.filter(kind=kind)
        if ids := request.query_params.get("ids"):
            # For showing chosen files, e.g. a gallery. Unknown or foreign ids are simply not returned.
            wanted = [int(value) for value in ids.split(",")[:100] if value.isdigit()]
            assets = assets.filter(pk__in=wanted)
        if search := request.query_params.get("search", "").strip():
            assets = assets.filter(Q(title__icontains=search) | Q(alt_text__icontains=search) | Q(caption__icontains=search))
        paginator = MediaPagination()
        page = paginator.paginate_queryset(assets, request, view=self)
        context = {"request": request, "website": website}
        response = paginator.get_paginated_response(MediaAssetSerializer(page, many=True, context=context).data)
        totals = MediaAsset.objects.filter(website=website)
        response.data["totals"] = {
            "all": totals.count(),
            **{kind: totals.filter(kind=kind).count() for kind in MediaKind.values},
            "bytes": totals.aggregate(total=Sum("size"))["total"] or 0,
        }
        return response

    def post(self, request, slug):
        website = get_visible_website(request.user, slug)
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        details = {key: data.get(key, "") for key in ("caption", "credit")}
        if data.get("file"):
            asset = services.upload_file(
                website, request.user, data["file"], title=data.get("title", ""), alt_text=data.get("alt_text", ""), **details
            )
        else:
            asset = services.add_video(website, request.user, embed_url=data["embed_url"], title=data["title"], **details)
        context = {"request": request, "website": website}
        return Response(MediaAssetSerializer(asset, context=context).data, status=status.HTTP_201_CREATED)


class MediaDetailView(APIView):
    def get(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        asset = services.get_asset(website, pk)
        data = MediaAssetSerializer(asset, context={"request": request, "website": website}).data
        data["used_in"] = services.usage(website, asset.pk)
        return Response(data)

    def patch(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        serializer = MediaDetailsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        asset = services.update_asset(website, request.user, pk, dict(serializer.validated_data))
        return Response(MediaAssetSerializer(asset, context={"request": request, "website": website}).data)

    def delete(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        services.delete_asset(website, request.user, pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


def serve_media(request, path):
    """
    Serves uploaded files. Names are random, so only someone given the address can fetch a file.
    Headers stop a file from ever running as a page, and let other sites embed images and PDFs.
    """
    from django.conf import settings

    if request.method not in ("GET", "HEAD"):
        raise Http404
    response = serve(request, path, document_root=settings.MEDIA_ROOT)
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
    response["Cross-Origin-Resource-Policy"] = "cross-origin"
    response["Cache-Control"] = "public, max-age=31536000, immutable"
    return response
