from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.websites.permissions import get_visible_website

from . import services
from .serializers import FONTS, SOCIAL_NETWORKS, AddDomainSerializer, BrandingSerializer, DomainSerializer


class BrandingView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        context = {"request": request, "website": website}
        data = BrandingSerializer(services.get_branding(website), context=context).data
        data["options"] = {"fonts": FONTS, "social_networks": SOCIAL_NETWORKS}
        return Response(data)

    def patch(self, request, slug):
        website = get_visible_website(request.user, slug)
        context = {"request": request, "website": website}
        serializer = BrandingSerializer(services.get_branding(website), data=request.data, partial=True, context=context)
        serializer.is_valid(raise_exception=True)
        branding = services.update_branding(website, request.user, dict(serializer.validated_data))
        data = BrandingSerializer(branding, context=context).data
        data["options"] = {"fonts": FONTS, "social_networks": SOCIAL_NETWORKS}
        return Response(data)


class DomainListView(APIView):
    def get(self, request, slug):
        website = get_visible_website(request.user, slug)
        return Response(DomainSerializer(services.list_domains(website), many=True, context={"website": website}).data)

    def post(self, request, slug):
        website = get_visible_website(request.user, slug)
        serializer = AddDomainSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        domain = services.add_domain(website, request.user, serializer.validated_data["hostname"])
        return Response(DomainSerializer(domain, context={"website": website}).data, status=status.HTTP_201_CREATED)


class DomainDetailView(APIView):
    def delete(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        services.remove_domain(website, request.user, pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DomainVerifyView(APIView):
    def post(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        domain = services.verify_domain(website, request.user, pk)
        return Response(DomainSerializer(domain, context={"website": website}).data)


class DomainPrimaryView(APIView):
    def post(self, request, slug, pk):
        website = get_visible_website(request.user, slug)
        domain = services.make_primary(website, request.user, pk)
        return Response(DomainSerializer(domain, context={"website": website}).data)
