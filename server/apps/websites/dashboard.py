"""Figures for the website dashboard. Everything comes from the database; nothing is estimated."""

from collections import Counter
from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.content.models import Entry, EntryStatus
from apps.growth import services as growth
from apps.media.models import MediaAsset

DAYS = 30


def _change(current, previous):
    """Percent change against the previous period, or None when there is nothing to compare with."""
    if previous == 0:
        return None
    return round((current - previous) / previous * 100)


def overview(website, type_keys):
    now = timezone.now()
    entries = Entry.objects.filter(website=website, content_type__key__in=type_keys)
    start = now - timedelta(days=DAYS)
    previous_start = start - timedelta(days=DAYS)

    articles = entries.filter(content_type__key="article")
    articles_now = articles.filter(published_at__gte=start).count()
    articles_before = articles.filter(published_at__gte=previous_start, published_at__lt=start).count()

    # Events count as upcoming when they are live or scheduled and start within 60 days.
    horizon = now + timedelta(days=60)
    upcoming = 0
    for data in entries.filter(content_type__key="event", status__in=[EntryStatus.PUBLISHED, EntryStatus.SCHEDULED]).values_list("data", flat=True):
        try:
            starts = parse_datetime(data.get("starts_at") or "")
        except ValueError:
            starts = None
        if starts is not None and now <= starts <= horizon:
            upcoming += 1

    publications = entries.filter(content_type__key="publication")

    # Day by day: entries created and entries first published.
    today = timezone.localdate()
    days = [today - timedelta(days=offset) for offset in reversed(range(DAYS))]
    created = Counter(timezone.localtime(moment).date() for moment in entries.filter(created_at__gte=start).values_list("created_at", flat=True))
    published = Counter(
        timezone.localtime(moment).date() for moment in entries.filter(published_at__gte=start).values_list("published_at", flat=True)
    )

    output = growth.publishing_output(website)
    output["types"] = [key for key in output["types"] if key in type_keys]

    health = growth.seo_health(website)
    scheduled = entries.filter(status=EntryStatus.SCHEDULED).select_related("content_type").order_by("publish_at")[:6]

    return {
        "tiles": {
            "articles_published": articles.filter(status=EntryStatus.PUBLISHED).count(),
            "articles_last_30": articles_now,
            "articles_change": _change(articles_now, articles_before),
            "upcoming_events": upcoming,
            "publications_total": publications.count(),
            "publications_published": publications.filter(status=EntryStatus.PUBLISHED).count(),
            "media_files": MediaAsset.objects.filter(website=website).count(),
        },
        "activity": [{"date": day.isoformat(), "created": created.get(day, 0), "published": published.get(day, 0)} for day in days],
        "output": output,
        "seo": {
            "checked": health["checked"],
            "healthy": health["healthy"],
            "issue_counts": health["issue_counts"],
            "images_without_alt": health["images_without_alt"],
            "issues": health["issues"][:5],
        },
        "scheduled": [
            {"id": entry.id, "title": entry.title, "type": entry.content_type.key, "type_name": entry.content_type.singular_name, "publish_at": entry.publish_at}
            for entry in scheduled
        ],
    }
