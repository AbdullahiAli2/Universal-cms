from datetime import timedelta
from unittest import mock

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from .models import SetupLock, User, UserSession, hash_key
from .throttles import LoginEmailThrottle


class AuthTests(TestCase):
    def setUp(self):
        cache.clear()  # login throttling is per test

    def _login(self, email, password):
        return self.client.post("/api/v1/auth/login/", {"email": email, "password": password}, content_type="application/json")

    def _auth(self, token):
        return {"HTTP_AUTHORIZATION": f"Token {token}"}

    def test_status_reports_setup_state(self):
        self.assertEqual(self.client.get("/api/v1/auth/status/").json(), {"initialized": False})
        User.objects.create_user(email="a@example.com", password="correct-horse-battery")
        self.assertEqual(self.client.get("/api/v1/auth/status/").json(), {"initialized": True})

    def test_bootstrap_creates_platform_admin_once(self):
        payload = {"email": "owner@example.com", "display_name": "Owner", "password": "correct-horse-battery"}
        response = self.client.post("/api/v1/auth/bootstrap/", payload, content_type="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.json())
        user = User.objects.get(email="owner@example.com")
        self.assertTrue(user.is_superuser)

        again = self.client.post("/api/v1/auth/bootstrap/", payload, content_type="application/json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(User.objects.count(), 1)

    def test_bootstrap_rejects_weak_password(self):
        response = self.client.post(
            "/api/v1/auth/bootstrap/",
            {"email": "owner@example.com", "display_name": "Owner", "password": "short"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())
        self.assertFalse(User.objects.exists())

    def test_login_me_and_logout(self):
        User.objects.create_user(email="u@example.com", password="correct-horse-battery")
        response = self._login("u@example.com", "correct-horse-battery")
        self.assertEqual(response.status_code, 200)
        token = response.json()["token"]

        me = self.client.get("/api/v1/auth/me/", **self._auth(token))
        self.assertEqual(me.json()["email"], "u@example.com")

        self.assertEqual(self.client.post("/api/v1/auth/logout/", **self._auth(token)).status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me/", **self._auth(token)).status_code, 401)

    def test_wrong_password_is_rejected(self):
        User.objects.create_user(email="u@example.com", password="correct-horse-battery")
        self.assertEqual(self._login("u@example.com", "wrong-password-here").status_code, 401)

    def test_inactive_user_cannot_sign_in(self):
        User.objects.create_user(email="u@example.com", password="correct-horse-battery", is_active=False)
        self.assertEqual(self._login("u@example.com", "correct-horse-battery").status_code, 401)

    def test_expired_token_is_rejected(self):
        user = User.objects.create_user(email="u@example.com", password="correct-horse-battery")
        session, raw = UserSession.issue(user)
        UserSession.objects.filter(pk=session.pk).update(created_at=timezone.now() - timedelta(days=365))
        response = self.client.get("/api/v1/auth/me/", **self._auth(raw))
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_requests_are_rejected(self):
        self.assertEqual(self.client.get("/api/v1/websites/").status_code, 401)


class BootstrapRaceTests(TestCase):
    """The database lock must stop a second setup even when the "no users" check would pass."""

    def setUp(self):
        cache.clear()

    def _bootstrap(self, email="owner@example.com"):
        return self.client.post(
            "/api/v1/auth/bootstrap/",
            {"email": email, "display_name": "Owner", "password": "correct-horse-battery"},
            content_type="application/json",
        )

    def test_second_setup_is_refused_when_lock_already_committed(self):
        # Simulates the losing side of a race: the other request already committed the lock.
        SetupLock.objects.create(key="bootstrap")
        response = self._bootstrap()
        self.assertEqual(response.status_code, 409)
        self.assertFalse(User.objects.exists())

    def test_setup_is_refused_for_existing_install_without_lock(self):
        User.objects.create_superuser(email="old@example.com", password="correct-horse-battery")
        self.assertEqual(self._bootstrap().status_code, 409)
        self.assertEqual(User.objects.count(), 1)

    def test_failed_setup_rolls_back_the_lock(self):
        User.objects.create_superuser(email="old@example.com", password="correct-horse-battery")
        self._bootstrap()
        self.assertFalse(SetupLock.objects.exists())

    def test_expired_tokens_are_pruned_on_sign_in(self):
        user = User.objects.create_user(email="u@example.com", password="correct-horse-battery")
        old, _raw = UserSession.issue(user)
        UserSession.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=365))
        self.client.post(
            "/api/v1/auth/login/",
            {"email": "u@example.com", "password": "correct-horse-battery"},
            content_type="application/json",
        )
        self.assertFalse(UserSession.objects.filter(pk=old.pk).exists())


class LoginSecurityTests(TestCase):
    PASSWORD = "correct-horse-battery"

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email="u@example.com", password=self.PASSWORD)

    def _login(self, email, password, **extra):
        return self.client.post(
            "/api/v1/auth/login/", {"email": email, "password": password}, content_type="application/json", **extra
        )

    def test_login_refuses_get_with_credentials_in_query_string(self):
        response = self.client.get("/api/v1/auth/login/", {"email": "u@example.com", "password": self.PASSWORD})
        self.assertEqual(response.status_code, 405)
        self.assertNotIn("token", response.content.decode())
        self.assertFalse(UserSession.objects.exists())

    def test_credentials_in_query_string_are_ignored_on_post(self):
        response = self.client.post(
            f"/api/v1/auth/login/?email=u@example.com&password={self.PASSWORD}", {}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(UserSession.objects.exists())

    def test_password_is_stored_hashed(self):
        self.user.refresh_from_db()
        self.assertNotIn(self.PASSWORD, self.user.password)
        self.assertTrue(self.user.password.startswith(("pbkdf2_", "argon2", "bcrypt", "scrypt")))
        self.assertTrue(self.user.check_password(self.PASSWORD))

    def test_unknown_email_and_wrong_password_get_the_same_answer(self):
        unknown = self._login("nobody@example.com", "whatever-password-1")
        wrong = self._login("u@example.com", "whatever-password-1")
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong.status_code, 401)
        self.assertEqual(unknown.json(), wrong.json())

    def test_inactive_account_gets_the_generic_answer(self):
        User.objects.create_user(email="off@example.com", password=self.PASSWORD, is_active=False)
        self.assertEqual(self._login("off@example.com", self.PASSWORD).json(), self._login("u@example.com", "nope-nope-nope").json())

    def test_response_never_echoes_the_password(self):
        response = self._login("u@example.com", "wrong-secret-value")
        self.assertNotIn("wrong-secret-value", response.content.decode())

    @mock.patch.object(LoginEmailThrottle, "rate", "3/min", create=True)
    def test_attempts_are_limited_per_account_across_addresses(self):
        for index in range(3):
            self._login("U@Example.com", f"wrong-password-{index}", REMOTE_ADDR=f"10.0.0.{index}")
        blocked = self._login("u@example.com", self.PASSWORD, REMOTE_ADDR="10.0.0.99")
        self.assertEqual(blocked.status_code, 429)
        self.assertNotIn("token", blocked.json())
        # Another account is not affected.
        User.objects.create_user(email="other@example.com", password=self.PASSWORD)
        self.assertEqual(self._login("other@example.com", self.PASSWORD, REMOTE_ADDR="10.0.0.99").status_code, 200)

    @mock.patch.object(LoginEmailThrottle, "rate", "2/min", create=True)
    def test_throttled_answer_is_the_same_for_unknown_accounts(self):
        for _ in range(2):
            self._login("nobody@example.com", "x-wrong-password")
            self._login("u@example.com", "x-wrong-password")
        unknown = self._login("nobody@example.com", "x-wrong-password")
        known = self._login("u@example.com", "x-wrong-password")
        self.assertEqual((unknown.status_code, known.status_code), (429, 429))

    def test_each_sign_in_is_its_own_session(self):
        first = self._login("u@example.com", self.PASSWORD)
        second = self._login("u@example.com", self.PASSWORD)
        self.assertEqual((first.status_code, second.status_code), (200, 200))
        laptop, phone = first.json()["token"], second.json()["token"]
        self.assertNotEqual(laptop, phone)
        for token in (laptop, phone):
            self.assertEqual(self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Token {token}").status_code, 200)
        # Signing out on one device leaves the other signed in.
        self.client.post("/api/v1/auth/logout/", HTTP_AUTHORIZATION=f"Token {laptop}")
        self.assertEqual(self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Token {laptop}").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Token {phone}").status_code, 200)

    def test_only_a_hash_of_the_key_is_stored(self):
        token = self._login("u@example.com", self.PASSWORD).json()["token"]
        self.assertFalse(UserSession.objects.filter(key_hash=token).exists())
        self.assertEqual(UserSession.objects.get().key_hash, hash_key(token))

    def test_logout_revokes_the_token(self):
        token = self._login("u@example.com", self.PASSWORD).json()["token"]
        self.assertEqual(self.client.post("/api/v1/auth/logout/", HTTP_AUTHORIZATION=f"Token {token}").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Token {token}").status_code, 401)
        self.assertFalse(UserSession.objects.filter(key_hash=hash_key(token)).exists())

    def test_logout_requires_a_valid_token(self):
        self.assertEqual(self.client.post("/api/v1/auth/logout/").status_code, 401)
        self.assertEqual(self.client.post("/api/v1/auth/logout/", HTTP_AUTHORIZATION="Token not-a-token").status_code, 401)

    def test_token_expires_after_ttl(self):
        token = self._login("u@example.com", self.PASSWORD).json()["token"]
        with self.settings(CMS_TOKEN_TTL_DAYS=0):
            self.assertEqual(self.client.get("/api/v1/auth/me/", HTTP_AUTHORIZATION=f"Token {token}").status_code, 401)
        self.assertFalse(UserSession.objects.filter(key_hash=hash_key(token)).exists())

    def test_session_cookie_auth_is_not_accepted(self):
        # The API only trusts the Authorization header, so a browser cookie alone cannot be used for CSRF.
        self.client.force_login(self.user)
        self.assertEqual(self.client.get("/api/v1/auth/me/").status_code, 401)
        self.assertEqual(self.client.get("/api/v1/websites/").status_code, 401)
