"""
Content workflow. Views call these functions; they hold every rule about who may do what.

Permissions are per content type (see apps.websites.permissions):
  content.<type>.read    - see entries
  content.<type>.create  - create entries; edit, delete and submit your own drafts
  content.<type>.update  - edit anyone's entries
  content.<type>.publish - publish, schedule, unpublish, archive and restore
  content.<type>.delete  - delete anyone's entries
By default viewers read, authors also create, and editors and above have everything.
"""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.text import slugify
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.websites.permissions import has_perm

from .builtins import BUILTIN_TYPES
from .fields import clean_data
from apps.media.models import MediaAsset

from .models import ContentType, Entry, EntryRevision, EntryStatus

S = EntryStatus


class EditConflict(APIException):
    status_code = 409
    default_detail = "Someone else changed this entry while you were editing. Reload it to see their changes."
    default_code = "conflict"


# action: (allowed from-statuses, resulting status, who may do it)
# "owner_or_editor": the entry's author (with create permission) or anyone who may edit any entry.
# "publisher": anyone with the publish permission for the type.
TRANSITIONS = {
    "submit": ({S.DRAFT}, S.IN_REVIEW, "owner_or_editor"),
    "withdraw": ({S.IN_REVIEW}, S.DRAFT, "owner_or_editor"),
    "publish": ({S.DRAFT, S.IN_REVIEW, S.SCHEDULED}, S.PUBLISHED, "publisher"),
    "schedule": ({S.DRAFT, S.IN_REVIEW, S.SCHEDULED}, S.SCHEDULED, "publisher"),
    "unpublish": ({S.PUBLISHED, S.SCHEDULED}, S.DRAFT, "publisher"),
    "archive": ({S.DRAFT, S.IN_REVIEW, S.SCHEDULED, S.PUBLISHED}, S.ARCHIVED, "publisher"),
    "restore": ({S.ARCHIVED}, S.DRAFT, "publisher"),
}

ACTION_SUMMARIES = {
    "submit": "Submitted “{title}” for review",
    "withdraw": "Moved “{title}” back to draft",
    "publish": "Published “{title}”",
    "schedule": "Scheduled “{title}”",
    "unpublish": "Unpublished “{title}”",
    "archive": "Archived “{title}”",
    "restore": "Restored “{title}” from the archive",
}


# --- Roles -------------------------------------------------------------------


def _can(website, type_key, action):
    return has_perm(website, f"content.{type_key}.{action}")


def can_read(website, type_key):
    return _can(website, type_key, "read")


def can_create(website, type_key):
    return _can(website, type_key, "create")


def readable_type_keys(website):
    return [key for key in ContentType.objects.filter(website=website).values_list("key", flat=True) if can_read(website, key)]


def _owns(entry, user):
    return entry.author_id is not None and entry.author_id == user.id


def _own_draft(website, user, entry):
    return can_create(website, entry.content_type.key) and _owns(entry, user) and entry.status == S.DRAFT


def can_edit(website, user, entry):
    return _can(website, entry.content_type.key, "update") or _own_draft(website, user, entry)


def can_delete(website, user, entry):
    return _can(website, entry.content_type.key, "delete") or _own_draft(website, user, entry)


def allowed_actions(website, user, entry):
    key = entry.content_type.key
    actions = []
    for name, (sources, _target, who) in TRANSITIONS.items():
        if entry.status not in sources:
            continue
        if who == "publisher" and _can(website, key, "publish"):
            actions.append(name)
        elif who == "owner_or_editor" and (_can(website, key, "update") or (can_create(website, key) and _owns(entry, user))):
            actions.append(name)
    return actions


# --- Content types -----------------------------------------------------------


def ensure_builtin_types(website):
    existing = set(ContentType.objects.filter(website=website).values_list("key", flat=True))
    ContentType.objects.bulk_create(
        [
            ContentType(website=website, is_builtin=True, **definition)
            for definition in BUILTIN_TYPES
            if definition["key"] not in existing
        ]
    )


def get_content_type(website, key):
    content_type = ContentType.objects.filter(website=website, key=key).first()
    if content_type is None or not can_read(website, key):
        raise NotFound("Content type not found.")
    return content_type


# --- Helpers -----------------------------------------------------------------


def _website_tz(website):
    try:
        return ZoneInfo(website.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def _unique_slug(website, content_type, base, exclude_pk=None):
    base = (slugify(base, allow_unicode=True) or "entry")[:200]
    slug, counter = base, 2
    taken = Entry.objects.filter(website=website, content_type=content_type)
    if exclude_pk:
        taken = taken.exclude(pk=exclude_pk)
    while taken.filter(slug=slug).exists():
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def media_lookup(website):
    """For field validation: which of these ids are files of this kind in this website's library."""

    def lookup(kind, ids):
        return set(MediaAsset.objects.filter(website=website, kind=kind, pk__in=ids).values_list("pk", flat=True))

    return lookup


def _clean_fields(content_type, website, data):
    cleaned, errors = clean_data(content_type.fields, data, _website_tz(website), media_lookup(website))
    if errors:
        raise ValidationError({"data": errors})
    return cleaned


SEO_LIMITS = {"title": 120, "description": 320}


def clean_seo(website, seo):
    seo = seo if isinstance(seo, dict) else {}
    cleaned, errors = {}, {}
    for key, limit in SEO_LIMITS.items():
        value = seo.get(key)
        if value in (None, ""):
            continue
        if not isinstance(value, str) or len(value.strip()) > limit:
            errors[key] = f"Keep this under {limit} characters."
        else:
            cleaned[key] = value.strip()
    canonical = seo.get("canonical_url")
    if canonical:
        found, field_errors = clean_data([{"key": "c", "label": "Canonical address", "type": "url"}], {"c": canonical})
        if field_errors:
            errors["canonical_url"] = field_errors["c"]
        else:
            cleaned["canonical_url"] = found["c"]
    image = seo.get("image")
    if image not in (None, ""):
        found, field_errors = clean_data([{"key": "i", "label": "Share image", "type": "image"}], {"i": image}, media=media_lookup(website))
        if field_errors:
            errors["image"] = field_errors["i"]
        else:
            cleaned["image"] = found["i"]
    if seo.get("noindex") is True:
        cleaned["noindex"] = True
    if errors:
        raise ValidationError({"seo": errors})
    return cleaned


def _snapshot(entry, user, note):
    EntryRevision.objects.create(
        entry=entry,
        version=entry.version,
        title=entry.title,
        slug=entry.slug,
        summary=entry.summary,
        body=entry.body,
        data=entry.data,
        seo=entry.seo,
        status=entry.status,
        note=note[:120],
        created_by=user if user is not None and user.is_authenticated else None,
    )


def _locked(website, entry_id, expected_version=None):
    entry = Entry.objects.select_for_update().select_related("content_type").filter(website=website, pk=entry_id).first()
    if entry is None or not can_read(website, entry.content_type.key):
        raise NotFound("Entry not found.")
    if expected_version is not None and entry.version != expected_version:
        raise EditConflict()
    return entry


def get_entry(website, entry_id):
    entry = Entry.objects.select_related("content_type", "author", "updated_by").filter(website=website, pk=entry_id).first()
    if entry is None or not can_read(website, entry.content_type.key):
        raise NotFound("Entry not found.")
    return entry


# --- Changes -----------------------------------------------------------------


@transaction.atomic
def create_entry(website, user, content_type, *, title, slug="", summary="", body="", data=None, seo=None):
    if not can_create(website, content_type.key):
        raise PermissionDenied(f"Your role does not allow creating {content_type.name.lower()}.")
    entry = Entry(
        website=website,
        content_type=content_type,
        title=title,
        slug=_unique_slug(website, content_type, slug or title),
        summary=summary,
        body=body,
        data=_clean_fields(content_type, website, data),
        seo=clean_seo(website, seo),
        author=user,
        updated_by=user,
    )
    if slug and entry.slug != (slugify(slug, allow_unicode=True) or "entry")[:200]:
        raise ValidationError({"slug": ["Another entry already uses this address. Choose a different one."]})
    entry.save()
    _snapshot(entry, user, "Created")
    audit.record(
        action="entry.created", actor=user, website=website, target=entry,
        summary=f"Created {content_type.singular_name.lower()} “{entry.title}”",
    )
    return entry


@transaction.atomic
def update_entry(website, user, entry_id, *, version, changes):
    entry = _locked(website, entry_id, version)
    if not can_edit(website, user, entry):
        raise PermissionDenied("Your role does not allow editing this entry.")
    if "slug" in changes:
        wanted = slugify(changes["slug"] or entry.title, allow_unicode=True)[:200] or "entry"
        if Entry.objects.filter(website=website, content_type=entry.content_type, slug=wanted).exclude(pk=entry.pk).exists():
            raise ValidationError({"slug": ["Another entry already uses this address. Choose a different one."]})
        changes["slug"] = wanted
    if "data" in changes:
        changes["data"] = _clean_fields(entry.content_type, website, changes["data"])
    if "seo" in changes:
        changes["seo"] = clean_seo(website, changes["seo"])
    for field, value in changes.items():
        setattr(entry, field, value)
    entry.version += 1
    entry.updated_by = user
    try:
        with transaction.atomic():
            entry.save()
    except IntegrityError:
        raise ValidationError({"slug": ["Another entry already uses this address. Choose a different one."]})
    _snapshot(entry, user, "Edited")
    audit.record(action="entry.updated", actor=user, website=website, target=entry, summary=f"Edited “{entry.title}”")
    return entry


@transaction.atomic
def transition_entry(website, user, entry_id, action, *, version=None, publish_at=None):
    if action not in TRANSITIONS:
        raise ValidationError({"action": ["Unknown action."]})
    entry = _locked(website, entry_id, version)
    if action not in allowed_actions(website, user, entry):
        if entry.status not in TRANSITIONS[action][0]:
            raise ValidationError({"action": [f"This entry is {entry.get_status_display().lower()}, so it cannot be changed this way."]})
        raise PermissionDenied("Your role does not allow this action.")

    now = timezone.now()
    target = TRANSITIONS[action][1]
    if action == "schedule":
        if publish_at is None:
            raise ValidationError({"publish_at": ["Choose when to publish."]})
        if timezone.is_naive(publish_at):
            publish_at = timezone.make_aware(publish_at, _website_tz(website))
        if publish_at <= now:
            raise ValidationError({"publish_at": ["Choose a time in the future, or publish now."]})
        entry.publish_at = publish_at
    elif action == "publish":
        entry.publish_at = None
        entry.published_at = entry.published_at or now
    elif action in ("unpublish", "withdraw", "restore", "archive"):
        entry.publish_at = None

    entry.status = target
    entry.version += 1
    entry.updated_by = user
    entry.save()
    _snapshot(entry, user, action.capitalize())
    audit.record(
        action=f"entry.{action}", actor=user, website=website, target=entry,
        summary=ACTION_SUMMARIES[action].format(title=entry.title),
    )
    return entry


@transaction.atomic
def delete_entry(website, user, entry_id):
    entry = _locked(website, entry_id)
    if not can_delete(website, user, entry):
        raise PermissionDenied("Your role does not allow deleting this entry.")
    audit.record(action="entry.deleted", actor=user, website=website, summary=f"Deleted “{entry.title}”")
    entry.delete()


@transaction.atomic
def restore_revision(website, user, entry_id, revision_id, *, version):
    entry = _locked(website, entry_id, version)
    if not can_edit(website, user, entry):
        raise PermissionDenied("Your role does not allow editing this entry.")
    revision = entry.revisions.filter(pk=revision_id).first()
    if revision is None:
        raise NotFound("Revision not found.")
    entry.title, entry.summary, entry.body = revision.title, revision.summary, revision.body
    # Field definitions may have changed since; keep only what is still valid.
    entry.data, _errors = clean_data(entry.content_type.fields, revision.data, _website_tz(website), media_lookup(website))
    try:
        entry.seo = clean_seo(website, revision.seo)
    except ValidationError:
        entry.seo = {}  # a share image deleted since then; keep the restored content anyway
    entry.version += 1
    entry.updated_by = user
    entry.save()
    _snapshot(entry, user, f"Restored version {revision.version}")
    audit.record(
        action="entry.revision_restored", actor=user, website=website, target=entry,
        summary=f"Restored “{entry.title}” to version {revision.version}",
    )
    return entry


def publish_due_entries(website=None):
    """Publishes scheduled entries whose time has come. Safe to call often; run from cron as well."""
    due = Entry.objects.filter(status=S.SCHEDULED, publish_at__lte=timezone.now())
    if website is not None:
        due = due.filter(website=website)
    published = 0
    for entry_id in list(due.values_list("pk", flat=True)):
        with transaction.atomic():
            entry = Entry.objects.select_for_update().filter(pk=entry_id, status=S.SCHEDULED).first()
            if entry is None or entry.publish_at is None or entry.publish_at > timezone.now():
                continue
            entry.status = S.PUBLISHED
            entry.published_at = entry.published_at or entry.publish_at
            entry.publish_at = None
            entry.version += 1
            entry.save()
            _snapshot(entry, None, "Published on schedule")
            audit.record(
                action="entry.publish", website=entry.website, target=entry,
                summary=f"Published “{entry.title}” on schedule",
            )
            published += 1
    return published
