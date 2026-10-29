from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from apps.audit.models import AuditLog

from .models import Invitation, User, UserSession, hash_key
from .services import create_invitation

PASSWORD = "correct-horse-battery"


class ProfileTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="amara@example.com", password=PASSWORD)

    def login(self, agent="Firefox", ip="203.0.113.7"):
        response = self.client.post(
            "/api/v1/auth/login/", {"email": "amara@example.com", "password": PASSWORD}, content_type="application/json",
            HTTP_X_CLIENT_USER_AGENT=agent, HTTP_X_CLIENT_IP=ip,
        )
        return response.json()["token"]

    def auth(self, token):
        return {"HTTP_AUTHORIZATION": f"Token {token}"}


class ProfileTests(ProfileTestCase):
    def test_update_names_username_and_preferences(self):
        token = self.login()
        response = self.client.patch(
            "/api/v1/auth/me/",
            {"first_name": " Amara ", "last_name": "Okafor", "username": "Amara.O", "language": "so", "theme": "dark"},
            content_type="application/json", **self.auth(token),
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual((body["first_name"], body["full_name"], body["username"]), ("Amara", "Amara Okafor", "amara.o"))
        self.assertEqual((body["language"], body["theme"]), ("so", "dark"))
        self.assertTrue(AuditLog.objects.filter(action="profile.updated").exists())

    def test_username_rules(self):
        User.objects.create_user(email="other@example.com", password=PASSWORD, username="taken")
        token = self.login()
        for value in ["TAKEN", "a", "has space", "x" * 31]:
            with self.subTest(value=value):
                response = self.client.patch("/api/v1/auth/me/", {"username": value}, content_type="application/json", **self.auth(token))
                self.assertEqual(response.status_code, 400)

    def test_email_change_needs_the_current_password(self):
        token = self.login()
        url = "/api/v1/auth/me/"
        self.assertEqual(self.client.patch(url, {"email": "new@example.com"}, content_type="application/json", **self.auth(token)).status_code, 400)
        ok = self.client.patch(url, {"email": "new@example.com", "current_password": PASSWORD}, content_type="application/json", **self.auth(token))
        self.assertEqual(ok.json()["email"], "new@example.com")

    def test_change_password_signs_out_other_sessions(self):
        laptop, phone = self.login("Laptop"), self.login("Phone")
        url = "/api/v1/auth/me/password/"
        wrong = self.client.post(url, {"current_password": "nope-nope-nope", "new_password": "a-brand-new-secret"}, content_type="application/json", **self.auth(laptop))
        self.assertEqual(wrong.status_code, 400)
        weak = self.client.post(url, {"current_password": PASSWORD, "new_password": "password1234"}, content_type="application/json", **self.auth(laptop))
        self.assertEqual(weak.status_code, 400)
        ok = self.client.post(url, {"current_password": PASSWORD, "new_password": "a-brand-new-secret"}, content_type="application/json", **self.auth(laptop))
        self.assertEqual(ok.json(), {"other_sessions_ended": 1})
        self.assertEqual(self.client.get("/api/v1/auth/me/", **self.auth(laptop)).status_code, 200)
        self.assertEqual(self.client.get("/api/v1/auth/me/", **self.auth(phone)).status_code, 401)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("a-brand-new-secret"))


class SessionTests(ProfileTestCase):
    def test_list_and_revoke_sessions(self):
        laptop, phone = self.login("Laptop browser", "198.51.100.1"), self.login("Phone browser")
        sessions = self.client.get("/api/v1/auth/sessions/", **self.auth(laptop)).json()
        self.assertEqual(len(sessions), 2)
        current = [item for item in sessions if item["current"]]
        self.assertEqual(current[0]["user_agent"], "Laptop browser")
        self.assertEqual(current[0]["ip_address"], "198.51.100.1")
        other = next(item for item in sessions if not item["current"])
        self.assertEqual(self.client.delete(f"/api/v1/auth/sessions/{other['id']}/", **self.auth(laptop)).status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me/", **self.auth(phone)).status_code, 401)

    def test_cannot_revoke_someone_elses_session(self):
        mine = self.login()
        stranger = User.objects.create_user(email="s@example.com", password=PASSWORD)
        theirs, _raw = UserSession.issue(stranger)
        self.assertEqual(self.client.delete(f"/api/v1/auth/sessions/{theirs.pk}/", **self.auth(mine)).status_code, 404)
        self.assertTrue(UserSession.objects.filter(pk=theirs.pk).exists())

    def test_revoke_others(self):
        keep = self.login()
        self.login()
        self.login()
        self.assertEqual(self.client.post("/api/v1/auth/sessions/revoke-others/", **self.auth(keep)).json(), {"ended": 2})
        self.assertEqual(UserSession.objects.count(), 1)

    def test_disabled_accounts_lose_access_at_once(self):
        token = self.login()
        User.objects.filter(pk=self.user.pk).update(is_active=False)
        self.assertEqual(self.client.get("/api/v1/auth/me/", **self.auth(token)).status_code, 401)


class InvitationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.admin = User.objects.create_superuser(email="admin@example.com", password=PASSWORD)
        self.invitee = User.objects.create_user(email="new@example.com", password=None)

    def test_accept_sets_password_and_signs_in(self):
        raw = create_invitation(self.invitee, self.admin)
        self.assertEqual(self.client.get(f"/api/v1/auth/invitation/?token={raw}").json()["email"], "new@example.com")
        response = self.client.post(
            "/api/v1/auth/invitation/accept/",
            {"token": raw, "password": "my-own-long-secret", "first_name": "Nimco", "last_name": "Ali"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIn("token", response.json())
        self.invitee.refresh_from_db()
        self.assertTrue(self.invitee.check_password("my-own-long-secret"))
        self.assertEqual(self.invitee.full_name, "Nimco Ali")
        # One use only.
        again = self.client.post("/api/v1/auth/invitation/accept/", {"token": raw, "password": "another-long-secret"}, content_type="application/json")
        self.assertEqual(again.status_code, 400)

    def test_expired_or_unknown_tokens(self):
        raw = create_invitation(self.invitee, self.admin)
        Invitation.objects.update(expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.client.get(f"/api/v1/auth/invitation/?token={raw}").json(), {"valid": False})
        self.assertEqual(self.client.get("/api/v1/auth/invitation/?token=made-up").json(), {"valid": False})

    def test_new_invitation_replaces_the_old_one(self):
        first = create_invitation(self.invitee, self.admin)
        create_invitation(self.invitee, self.admin)
        self.assertFalse(Invitation.objects.filter(token_hash=hash_key(first)).exists())

    def test_weak_password_is_refused(self):
        raw = create_invitation(self.invitee, self.admin)
        response = self.client.post("/api/v1/auth/invitation/accept/", {"token": raw, "password": "password1234"}, content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())


import io
import shutil
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image

AVATAR_ROOT = tempfile.mkdtemp()


def image_file(name="me.png", size=(600, 400), fmt="PNG"):
    buffer = io.BytesIO()
    Image.new("RGB", size, "teal").save(buffer, fmt)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type=f"image/{fmt.lower()}")


@override_settings(MEDIA_ROOT=AVATAR_ROOT)
class AvatarTests(ProfileTestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(AVATAR_ROOT, ignore_errors=True)

    def upload(self, token, file):
        return self.client.post("/api/v1/auth/me/avatar/", {"avatar": file}, **self.auth(token))

    def test_upload_crops_to_a_square_webp_and_replaces_the_old_one(self):
        token = self.login()
        first = self.upload(token, image_file())
        self.assertEqual(first.status_code, 200, first.content)
        url = first.json()["avatar_url"]
        self.assertRegex(url, r"^/media/avatars/[0-9a-f]{32}\.webp$")
        served = self.client.get(url)
        self.assertEqual(served.status_code, 200)
        with Image.open(io.BytesIO(b"".join(served.streaming_content))) as stored:
            self.assertEqual((stored.format, stored.size), ("WEBP", (256, 256)))
        second = self.upload(token, image_file("other.jpg", fmt="JPEG")).json()["avatar_url"]
        self.assertNotEqual(url, second)
        self.assertEqual(self.client.get(url).status_code, 404)  # the old file is gone
        self.assertTrue(AuditLog.objects.filter(action="profile.avatar_updated").exists())

    def test_rejects_non_images_and_large_files(self):
        token = self.login()
        fake = SimpleUploadedFile("evil.png", b"<script>alert(1)</script>", content_type="image/png")
        self.assertEqual(self.upload(token, fake).status_code, 400)
        self.assertEqual(self.client.post("/api/v1/auth/me/avatar/", {}, **self.auth(token)).status_code, 400)
        big = SimpleUploadedFile("big.png", b"0" * (5 * 1024 * 1024 + 1), content_type="image/png")
        self.assertEqual(self.upload(token, big).status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar, "")

    def test_remove(self):
        token = self.login()
        url = self.upload(token, image_file()).json()["avatar_url"]
        removed = self.client.delete("/api/v1/auth/me/avatar/", **self.auth(token))
        self.assertIsNone(removed.json()["avatar_url"])
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_requires_sign_in(self):
        self.assertEqual(self.client.post("/api/v1/auth/me/avatar/", {"avatar": image_file()}).status_code, 401)
