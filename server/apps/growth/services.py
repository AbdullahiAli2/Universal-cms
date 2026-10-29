"""Growth report: computed from the website's own content. No traffic figures are invented."""

from collections import Counter
from datetime import timedelta

from django.utils import timezone

from apps.audit import services as audit
from apps.content.models import Entry, EntryStatus
from apps.media.models import MediaAsset, MediaKind
from apps.websites.permissions import require_perm

from .models import SeoSettings

TITLE_MAX = 60
DESCRIPTION_MIN, DESCRIPTION_MAX = 50, 160
WEEKS = 8
IMAGE_FIELDS = ("cover", "image")


def get_settings(website):
    settings, _created = SeoSettings.objects.get_or_create(website=website)
    return settings


def update_settings(website, user, changes):
    require_perm(website, "seo.manage")
    settings = get_settings(website)
    for field, value in changes.items():
        setattr(settings, field, value)
    settings.save()
    audit.record(
        action="seo.updated", actor=user, website=website, target=settings,
        summary=f"Updated SEO settings: {', '.join(sorted(changes))}"[:255],
    )
    return settings


def _week_start(moment):
    local = timezone.localtime(moment)
    return (local - timedelta(days=local.weekday())).date()


def publishing_output(website, weeks=WEEKS):
    """Entries first published in each of the last `weeks` weeks, by content type."""
    today = _week_start(timezone.now())
    starts = [today - timedelta(weeks=offset) for offset in reversed(range(weeks))]
    since = timezone.now() - timedelta(weeks=weeks)
    rows = Entry.objects.filter(website=website, published_at__gte=since).values_list("published_at", "content_type__key")
    counts = Counter((_week_start(published), key) for published, key in rows)
    keys = sorted({key for _week, key in counts})
    return {
        "types": keys,
        "weeks": [{"week": start.isoformat(), **{key: counts.get((start, key), 0) for key in keys}} for start in starts],
    }


def seo_health(website):
    """Checks every published entry for the problems that most often hurt search results and sharing."""
    settings = get_settings(website)
    entries = list(
        Entry.objects.filter(website=website, status=EntryStatus.PUBLISHED).select_related("content_type").order_by("-published_at")
    )
    issues = []
    titles = Counter(entry.title.strip().lower() for entry in entries)

    def add(entry, code, message):
        issues.append({"entry_id": entry.id, "type": entry.content_type.key, "title": entry.title, "code": code, "message": message})

    for entry in entries:
        seo = entry.seo or {}
        title = seo.get("title") or entry.title
        description = seo.get("description") or entry.summary or ""
        if len(title) > TITLE_MAX:
            add(entry, "title_long", f"Search title is {len(title)} characters. Search engines show about {TITLE_MAX}.")
        if not description.strip():
            add(entry, "description_missing", "No description. Add a summary or a search description.")
        elif len(description) < DESCRIPTION_MIN:
            add(entry, "description_short", f"Description is only {len(description)} characters. Aim for {DESCRIPTION_MIN}–{DESCRIPTION_MAX}.")
        elif len(description) > DESCRIPTION_MAX:
            add(entry, "description_long", f"Description is {len(description)} characters. Search engines cut it at about {DESCRIPTION_MAX}.")
        if not seo.get("image") and not any(entry.data.get(field) for field in IMAGE_FIELDS):
            add(entry, "image_missing", "No share image. Links to it will show without a picture.")
        if titles[entry.title.strip().lower()] > 1:
            add(entry, "title_duplicate", "Another published entry has the same title.")
        if seo.get("noindex"):
            add(entry, "noindex", "Hidden from search engines on purpose.")

    images_without_alt = MediaAsset.objects.filter(website=website, kind=MediaKind.IMAGE, alt_text="").count()
    checked = len(entries)
    blocking = {issue["entry_id"] for issue in issues if issue["code"] != "noindex"}
    return {
        "checked": checked,
        "healthy": checked - len(blocking),
        "issues": issues[:100],
        "issue_counts": dict(Counter(issue["code"] for issue in issues)),
        "images_without_alt": images_without_alt,
        "indexing_allowed": settings.allow_indexing,
        "has_default_description": bool(settings.default_description),
        "has_share_image": bool(getattr(getattr(website, "branding", None), "share_image_id", None)),
    }


def sitemap_entries(website):
    """Published, indexable entries: what a website's sitemap.xml should list."""
    entries = Entry.objects.filter(website=website, status=EntryStatus.PUBLISHED).select_related("content_type").order_by("-updated_at")
    return [
        {"type": entry.content_type.key, "slug": entry.slug, "title": entry.title, "updated_at": entry.updated_at}
        for entry in entries
        if not (entry.seo or {}).get("noindex")
    ]
