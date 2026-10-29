from django.utils.dateparse import parse_datetime
from rest_framework import serializers

from . import services
from .models import ContentType, Entry, EntryRevision


class ContentTypeSerializer(serializers.ModelSerializer):
    counts = serializers.SerializerMethodField()

    class Meta:
        model = ContentType
        fields = ["key", "name", "singular_name", "description", "is_builtin", "fields", "counts", "can_create"]
        read_only_fields = fields

    can_create = serializers.SerializerMethodField()

    def get_can_create(self, obj):
        website = self.context.get("website")
        return services.can_create(website, obj.key) if website is not None else False

    def get_counts(self, obj):
        return self.context.get("counts", {}).get(obj.pk, {})


class PersonSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    display_name = serializers.CharField()


class EntryListSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source="content_type.key", read_only=True)
    type_name = serializers.CharField(source="content_type.singular_name", read_only=True)
    author = PersonSerializer(read_only=True, allow_null=True)
    allowed_actions = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Entry
        fields = [
            "id", "type", "type_name", "title", "slug", "summary", "status", "publish_at", "published_at",
            "author", "version", "created_at", "updated_at", "allowed_actions", "can_edit",
        ]
        read_only_fields = fields

    def _who(self):
        return self.context["website"], self.context["request"].user

    def get_allowed_actions(self, obj):
        return services.allowed_actions(*self._who(), obj)

    def get_can_edit(self, obj):
        return services.can_edit(*self._who(), obj)


class EntrySerializer(EntryListSerializer):
    can_delete = serializers.SerializerMethodField()
    updated_by_email = serializers.EmailField(source="updated_by.email", read_only=True, allow_null=True)

    class Meta(EntryListSerializer.Meta):
        fields = EntryListSerializer.Meta.fields + ["body", "data", "seo", "can_delete", "updated_by_email"]
        read_only_fields = fields

    def get_can_delete(self, obj):
        return services.can_delete(*self._who(), obj)


class EntryWriteSerializer(serializers.Serializer):
    """Fields an editor can change directly. Status only changes through transitions."""

    title = serializers.CharField(max_length=200)
    slug = serializers.CharField(max_length=200, required=False, allow_blank=True)
    summary = serializers.CharField(max_length=1000, required=False, allow_blank=True, trim_whitespace=False)
    body = serializers.CharField(max_length=200_000, required=False, allow_blank=True, trim_whitespace=False)
    data = serializers.DictField(required=False)
    seo = serializers.DictField(required=False)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give it a title.")
        return value


class EntryCreateSerializer(EntryWriteSerializer):
    type = serializers.SlugField(max_length=50)


class EntryUpdateSerializer(EntryWriteSerializer):
    title = serializers.CharField(max_length=200, required=False)
    version = serializers.IntegerField(min_value=1)


class TransitionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=sorted(services.TRANSITIONS))
    version = serializers.IntegerField(min_value=1, required=False)
    # Parsed here rather than by DateTimeField, which would read a time without a zone as UTC.
    # The service reads such times in the website's own time zone.
    publish_at = serializers.CharField(required=False)

    def validate_publish_at(self, value):
        try:
            parsed = parse_datetime(value)
        except ValueError:
            parsed = None
        if parsed is None:
            raise serializers.ValidationError("Enter a date and time.")
        return parsed


class RevisionSerializer(serializers.ModelSerializer):
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, allow_null=True)

    class Meta:
        model = EntryRevision
        fields = ["id", "version", "title", "summary", "status", "note", "created_by_email", "created_at"]
        read_only_fields = fields


class RestoreSerializer(serializers.Serializer):
    version = serializers.IntegerField(min_value=1)
