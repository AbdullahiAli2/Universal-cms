import smtplib
from unittest import mock

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditLog

from .crypto import decrypt
from .models import EmailSettings
from .services import send

URL = "/api/v1/settings/email/"
SMTP = {
    "enabled": True, "provider": "brevo", "host": "smtp-relay.brevo.com", "port": 587, "security": "starttls",
    "username": "apikey", "password": "s3cret-smtp-key", "from_name": "Kaadir Institute", "from_email": "news@kaadir.org",
    "reply_to": "info@kaadir.org",
}


class EmailSettingsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.root = User.objects.create_superuser(email="root@example.com", password="correct-horse-battery")
        self.member = User.objects.create_user(email="m@example.com", password="correct-horse-battery")
        self.client = APIClient()
        self.client.force_authenticate(self.root)

    def test_password_is_encrypted_and_never_returned(self):
        response = self.client.put(URL, SMTP, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertNotIn("password", body)
        self.assertTrue(body["has_password"])
        stored = EmailSettings.load().password_encrypted
        self.assertNotIn("s3cret", stored)
        self.assertEqual(decrypt(stored), "s3cret-smtp-key")
        # Saving without a password keeps it.
        self.client.put(URL, {"from_name": "Kaadir"}, format="json")
        self.assertEqual(decrypt(EmailSettings.load().password_encrypted), "s3cret-smtp-key")
        self.assertTrue(AuditLog.objects.filter(action="email.settings_updated").exists())
        self.assertNotIn("s3cret", str(list(AuditLog.objects.values_list("summary", flat=True))))

    def test_validation(self):
        bad = self.client.put(URL, {"enabled": True, "host": "not a host", "port": 70000, "from_name": "Evil\r\nBcc: x"}, format="json")
        self.assertEqual(set(bad.json()), {"host", "port", "from_name"})
        missing = self.client.put(URL, {"enabled": True}, format="json")
        self.assertEqual(set(missing.json()), {"host", "from_email"})

    def test_local_relays_are_accepted(self):
        for host in ["localhost", "mailpit", "10.0.0.5", "smtp.example.com"]:
            with self.subTest(host=host):
                self.assertEqual(self.client.put(URL, {"host": host}, format="json").status_code, 200)
        self.assertEqual(self.client.put(URL, {"host": "smtp example.com"}, format="json").status_code, 400)

    def test_only_platform_admins(self):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.assertEqual(self.client.put(URL, SMTP, format="json").status_code, 403)
        self.assertEqual(self.client.post(f"{URL}test/", {"to": "a@example.com"}, format="json").status_code, 403)

    def test_send_test_email_records_the_result(self):
        self.client.put(URL, SMTP, format="json")
        with mock.patch("apps.mail.services.EmailBackend") as backend:
            backend.return_value.send_messages.return_value = 1
            ok = self.client.post(f"{URL}test/", {"to": "me@example.com"}, format="json").json()
        self.assertTrue(ok["ok"])
        kwargs = backend.call_args.kwargs
        self.assertEqual((kwargs["host"], kwargs["port"], kwargs["use_tls"], kwargs["password"]), ("smtp-relay.brevo.com", 587, True, "s3cret-smtp-key"))
        message = backend.return_value.send_messages.call_args.args[0][0]
        self.assertEqual(message.from_email, "Kaadir Institute <news@kaadir.org>")
        self.assertEqual(message.reply_to, ["info@kaadir.org"])

        with mock.patch("apps.mail.services.EmailBackend") as backend:
            backend.return_value.send_messages.side_effect = smtplib.SMTPAuthenticationError(535, b"bad")
            failed = self.client.post(f"{URL}test/", {"to": "me@example.com"}, format="json").json()
        self.assertFalse(failed["ok"])
        self.assertIn("user name or password", failed["error"])
        self.assertFalse(EmailSettings.load().last_test_ok)

    @override_settings(CMS_ENCRYPTION_KEY="a-different-key")
    def test_unreadable_password_is_reported(self):
        config = EmailSettings.load()
        config.host, config.from_email = "smtp.example.com", "a@example.com"
        config.password_encrypted = "gAAAA-not-a-valid-token"
        config.save()
        result = self.client.post(f"{URL}test/", {"to": "me@example.com"}, format="json").json()
        self.assertIn("cannot be read", result["error"])

    def test_send_is_skipped_until_enabled(self):
        self.assertEqual(send("a@example.com", "Hi", "Body"), (False, "Email is not set up."))
