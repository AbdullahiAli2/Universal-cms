from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .models import Membership, Role, Website
from .services import create_website


class WebsiteTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email="owner@example.com", password="correct-horse-battery")
        self.admin = User.objects.create_user(email="admin@example.com", password="correct-horse-battery")
        self.editor = User.objects.create_user(email="editor@example.com", password="correct-horse-battery")
        self.viewer = User.objects.create_user(email="viewer@example.com", password="correct-horse-battery")
        self.stranger = User.objects.create_user(email="stranger@example.com", password="correct-horse-battery")
        self.site = create_website(self.owner, name="Daily News", website_type="news", timezone="Africa/Nairobi")
        Membership.objects.create(website=self.site, user=self.admin, role=Role.ADMIN)
        Membership.objects.create(website=self.site, user=self.editor, role=Role.EDITOR)
        Membership.objects.create(website=self.site, user=self.viewer, role=Role.VIEWER)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client


class WebsiteCreationTests(WebsiteTestCase):
    def test_creating_a_website_makes_the_creator_owner_and_audits_it(self):
        client = self.as_user(self.stranger)
        response = client.post(
            "/api/v1/websites/",
            {"name": "Tech Weekly", "website_type": "blog", "primary_domain": "techweekly.example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["slug"], "tech-weekly")
        self.assertEqual(body["role"], "owner")
        self.assertTrue(Membership.objects.filter(website__slug="tech-weekly", user=self.stranger, role=Role.OWNER).exists())
        self.assertTrue(AuditLog.objects.filter(action="website.created", website__slug="tech-weekly").exists())

    def test_duplicate_names_get_unique_slugs(self):
        first = create_website(self.stranger, name="Same Name")
        second = create_website(self.stranger, name="Same Name")
        self.assertEqual(first.slug, "same-name")
        self.assertEqual(second.slug, "same-name-2")

    def test_invalid_timezone_and_domain_are_rejected(self):
        client = self.as_user(self.stranger)
        bad_tz = client.post("/api/v1/websites/", {"name": "X", "timezone": "Mars/Olympus"}, format="json")
        self.assertEqual(bad_tz.status_code, 400)
        self.assertIn("timezone", bad_tz.json())
        bad_domain = client.post(
            "/api/v1/websites/", {"name": "Y", "primary_domain": "https://example.com/path"}, format="json"
        )
        self.assertEqual(bad_domain.status_code, 400)
        self.assertIn("primary_domain", bad_domain.json())


class WebsiteIsolationTests(WebsiteTestCase):
    def test_list_only_shows_websites_the_user_belongs_to(self):
        self.assertEqual(self.as_user(self.stranger).get("/api/v1/websites/").json()["count"], 0)
        results = self.as_user(self.viewer).get("/api/v1/websites/").json()["results"]
        self.assertEqual([w["slug"] for w in results], ["daily-news"])
        self.assertEqual(results[0]["role"], "viewer")

    def test_non_members_get_404_on_every_website_route(self):
        client = self.as_user(self.stranger)
        for path in [
            "/api/v1/websites/daily-news/",
            "/api/v1/websites/daily-news/dashboard/",
            "/api/v1/websites/daily-news/members/",
            "/api/v1/websites/daily-news/audit-logs/",
        ]:
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 404)
        self.assertEqual(client.patch("/api/v1/websites/daily-news/", {"name": "Hacked"}, format="json").status_code, 404)
        self.site.refresh_from_db()
        self.assertEqual(self.site.name, "Daily News")

    def test_unknown_slug_and_forbidden_slug_look_identical(self):
        client = self.as_user(self.stranger)
        unknown = client.get("/api/v1/websites/does-not-exist/")
        forbidden = client.get("/api/v1/websites/daily-news/")
        self.assertEqual(unknown.status_code, forbidden.status_code)
        self.assertEqual(unknown.json(), forbidden.json())


class WebsiteRoleTests(WebsiteTestCase):
    def test_viewer_can_read_but_not_edit(self):
        client = self.as_user(self.viewer)
        self.assertEqual(client.get("/api/v1/websites/daily-news/").status_code, 200)
        self.assertEqual(client.patch("/api/v1/websites/daily-news/", {"name": "Nope"}, format="json").status_code, 403)

    def test_editor_cannot_edit_website_settings(self):
        client = self.as_user(self.editor)
        self.assertEqual(client.patch("/api/v1/websites/daily-news/", {"name": "Nope"}, format="json").status_code, 403)

    def test_admin_can_edit_but_not_delete(self):
        client = self.as_user(self.admin)
        edit = client.patch("/api/v1/websites/daily-news/", {"description": "Local news"}, format="json")
        self.assertEqual(edit.status_code, 200)
        self.assertEqual(client.delete("/api/v1/websites/daily-news/").status_code, 403)
        self.assertTrue(Website.objects.filter(slug="daily-news").exists())

    def test_owner_can_delete_and_the_deletion_is_audited(self):
        response = self.as_user(self.owner).delete("/api/v1/websites/daily-news/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Website.objects.filter(slug="daily-news").exists())
        self.assertTrue(AuditLog.objects.filter(action="website.deleted").exists())

    def test_audit_logs_are_visible_to_admins_only(self):
        self.assertEqual(self.as_user(self.editor).get("/api/v1/websites/daily-news/audit-logs/").status_code, 403)
        response = self.as_user(self.admin).get("/api/v1/websites/daily-news/audit-logs/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("results", response.json())


class MemberTests(WebsiteTestCase):
    def test_admin_invites_existing_user(self):
        User.objects.create_user(email="new@example.com", password="correct-horse-battery")
        response = self.as_user(self.admin).post(
            "/api/v1/websites/daily-news/members/", {"email": "NEW@example.com", "role": "author"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["role"], "author")

    def test_invite_rejects_unknown_email_duplicates_and_owner_role(self):
        client = self.as_user(self.admin)
        # An unknown address now gets an account and an invitation (see InvitationTests).
        duplicate = client.post("/api/v1/websites/daily-news/members/", {"email": "viewer@example.com", "role": "viewer"}, format="json")
        self.assertEqual(duplicate.status_code, 400)
        as_owner_role = client.post("/api/v1/websites/daily-news/members/", {"email": "stranger@example.com", "role": "owner"}, format="json")
        self.assertEqual(as_owner_role.status_code, 400)

    def test_viewer_cannot_invite(self):
        response = self.as_user(self.viewer).post(
            "/api/v1/websites/daily-news/members/", {"email": "stranger@example.com", "role": "viewer"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_last_owner_cannot_be_demoted_or_removed(self):
        owner_membership = Membership.objects.get(website=self.site, user=self.owner)
        client = self.as_user(self.owner)
        demote = client.patch(f"/api/v1/websites/daily-news/members/{owner_membership.pk}/", {"role": "admin"}, format="json")
        self.assertEqual(demote.status_code, 400)
        remove = client.delete(f"/api/v1/websites/daily-news/members/{owner_membership.pk}/")
        self.assertEqual(remove.status_code, 400)

    def test_admin_cannot_change_owner_roles(self):
        second_owner = Membership.objects.create(website=self.site, user=self.stranger, role=Role.OWNER)
        response = self.as_user(self.admin).patch(
            f"/api/v1/websites/daily-news/members/{second_owner.pk}/", {"role": "viewer"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_owner_can_demote_another_owner_when_one_remains(self):
        second_owner = Membership.objects.create(website=self.site, user=self.stranger, role=Role.OWNER)
        response = self.as_user(self.owner).patch(
            f"/api/v1/websites/daily-news/members/{second_owner.pk}/", {"role": "editor"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

    def test_member_changes_are_audited(self):
        viewer_membership = Membership.objects.get(website=self.site, user=self.viewer)
        self.as_user(self.admin).patch(
            f"/api/v1/websites/daily-news/members/{viewer_membership.pk}/", {"role": "author"}, format="json"
        )
        self.assertTrue(AuditLog.objects.filter(action="member.role_changed", target_id=str(viewer_membership.pk)).exists())


class DashboardTests(WebsiteTestCase):
    def test_dashboard_reports_real_counts_and_checklist(self):
        response = self.as_user(self.viewer).get("/api/v1/websites/daily-news/dashboard/")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["stats"]["members"], 4)
        self.assertEqual(body["stats"]["by_role"]["viewer"], 1)
        checklist = {item["key"]: item for item in body["setup_checklist"]}
        self.assertTrue(checklist["team"]["done"])
        self.assertFalse(checklist["content"]["done"])
        self.assertNotIn("available", checklist["content"])  # the content engine exists now
        self.assertTrue(any(entry["action"] == "website.created" for entry in body["recent_activity"]))


class DomainUniquenessTests(WebsiteTestCase):
    def test_taken_domain_is_refused_without_revealing_the_owner(self):
        create_website(self.owner, name="Other Tenant", primary_domain="shared.example.com")
        response = self.as_user(self.stranger).post(
            "/api/v1/websites/", {"name": "Mine", "primary_domain": "shared.example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        message = response.json()["primary_domain"][0]
        self.assertNotIn("Other Tenant", response.content.decode())
        self.assertNotIn("owner@example.com", response.content.decode())
        self.assertNotIn("other-tenant", response.content.decode())
        self.assertIn("cannot be used", message)

    def test_taken_domain_is_refused_on_update(self):
        create_website(self.owner, name="Other Tenant", primary_domain="shared.example.com")
        response = self.as_user(self.owner).patch(
            "/api/v1/websites/daily-news/", {"primary_domain": "shared.example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_domains_are_normalised_and_blank_domains_do_not_collide(self):
        first = create_website(self.owner, name="Blank One", primary_domain="")
        second = create_website(self.owner, name="Blank Two", primary_domain="")
        self.assertIsNone(first.primary_domain)
        self.assertIsNone(second.primary_domain)
        response = self.as_user(self.owner).patch(
            "/api/v1/websites/daily-news/", {"primary_domain": "News.Example.COM"}, format="json"
        )
        self.assertEqual(response.json()["primary_domain"], "news.example.com")

    def test_domain_can_be_released_and_reused(self):
        self.site.primary_domain = "reuse.example.com"
        self.site.save()
        self.as_user(self.admin).patch("/api/v1/websites/daily-news/", {"primary_domain": ""}, format="json")
        response = self.as_user(self.stranger).post(
            "/api/v1/websites/", {"name": "Reuser", "primary_domain": "reuse.example.com"}, format="json"
        )
        self.assertEqual(response.status_code, 201)


class CrossTenantTests(WebsiteTestCase):
    def test_admin_of_one_website_cannot_touch_members_of_another(self):
        other = create_website(self.stranger, name="Other Tenant")
        foreign = Membership.objects.get(website=other, user=self.stranger)
        client = self.as_user(self.admin)
        # A member id from another website, addressed through a website the caller administers.
        path = f"/api/v1/websites/daily-news/members/{foreign.pk}/"
        self.assertEqual(client.patch(path, {"role": "viewer"}, format="json").status_code, 404)
        self.assertEqual(client.delete(path).status_code, 404)
        # And directly through the other website.
        direct = f"/api/v1/websites/other-tenant/members/{foreign.pk}/"
        self.assertEqual(client.patch(direct, {"role": "viewer"}, format="json").status_code, 404)
        foreign.refresh_from_db()
        self.assertEqual(foreign.role, Role.OWNER)

    def test_audit_log_never_mixes_websites(self):
        create_website(self.stranger, name="Other Tenant")
        entries = self.as_user(self.owner).get("/api/v1/websites/daily-news/audit-logs/").json()["results"]
        self.assertTrue(entries)
        self.assertFalse(any("Other Tenant" in str(entry) for entry in entries))


class ConnectExistingWebsiteTests(WebsiteTestCase):
    def _connect(self, user, **fields):
        payload = {"name": "Shop", "source": "connected", **fields}
        return self.as_user(user).post("/api/v1/websites/", payload, format="json")

    def test_connecting_registers_the_workspace_and_fills_the_domain(self):
        response = self._connect(
            self.stranger, frontend_url="https://www.Shop.example.com/", frontend_framework="nextjs"
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["source"], "connected")
        self.assertEqual(body["frontend_url"], "https://www.shop.example.com")
        self.assertEqual(body["frontend_framework"], "nextjs")
        self.assertEqual(body["primary_domain"], "www.shop.example.com")
        self.assertEqual(body["role"], "owner")
        website = Website.objects.get(slug=body["slug"])
        self.assertTrue(Membership.objects.filter(website=website, user=self.stranger, role=Role.OWNER).exists())
        self.assertTrue(AuditLog.objects.filter(website=website, action="website.connected").exists())

    def test_connecting_needs_an_address(self):
        response = self._connect(self.stranger)
        self.assertEqual(response.status_code, 400)
        self.assertIn("frontend_url", response.json())

    def test_bad_addresses_are_rejected(self):
        for url in ["ftp://example.com", "example.com", "https://user:pw@example.com", "https://example.com/?a=1", "https://example.com:99999"]:
            with self.subTest(url=url):
                response = self._connect(self.stranger, frontend_url=url)
                self.assertEqual(response.status_code, 400)
                self.assertIn("frontend_url", response.json())

    def test_local_development_address_leaves_the_domain_empty(self):
        response = self._connect(self.stranger, frontend_url="http://localhost:5173")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["frontend_url"], "http://localhost:5173")
        self.assertIsNone(response.json()["primary_domain"])

    def test_an_explicit_domain_wins_over_the_address(self):
        response = self._connect(self.stranger, frontend_url="https://staging.shop.example.com", primary_domain="shop.example.com")
        self.assertEqual(response.json()["primary_domain"], "shop.example.com")

    def test_taken_domain_is_reported_on_the_address_without_revealing_the_owner(self):
        create_website(self.owner, name="Other Tenant", primary_domain="shop.example.com")
        response = self._connect(self.stranger, frontend_url="https://shop.example.com")
        self.assertEqual(response.status_code, 400)
        self.assertIn("cannot be used", response.json()["frontend_url"][0])
        self.assertNotIn("Other Tenant", response.content.decode())

    def test_source_cannot_be_changed_after_registration(self):
        slug = self._connect(self.stranger, frontend_url="https://shop.example.com").json()["slug"]
        client = self.as_user(self.stranger)
        response = client.patch(f"/api/v1/websites/{slug}/", {"source": "created", "frontend_framework": "vue"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["source"], "connected")
        self.assertEqual(response.json()["frontend_framework"], "vue")
        # A connected website keeps an address.
        self.assertEqual(client.patch(f"/api/v1/websites/{slug}/", {"frontend_url": ""}, format="json").status_code, 400)

    def test_connected_website_stays_isolated(self):
        slug = self._connect(self.stranger, frontend_url="https://shop.example.com").json()["slug"]
        for user in (self.owner, self.viewer):
            with self.subTest(user=user.email):
                self.assertEqual(self.as_user(user).get(f"/api/v1/websites/{slug}/").status_code, 404)
                self.assertEqual(self.as_user(user).get(f"/api/v1/websites/{slug}/dashboard/").status_code, 404)

    def test_editors_cannot_change_the_connection(self):
        slug = self._connect(self.owner, frontend_url="https://shop.example.com").json()["slug"]
        Membership.objects.create(website=Website.objects.get(slug=slug), user=self.stranger, role=Role.EDITOR)
        response = self.as_user(self.stranger).patch(f"/api/v1/websites/{slug}/", {"frontend_url": "https://evil.example.com"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_dashboard_shows_connection_details_and_frontend_step(self):
        slug = self._connect(self.stranger, frontend_url="https://shop.example.com").json()["slug"]
        with self.settings(CMS_PUBLIC_API_URL="https://cms.example.com/api/v1"):
            body = self.as_user(self.stranger).get(f"/api/v1/websites/{slug}/dashboard/").json()
        self.assertEqual(body["connection"], {"api_base_url": "https://cms.example.com/api/v1", "website_id": slug})
        checklist = {item["key"]: item for item in body["setup_checklist"]}
        self.assertTrue(checklist["frontend"]["done"])
        self.assertTrue(checklist["domain"]["done"])

    def test_created_websites_default_to_created_and_skip_the_frontend_step(self):
        response = self.as_user(self.stranger).post("/api/v1/websites/", {"name": "Fresh"}, format="json")
        self.assertEqual(response.json()["source"], "created")
        body = self.as_user(self.stranger).get(f"/api/v1/websites/{response.json()['slug']}/dashboard/").json()
        self.assertNotIn("frontend", [item["key"] for item in body["setup_checklist"]])
