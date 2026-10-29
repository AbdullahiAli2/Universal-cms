from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import SetupLock, User


class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("email", "display_name")


class CustomUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm
    ordering = ("email",)
    list_display = ("email", "display_name", "is_staff", "is_active")
    search_fields = ("email", "display_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("display_name", "first_name", "last_name")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "display_name", "password1", "password2")}),)


@admin.register(SetupLock)
class SetupLockAdmin(admin.ModelAdmin):
    list_display = ("key", "created_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
