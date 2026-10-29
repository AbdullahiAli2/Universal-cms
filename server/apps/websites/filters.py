from django_filters import rest_framework as filters

from .models import Website


class WebsiteFilter(filters.FilterSet):
    class Meta:
        model = Website
        fields = {"website_type": ["exact"], "status": ["exact"], "source": ["exact"]}
