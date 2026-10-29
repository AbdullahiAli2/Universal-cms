from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.content.models import ContentType, Entry, EntryStatus
from apps.media.models import MediaAsset, MediaKind
from apps.websites.models import Membership, Role
from apps.websites.services import create_website

BASE = "/api/v1/websites/kaadir-institute"


class GrowthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="owner@example.com", password="correct-horse-battery")
        self.editor = User.objects.create_user(email="editor@example.com", password="correct-horse-battery")
        self.stranger = User.objects.create_user(email="stranger@example.com", password="correct-horse-battery")
        self.site = create_website(self.owner, name="Kaadir Institute")
        Membership.objects.create(website=self.site, user=self.editor, role=Role.EDITOR)
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)
        self.article = ContentType.objects.get(website=self.site, key="article")

    def entry(self, title, *, status=EntryStatus.PUBLISHED, published_days_ago=0, **fields):
        published = timezone.now() - timedelta(days=published_days_ago) if status == EntryStatus.PUBLISHED else None
        return Entry.objects.create(
            website=self.site, content_type=self.article, title=title, slug=f"s{Entry.objects.count()}",
            status=status, published_at=published, **fields,
        )

    def test_report_uses_real_content(self):
        image = MediaAsset.objects.create(website=self.site, kind=MediaKind.IMAGE, title="Pic", file="1/" + "a" * 32 + ".png")
        MediaAsset.objects.create(website=self.site, kind=MediaKind.IMAGE, title="Alt ok", alt_text="Harbour", file="1/" + "b" * 32 + ".png")
        good = self.entry(
            "Ports reopen", summary="The ports of Mogadishu and Kismayo reopened on Monday after a week of closures due to storms.",
            data={"cover": image.pk},
        )
        self.entry("A" * 70, published_days_ago=10)
        self.entry("Hidden", seo={"noindex": True, "description": "x" * 80}, data={"cover": image.pk})
        self.entry("Draft only", status=EntryStatus.DRAFT)

        body = self.client.get(f"{BASE}/growth/").json()
        health = body["seo_health"]
        self.assertEqual(health["checked"], 3)
        self.assertEqual(health["healthy"], 2)  # "Hidden" is noindex on purpose, which is not a problem
        self.assertEqual(health["images_without_alt"], 1)
        codes = health["issue_counts"]
        self.assertEqual(codes["title_long"], 1)
        self.assertEqual(codes["description_missing"], 1)
        self.assertEqual(codes["image_missing"], 1)
        self.assertEqual(codes["noindex"], 1)
        self.assertNotIn(good.id, {issue["entry_id"] for issue in health["issues"]})

        weeks = body["output"]["weeks"]
        self.assertEqual(len(weeks), 8)
        self.assertEqual(sum(week.get("article", 0) for week in weeks), 3)
        self.assertEqual(body["sitemap"]["count"], 2)  # the noindex entry is left out
        self.assertFalse(body["analytics"]["connected"])

    def test_settings(self):
        payload = {
            "title_template": "{title} — {site}",
            "default_description": "Independent research on security and governance in Somalia.",
            "ga4_measurement_id": "g-abc123xyz",
            "google_site_verification": '<meta name="google-site-verification" content="abcDEF123_-xyz789" />',
        }
        response = self.client.patch(f"{BASE}/seo/", payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["ga4_measurement_id"], "G-ABC123XYZ")
        self.assertEqual(response.json()["google_site_verification"], "abcDEF123_-xyz789")
        self.assertTrue(self.client.get(f"{BASE}/growth/").json()["analytics"]["connected"])
        bad = self.client.patch(f"{BASE}/seo/", {"title_template": "No placeholder", "ga4_measurement_id": "UA-1", "plausible_domain": "not a domain"}, format="json")
        self.assertEqual(set(bad.json()), {"title_template", "ga4_measurement_id", "plausible_domain"})

    def test_permissions(self):
        self.client.force_authenticate(user=self.editor)
        self.assertEqual(self.client.get(f"{BASE}/growth/").status_code, 200)
        self.assertEqual(self.client.patch(f"{BASE}/seo/", {"allow_indexing": False}, format="json").status_code, 403)
        self.client.force_authenticate(user=self.stranger)
        self.assertEqual(self.client.get(f"{BASE}/growth/").status_code, 404)
        self.assertEqual(self.client.get(f"{BASE}/seo/").status_code, 404)
