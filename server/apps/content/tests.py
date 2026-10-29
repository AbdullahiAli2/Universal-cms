from datetime import timedelta, timezone as dt_timezone

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.websites.models import Membership, Role
from apps.websites.services import create_website

from .models import ContentType, Entry, EntryStatus
from .services import publish_due_entries

BASE = "/api/v1/websites/daily-news"


class ContentTestCase(TestCase):
    def setUp(self):
        cache.clear()
        make = lambda email: User.objects.create_user(email=email, password="correct-horse-battery")  # noqa: E731
        self.owner, self.editor, self.author, self.author2, self.viewer, self.stranger = (
            make(f"{name}@example.com") for name in ("owner", "editor", "author", "author2", "viewer", "stranger")
        )
        self.site = create_website(self.owner, name="Daily News", timezone="Africa/Nairobi")
        for user, role in [
            (self.editor, Role.EDITOR), (self.author, Role.AUTHOR), (self.author2, Role.AUTHOR), (self.viewer, Role.VIEWER)
        ]:
            Membership.objects.create(website=self.site, user=user, role=role)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def create(self, user, **fields):
        payload = {"type": "article", "title": "Budget passes", "body": "Text", **fields}
        return self.as_user(user).post(f"{BASE}/entries/", payload, format="json")

    def act(self, user, entry_id, action, **extra):
        return self.as_user(user).post(f"{BASE}/entries/{entry_id}/transition/", {"action": action, **extra}, format="json")


class ContentTypeTests(ContentTestCase):
    def test_new_websites_get_the_builtin_types_with_counts(self):
        self.create(self.author)
        response = self.as_user(self.viewer).get(f"{BASE}/content-types/")
        self.assertEqual(response.status_code, 200)
        types = {item["key"]: item for item in response.json()}
        self.assertEqual(set(types), {"article", "event", "publication", "page"})
        self.assertEqual(types["article"]["counts"], {"total": 1, "draft": 1})
        self.assertEqual(types["event"]["counts"], {})

    def test_unknown_type_is_404(self):
        self.assertEqual(self.create(self.author, type="recipe").status_code, 404)


class EntryWorkflowTests(ContentTestCase):
    def test_author_creates_a_draft_they_own(self):
        response = self.create(self.author, status="published")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["status"], "draft")  # status cannot be set on create
        self.assertEqual(body["author"]["email"], "author@example.com")
        self.assertEqual(body["slug"], "budget-passes")
        self.assertEqual(body["allowed_actions"], ["submit"])
        self.assertTrue(AuditLog.objects.filter(website=self.site, action="entry.created").exists())

    def test_viewer_cannot_create(self):
        self.assertEqual(self.create(self.viewer).status_code, 403)

    def test_author_edits_only_their_own_drafts(self):
        entry = self.create(self.author).json()
        own = self.as_user(self.author).patch(f"{BASE}/entries/{entry['id']}/", {"title": "New", "version": 1}, format="json")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.json()["version"], 2)
        other = self.as_user(self.author2).patch(f"{BASE}/entries/{entry['id']}/", {"title": "Mine now", "version": 2}, format="json")
        self.assertEqual(other.status_code, 403)

    def test_author_submits_but_cannot_publish(self):
        entry = self.create(self.author).json()
        self.assertEqual(self.act(self.author, entry["id"], "publish").status_code, 403)
        submitted = self.act(self.author, entry["id"], "submit")
        self.assertEqual(submitted.json()["status"], "in_review")
        # Locked for the author while in review.
        edit = self.as_user(self.author).patch(f"{BASE}/entries/{entry['id']}/", {"title": "x", "version": 2}, format="json")
        self.assertEqual(edit.status_code, 403)
        self.assertEqual(self.act(self.author, entry["id"], "withdraw").json()["status"], "draft")

    def test_editor_publishes_and_unpublishes(self):
        entry = self.create(self.author).json()
        self.act(self.author, entry["id"], "submit")
        published = self.act(self.editor, entry["id"], "publish").json()
        self.assertEqual(published["status"], "published")
        self.assertIsNotNone(published["published_at"])
        self.assertIn("unpublish", published["allowed_actions"])
        self.assertEqual(self.act(self.editor, entry["id"], "unpublish").json()["status"], "draft")

    def test_invalid_transition_is_explained(self):
        entry = self.create(self.author).json()
        response = self.act(self.editor, entry["id"], "restore")
        self.assertEqual(response.status_code, 400)
        self.assertIn("draft", response.json()["action"][0])

    def test_archive_and_restore(self):
        entry = self.create(self.editor).json()
        self.assertEqual(self.act(self.editor, entry["id"], "archive").json()["status"], "archived")
        self.assertEqual(self.act(self.editor, entry["id"], "restore").json()["status"], "draft")

    def test_concurrent_edit_is_refused(self):
        entry = self.create(self.editor).json()
        url = f"{BASE}/entries/{entry['id']}/"
        self.as_user(self.editor).patch(url, {"title": "First", "version": 1}, format="json")
        stale = self.as_user(self.owner).patch(url, {"title": "Second", "version": 1}, format="json")
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(Entry.objects.get(pk=entry["id"]).title, "First")

    def test_patch_requires_version(self):
        entry = self.create(self.editor).json()
        self.assertEqual(self.as_user(self.editor).patch(f"{BASE}/entries/{entry['id']}/", {"title": "x"}, format="json").status_code, 400)

    def test_delete_rules(self):
        own = self.create(self.author, title="Own").json()
        other = self.create(self.author2, title="Other").json()
        self.assertEqual(self.as_user(self.author).delete(f"{BASE}/entries/{other['id']}/").status_code, 403)
        self.assertEqual(self.as_user(self.viewer).delete(f"{BASE}/entries/{own['id']}/").status_code, 403)
        self.assertEqual(self.as_user(self.author).delete(f"{BASE}/entries/{own['id']}/").status_code, 204)
        self.assertEqual(self.as_user(self.editor).delete(f"{BASE}/entries/{other['id']}/").status_code, 204)
        self.assertFalse(Entry.objects.exists())


class SchedulingTests(ContentTestCase):
    def test_schedule_needs_a_future_time(self):
        entry = self.create(self.editor).json()
        past = (timezone.now() - timedelta(hours=1)).isoformat()
        self.assertEqual(self.act(self.editor, entry["id"], "schedule", publish_at=past).status_code, 400)
        self.assertEqual(self.act(self.editor, entry["id"], "schedule").status_code, 400)

    def test_scheduled_entry_goes_live_when_due(self):
        entry = self.create(self.editor).json()
        future = (timezone.now() + timedelta(hours=1)).isoformat()
        self.assertEqual(self.act(self.editor, entry["id"], "schedule", publish_at=future).json()["status"], "scheduled")
        self.assertEqual(publish_due_entries(), 0)
        Entry.objects.filter(pk=entry["id"]).update(publish_at=timezone.now() - timedelta(minutes=1))
        # Listing triggers due publishing too, so no cron is needed in development.
        listed = self.as_user(self.viewer).get(f"{BASE}/entries/?type=article").json()["results"]
        self.assertEqual(listed[0]["status"], "published")
        self.assertIsNotNone(Entry.objects.get(pk=entry["id"]).published_at)

    def test_local_time_is_read_in_the_website_time_zone(self):
        entry = self.create(self.editor).json()
        response = self.act(self.editor, entry["id"], "schedule", publish_at="2099-01-01T09:00:00")
        self.assertEqual(response.status_code, 200, response.content)
        # Nairobi is UTC+3.
        self.assertEqual(Entry.objects.get(pk=entry["id"]).publish_at.astimezone(dt_timezone.utc).hour, 6)


class FieldValidationTests(ContentTestCase):
    def test_event_requires_a_start(self):
        response = self.create(self.editor, type="event", title="Launch")
        self.assertEqual(response.status_code, 400)
        self.assertIn("starts_at", response.json()["data"])

    def test_event_fields_are_cleaned(self):
        response = self.create(
            self.editor, type="event", title="Launch",
            data={"starts_at": "2099-05-01T18:00", "location": "  Nairobi ", "registration_url": "https://example.com/r", "junk": "x"},
        )
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        self.assertEqual(data["location"], "Nairobi")
        self.assertNotIn("junk", data)
        self.assertTrue(data["starts_at"].endswith("+03:00"))

    def test_bad_values_are_rejected(self):
        response = self.create(self.editor, type="event", title="Launch", data={"starts_at": "soon", "registration_url": "javascript:alert(1)"})
        self.assertEqual(set(response.json()["data"]), {"starts_at", "registration_url"})

    def test_slugs_are_unique_per_type(self):
        self.assertEqual(self.create(self.editor).json()["slug"], "budget-passes")
        self.assertEqual(self.create(self.editor).json()["slug"], "budget-passes-2")
        self.assertEqual(self.create(self.editor, slug="budget-passes").status_code, 400)
        self.assertEqual(self.create(self.editor, type="page").json()["slug"], "budget-passes")


class RevisionTests(ContentTestCase):
    def test_every_change_is_kept_and_can_be_restored(self):
        entry = self.create(self.editor, title="Version one").json()
        url = f"{BASE}/entries/{entry['id']}/"
        self.as_user(self.editor).patch(url, {"title": "Version two", "version": 1}, format="json")
        self.act(self.editor, entry["id"], "publish")
        revisions = self.as_user(self.viewer).get(f"{url}revisions/").json()
        self.assertEqual([r["version"] for r in revisions], [3, 2, 1])
        first = revisions[-1]
        restored = self.as_user(self.editor).post(f"{url}revisions/{first['id']}/restore/", {"version": 3}, format="json")
        self.assertEqual(restored.status_code, 200, restored.content)
        self.assertEqual(restored.json()["title"], "Version one")
        self.assertEqual(restored.json()["status"], "published")
        self.assertEqual(restored.json()["version"], 4)

    def test_viewer_cannot_restore(self):
        entry = self.create(self.editor).json()
        revision = self.as_user(self.viewer).get(f"{BASE}/entries/{entry['id']}/revisions/").json()[0]
        response = self.as_user(self.viewer).post(f"{BASE}/entries/{entry['id']}/revisions/{revision['id']}/restore/", {"version": 1}, format="json")
        self.assertEqual(response.status_code, 403)


class IsolationTests(ContentTestCase):
    def test_non_members_see_nothing(self):
        entry = self.create(self.editor).json()
        client = self.as_user(self.stranger)
        for path in [f"{BASE}/content-types/", f"{BASE}/entries/", f"{BASE}/entries/{entry['id']}/", f"{BASE}/entries/{entry['id']}/revisions/"]:
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 404)
        self.assertEqual(self.act(self.stranger, entry["id"], "publish").status_code, 404)

    def test_entry_ids_from_another_website_are_not_found(self):
        other = create_website(self.stranger, name="Other Site")
        foreign = Entry.objects.create(
            website=other, content_type=ContentType.objects.get(website=other, key="article"), title="Secret", slug="secret"
        )
        client = self.as_user(self.owner)
        self.assertEqual(client.get(f"{BASE}/entries/{foreign.pk}/").status_code, 404)
        self.assertEqual(client.patch(f"{BASE}/entries/{foreign.pk}/", {"title": "x", "version": 1}, format="json").status_code, 404)
        self.assertEqual(self.act(self.owner, foreign.pk, "publish").status_code, 404)
        self.assertEqual(client.delete(f"{BASE}/entries/{foreign.pk}/").status_code, 404)
        self.assertEqual(client.get(f"{BASE}/entries/").json()["count"], 0)
        foreign.refresh_from_db()
        self.assertEqual(foreign.status, EntryStatus.DRAFT)


class ListAndDashboardTests(ContentTestCase):
    def test_filters(self):
        self.create(self.author, title="Rain expected")
        published = self.create(self.editor, title="Market update").json()
        self.act(self.editor, published["id"], "publish")
        client = self.as_user(self.viewer)
        self.assertEqual(client.get(f"{BASE}/entries/?status=published").json()["count"], 1)
        self.assertEqual(client.get(f"{BASE}/entries/?search=rain").json()["results"][0]["title"], "Rain expected")
        self.assertEqual(self.as_user(self.author).get(f"{BASE}/entries/?mine=1").json()["count"], 1)
        self.assertNotIn("body", client.get(f"{BASE}/entries/").json()["results"][0])

    def test_dashboard_uses_real_content(self):
        draft = self.create(self.author, title="Draft one").json()
        review = self.create(self.author, title="For review").json()
        self.act(self.author, review["id"], "submit")
        live = self.create(self.editor, title="Live").json()
        self.act(self.editor, live["id"], "publish")
        body = self.as_user(self.viewer).get(f"{BASE}/dashboard/").json()
        self.assertEqual(body["stats"]["content"]["draft"], 1)
        self.assertEqual(body["stats"]["content"]["in_review"], 1)
        self.assertEqual(body["stats"]["articles_published"], 1)
        self.assertEqual({item["id"] for item in body["needs_attention"]}, {draft["id"], review["id"]})
        checklist = {item["key"]: item for item in body["setup_checklist"]}
        self.assertTrue(checklist["content"]["done"])


class DashboardOverviewTests(ContentTestCase):
    def test_tiles_series_and_scheduled_come_from_the_database(self):
        article = self.create(self.editor, title="Live").json()
        self.act(self.editor, article["id"], "publish")
        future = (timezone.now() + timedelta(days=10)).strftime("%Y-%m-%dT%H:%M")
        event = self.create(self.editor, type="event", title="Forum", data={"starts_at": future}).json()
        self.act(self.editor, event["id"], "publish")
        self.create(self.editor, type="event", title="Draft event", data={"starts_at": future})  # drafts are not upcoming
        later = self.create(self.editor, title="Tomorrow").json()
        self.act(self.editor, later["id"], "schedule", publish_at=(timezone.now() + timedelta(days=1)).isoformat())

        overview = self.as_user(self.viewer).get(f"{BASE}/dashboard/").json()["overview"]
        self.assertEqual(overview["tiles"]["articles_published"], 1)
        self.assertEqual(overview["tiles"]["articles_last_30"], 1)
        self.assertIsNone(overview["tiles"]["articles_change"])  # nothing to compare with
        self.assertEqual(overview["tiles"]["upcoming_events"], 1)
        self.assertEqual(len(overview["activity"]), 30)
        today = overview["activity"][-1]
        self.assertEqual((today["created"], today["published"]), (4, 2))
        self.assertEqual([item["title"] for item in overview["scheduled"]], ["Tomorrow"])
        self.assertEqual(overview["seo"]["checked"], 2)

    def test_hidden_types_stay_hidden(self):
        from apps.websites.models import RolePermission
        from apps.websites.permissions import default_permissions

        self.create(self.editor, type="page", title="Secret page")
        viewer_codes = default_permissions("viewer", ["article", "event", "publication"])
        RolePermission.objects.create(website=self.site, role="viewer", permissions=sorted(viewer_codes))
        overview = self.as_user(self.viewer).get(f"{BASE}/dashboard/").json()["overview"]
        self.assertEqual(sum(day["created"] for day in overview["activity"]), 0)
