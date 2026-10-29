from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Invitation, User, UserSession
from apps.audit.models import AuditLog
from apps.content.models import Entry

from .models import Membership, Role, Website
from .services import create_website, ensure_default_workspace

PASSWORD = "correct-horse-battery"


class DefaultWorkspaceTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_setup_creates_the_workspace_and_opens_it(self):
        response = self.client.post(
            "/api/v1/auth/bootstrap/", {"email": "owner@example.com", "display_name": "Amara Okafor", "password": PASSWORD}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 201)
        website = Website.objects.get()
        self.assertTrue(website.is_default)
        self.assertEqual(website.content_types.count(), 4)
        token = response.json()["token"]
        workspace = self.client.get("/api/v1/workspace/", HTTP_AUTHORIZATION=f"Token {token}").json()
        self.assertEqual(workspace["website"]["slug"], website.slug)
        self.assertEqual(workspace["website"]["role"], "owner")
        self.assertIn("users.manage", workspace["website"]["permissions"])
        self.assertEqual(User.objects.get().first_name, "Amara")

    def test_existing_installation_uses_its_oldest_website(self):
        admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD)
        other = User.objects.create_user(email="o@example.com", password=PASSWORD)
        first = create_website(other, name="Kaadir Institute")
        create_website(other, name="Later")
        found = ensure_default_workspace(admin)
        self.assertEqual(found.pk, first.pk)
        first.refresh_from_db()
        self.assertTrue(first.is_default)
        self.assertTrue(Membership.objects.filter(website=first, user=admin, role=Role.OWNER).exists())

    def test_regular_users_are_not_given_a_workspace(self):
        user = User.objects.create_user(email="u@example.com", password=PASSWORD)
        self.assertIsNone(ensure_default_workspace(user))
        self.assertFalse(Website.objects.exists())

    def test_default_workspace_cannot_be_deleted(self):
        admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD)
        website = ensure_default_workspace(admin)
        client = APIClient()
        client.force_authenticate(admin)
        self.assertEqual(client.delete(f"/api/v1/websites/{website.slug}/").status_code, 400)


class AdminTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.root = User.objects.create_superuser(email="root@example.com", password=PASSWORD)
        self.admin = User.objects.create_user(email="admin@example.com", password=PASSWORD)
        self.editor = User.objects.create_user(email="editor@example.com", password=PASSWORD)
        self.author = User.objects.create_user(email="author@example.com", password=PASSWORD)
        self.site = create_website(self.root, name="Daily News")
        for user, role in [(self.admin, Role.ADMIN), (self.editor, Role.EDITOR), (self.author, Role.AUTHOR)]:
            Membership.objects.create(website=self.site, user=user, role=role)
        self.client = APIClient()
        self.base = "/api/v1/websites/daily-news"

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client


class RolePermissionTests(AdminTestCase):
    def test_roles_show_default_permissions(self):
        body = self.as_user(self.admin).get(f"{self.base}/roles/").json()
        roles = {role["key"]: role for role in body["roles"]}
        self.assertIn("content.article.publish", roles["editor"]["permissions"])
        self.assertNotIn("content.article.publish", roles["author"]["permissions"])
        self.assertFalse(roles["owner"]["editable"])
        self.assertEqual(roles["author"]["member_count"], 1)
        self.assertEqual({t["key"] for t in body["catalog"]["content_types"]}, {"article", "event", "publication", "page"})

    def test_granting_publish_to_authors_takes_effect(self):
        client = self.as_user(self.admin)
        current = set(next(r for r in client.get(f"{self.base}/roles/").json()["roles"] if r["key"] == "author")["permissions"])
        response = client.put(f"{self.base}/roles/author/", {"permissions": sorted(current | {"content.article.publish"})}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        entry = self.as_user(self.author).post(f"{self.base}/entries/", {"type": "article", "title": "Hello"}, format="json").json()
        self.assertIn("publish", entry["allowed_actions"])
        published = self.client.post(f"{self.base}/entries/{entry['id']}/transition/", {"action": "publish"}, format="json")
        self.assertEqual(published.json()["status"], "published")
        # Not for events, which were not granted.
        event = self.client.post(
            f"{self.base}/entries/", {"type": "event", "title": "Forum", "data": {"starts_at": "2099-01-01T10:00"}}, format="json"
        ).json()
        self.assertNotIn("publish", event["allowed_actions"])
        self.assertTrue(AuditLog.objects.filter(action="role.permissions_changed").exists())

    def test_removing_read_hides_content(self):
        self.as_user(self.editor).post(f"{self.base}/entries/", {"type": "page", "title": "About"}, format="json")
        client = self.as_user(self.admin)
        editor = set(next(r for r in client.get(f"{self.base}/roles/").json()["roles"] if r["key"] == "editor")["permissions"])
        client.put(f"{self.base}/roles/editor/", {"permissions": sorted(editor - {"content.page.read"})}, format="json")
        editor_client = self.as_user(self.editor)
        types = {t["key"] for t in editor_client.get(f"{self.base}/content-types/").json()}
        self.assertNotIn("page", types)
        self.assertEqual(editor_client.get(f"{self.base}/entries/?type=page").json()["count"], 0)
        page = Entry.objects.get()
        self.assertEqual(editor_client.get(f"{self.base}/entries/{page.pk}/").status_code, 404)

    def test_guards(self):
        client = self.as_user(self.admin)
        self.assertEqual(client.put(f"{self.base}/roles/owner/", {"permissions": []}, format="json").status_code, 400)
        self.assertEqual(client.put(f"{self.base}/roles/author/", {"permissions": ["content.article.fly"]}, format="json").status_code, 400)
        self.assertEqual(client.put(f"{self.base}/roles/admin/", {"permissions": []}, format="json").status_code, 400)  # own roles.manage
        self.assertEqual(self.as_user(self.editor).put(f"{self.base}/roles/author/", {"permissions": []}, format="json").status_code, 403)

    def test_cannot_grant_more_than_you_have(self):
        # An admin whose role lost domains.manage cannot hand it to editors.
        client = self.as_user(self.root)
        admin_perms = set(next(r for r in client.get(f"{self.base}/roles/").json()["roles"] if r["key"] == "admin")["permissions"])
        client.put(f"{self.base}/roles/admin/", {"permissions": sorted(admin_perms - {"domains.manage"})}, format="json")
        editor = set(next(r for r in client.get(f"{self.base}/roles/").json()["roles"] if r["key"] == "editor")["permissions"])
        response = self.as_user(self.admin).put(f"{self.base}/roles/editor/", {"permissions": sorted(editor | {"domains.manage"})}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_settings_follow_permissions(self):
        client = self.as_user(self.admin)
        self.assertEqual(client.patch(f"{self.base}/branding/", {"tagline": "x"}, format="json").status_code, 200)
        admin_perms = set(next(r for r in self.as_user(self.root).get(f"{self.base}/roles/").json()["roles"] if r["key"] == "admin")["permissions"])
        self.client.put(f"{self.base}/roles/admin/", {"permissions": sorted(admin_perms - {"branding.manage"})}, format="json")
        self.assertEqual(self.as_user(self.admin).patch(f"{self.base}/branding/", {"tagline": "y"}, format="json").status_code, 403)

    def test_role_settings_are_per_website(self):
        other = create_website(self.root, name="Other")
        Membership.objects.create(website=other, user=self.author, role=Role.AUTHOR)
        client = self.as_user(self.root)
        author = set(next(r for r in client.get(f"{self.base}/roles/").json()["roles"] if r["key"] == "author")["permissions"])
        client.put(f"{self.base}/roles/author/", {"permissions": sorted(author | {"content.article.publish"})}, format="json")
        other_author = next(r for r in client.get(f"/api/v1/websites/{other.slug}/roles/").json()["roles"] if r["key"] == "author")
        self.assertNotIn("content.article.publish", other_author["permissions"])


@mock.patch("apps.websites.views.mail.send", return_value=(False, "Email is not set up."))
class UserManagementTests(AdminTestCase):
    def test_invite_new_person(self, send):
        response = self.as_user(self.admin).post(
            f"{self.base}/members/", {"email": "Nimco@Example.com", "role": "author", "first_name": "Nimco"}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual((body["status"], body["role"], body["first_name"]), ("invited", "author", "Nimco"))
        self.assertIn("/invite?token=", body["invite_url"])
        self.assertFalse(body["email_sent"])
        user = User.objects.get(email__iexact="nimco@example.com")
        self.assertFalse(user.has_usable_password())
        self.assertTrue(Invitation.objects.filter(user=user).exists())
        send.assert_called_once()

    def test_resend_invitation(self, send):
        member = self.as_user(self.admin).post(f"{self.base}/members/", {"email": "n@example.com", "role": "viewer"}, format="json").json()
        again = self.client.post(f"{self.base}/members/{member['id']}/invitation/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Invitation.objects.filter(user__email="n@example.com").count(), 1)
        active = Membership.objects.get(user=self.editor)
        self.assertEqual(self.client.post(f"{self.base}/members/{active.pk}/invitation/").status_code, 400)

    def test_only_platform_admins_disable_accounts(self, send):
        membership = Membership.objects.get(user=self.author)
        url = f"{self.base}/members/{membership.pk}/"
        self.assertEqual(self.as_user(self.admin).patch(url, {"is_active": False}, format="json").status_code, 403)
        UserSession.issue(self.author)
        response = self.as_user(self.root).patch(url, {"is_active": False, "first_name": "Ayaan"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["status"], "disabled")
        self.assertFalse(UserSession.objects.filter(user=self.author).exists())
        root_membership = Membership.objects.get(user=self.root, website=self.site)
        self.assertEqual(self.client.patch(f"{self.base}/members/{root_membership.pk}/", {"is_active": False}, format="json").status_code, 400)

    def test_role_changes_need_users_manage(self, send):
        membership = Membership.objects.get(user=self.author)
        self.assertEqual(self.as_user(self.editor).patch(f"{self.base}/members/{membership.pk}/", {"role": "editor"}, format="json").status_code, 403)
        self.assertEqual(self.as_user(self.admin).patch(f"{self.base}/members/{membership.pk}/", {"role": "editor"}, format="json").json()["role"], "editor")

    def test_search(self, send):
        self.author.first_name = "Ayaan"
        self.author.save()
        found = self.as_user(self.editor).get(f"{self.base}/members/?search=ayaan").json()
        self.assertEqual([m["email"] for m in found], ["author@example.com"])


class AuditLogTests(AdminTestCase):
    def test_filters(self):
        client = self.as_user(self.admin)
        client.patch(f"{self.base}/branding/", {"tagline": "x"}, format="json")
        self.as_user(self.editor).post(f"{self.base}/entries/", {"type": "article", "title": "Budget"}, format="json")
        client = self.as_user(self.admin)
        logs = client.get(f"{self.base}/audit-logs/?action=entry.").json()
        self.assertTrue(logs["results"])
        self.assertTrue(all(row["action"].startswith("entry.") for row in logs["results"]))
        self.assertEqual({row["actor_email"] for row in client.get(f"{self.base}/audit-logs/?actor=editor").json()["results"]}, {"editor@example.com"})
        self.assertEqual(client.get(f"{self.base}/audit-logs/?date_from=2099-01-01").json()["count"], 0)

    def test_installation_events_only_for_platform_admins(self):
        AuditLog.objects.create(action="auth.login", summary="root signed in", actor=self.root)
        admin_view = self.as_user(self.admin).get(f"{self.base}/audit-logs/?scope=all&action=auth.").json()
        self.assertEqual(admin_view["count"], 0)
        root_view = self.as_user(self.root).get(f"{self.base}/audit-logs/?scope=all&action=auth.").json()
        self.assertEqual(root_view["count"], 1)

    def test_editors_cannot_read_audit_logs(self):
        self.assertEqual(self.as_user(self.editor).get(f"{self.base}/audit-logs/").status_code, 403)


class AuditTrailDetailTests(AdminTestCase):
    def test_entries_record_where_the_change_came_from(self):
        client = self.as_user(self.editor)
        client.post(
            f"{self.base}/entries/", {"type": "article", "title": "Budget"}, format="json",
            HTTP_X_CLIENT_USER_AGENT="Mozilla/5.0 (Windows NT 10.0) Chrome/130", HTTP_X_CLIENT_IP="203.0.113.9",
        )
        row = self.as_user(self.admin).get(f"{self.base}/audit-logs/?action=entry.created").json()["results"][0]
        self.assertEqual((row["method"], row["path"]), ("POST", f"{self.base}/entries/"))
        self.assertEqual((row["ip_address"], row["user_agent"]), ("203.0.113.9", "Mozilla/5.0 (Windows NT 10.0) Chrome/130"))
        self.assertEqual(row["module"], "Content")
        self.assertEqual(row["actor"]["email"], "editor@example.com")
        self.assertEqual(row["website_name"], "Daily News")

    def test_changes_outside_a_request_have_no_request_details(self):
        from apps.audit import services as audit

        audit.record(action="entry.publish", summary="Published on schedule", website=self.site)
        row = AuditLog.objects.get(summary="Published on schedule")
        self.assertEqual((row.path, row.ip_address), ("", ""))


class ReadableAuditTests(AdminTestCase):
    CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"

    def entry(self, agent, ip):
        self.as_user(self.editor).post(
            f"{self.base}/entries/", {"type": "article", "title": "Budget"}, format="json",
            HTTP_X_CLIENT_USER_AGENT=agent, HTTP_X_CLIENT_IP=ip,
        )
        return self.as_user(self.admin).get(f"{self.base}/audit-logs/?action=entry.created").json()["results"][0]

    def test_server_parses_browser_system_and_device(self):
        row = self.entry(self.CHROME, "::ffff:41.78.73.1")
        self.assertEqual((row["browser"], row["os"], row["device"]), ("Chrome 130", "Windows 10", "Desktop"))
        self.assertEqual((row["ip_address"], row["ip_note"]), ("41.78.73.1", ""))
        self.assertEqual((row["action_label"], row["target_label"]), ("Created content", "Content"))

    def test_phones_scripts_and_local_addresses(self):
        phone = self.entry(self.IPHONE, "::1")
        self.assertEqual((phone["browser"], phone["device"]), ("Mobile Safari 17", "Phone"))
        self.assertTrue(phone["os"].startswith("iOS 17"))
        self.assertEqual(phone["ip_note"], "This computer (local development)")
        script = self.entry("curl/8.4.0", "10.0.0.4")
        self.assertEqual(script["device"], "Script or API client")
        self.assertEqual(script["ip_note"], "Private network")
