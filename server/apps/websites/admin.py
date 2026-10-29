from django.contrib import admin

from .models import Membership, Website


class MembershipInline(admin.TabularInline):
    model = Membership
    extra = 0
    autocomplete_fields = ["user"]


@admin.register(Website)
class WebsiteAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "website_type", "source", "status", "primary_domain")
    list_filter = ("website_type", "source", "status")
    search_fields = ("name", "slug", "primary_domain")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [MembershipInline]
