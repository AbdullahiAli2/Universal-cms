from django.contrib import admin

from .models import ContentType, Entry


@admin.register(ContentType)
class ContentTypeAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "website", "is_builtin")
    list_filter = ("is_builtin",)
    search_fields = ("name", "key", "website__name")


@admin.register(Entry)
class EntryAdmin(admin.ModelAdmin):
    list_display = ("title", "content_type", "website", "status", "updated_at")
    list_filter = ("status",)
    search_fields = ("title", "website__name")
    readonly_fields = ("version", "created_at", "updated_at")
