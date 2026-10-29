from django.contrib import admin

from .models import MediaAsset


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "website", "size", "created_at")
    list_filter = ("kind",)
    search_fields = ("title", "website__name")
