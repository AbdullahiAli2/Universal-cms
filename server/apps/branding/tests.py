from unittest import mock

import dns.resolver
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.media.models import MediaAsset, MediaKind
from apps.websites.models import Membership, Role, Website
from apps.websites.services import create_website

from .models import Domain

BASE = "/api/v1/websites/kaadir-institute"


class BrandingTestCase(TestCase):
    def setUp(self):
        cache.clear()
        make = lambda email: User.objects.create_user(email=email, password="correct-horse-battery")  # noqa: E731
        self.owner, self.admin, self.editor, self.stranger = (make(f"{n}@example.com") for n in ("owner", "admin", "editor", "stranger"))
        self.site = create_website(self.owner, name="Kaadir Institute", primary_domain="kaadir.org")
        Membership.objects.create(website=self.site, user=self.admin, role=Role.ADMIN)
        Membership.objects.create(website=self.site, user=self.editor, role=Role.EDITOR)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client


class BrandingTests(BrandingTestCase):
    def test_admin_sets_kaadir_branding(self):
        logo = MediaAsset.objects.create(website=self.site, kind=MediaKind.IMAGE, title="Logo", file="1/" + "a" * 32 + ".png")
        payload = {
            "tagline": "Independent research for Somalia",
            "logo": logo.pk,
            "primary_color": "#064B63",
            "accent_color": "#74133f",
            "heading_font": "Source Serif 4",
            "body_font": "Plus Jakarta Sans",
            "contact_email": "info@kaadir.org",
            "address": "Mogadishu, Somalia",
            "socials": [{"network": "linkedin", "url": "https://www.linkedin.com/company/kaadir"}],
        }
        response = self.as_user(self.admin).patch(f"{BASE}/branding/", payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body["primary_color"], "#064b63")
        self.assertEqual(body["assets"]["logo"]["title"], "Logo")
        self.assertIn("Tajawal", body["options"]["fonts"])
        self.assertEqual(self.as_user(self.editor).get(f"{BASE}/branding/").json()["tagline"], "Independent research for Somalia")

    def test_editors_cannot_change_branding(self):
        self.assertEqual(self.as_user(self.editor).patch(f"{BASE}/branding/", {"tagline": "x"}, format="json").status_code, 403)

    def test_validation(self):
        other = create_website(self.stranger, name="Other")
        foreign = MediaAsset.objects.create(website=other, kind=MediaKind.IMAGE, title="Theirs", file="9/" + "b" * 32 + ".png")
        pdf = MediaAsset.objects.create(website=self.site, kind=MediaKind.DOCUMENT, title="Doc", file="1/" + "c" * 32 + ".pdf")
        response = self.as_user(self.admin).patch(
            f"{BASE}/branding/",
            {"primary_color": "teal", "logo": foreign.pk, "icon": pdf.pk, "heading_font": "Comic Sans", "socials": [{"network": "myspace", "url": "x"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {"primary_color", "logo", "icon", "heading_font", "socials"})

    def test_strangers_get_404(self):
        self.assertEqual(self.as_user(self.stranger).get(f"{BASE}/branding/").status_code, 404)


def txt(*values):
    return mock.patch("apps.branding.services.lookup_txt", return_value=list(values))


class DomainTests(BrandingTestCase):
    def test_primary_domain_is_listed_with_its_record(self):
        domains = self.as_user(self.editor).get(f"{BASE}/domains/").json()
        self.assertEqual(domains[0]["hostname"], "kaadir.org")
        self.assertTrue(domains[0]["is_primary"])
        self.assertEqual(domains[0]["record_name"], "_universal-cms.kaadir.org")
        self.assertTrue(domains[0]["record_value"].startswith("universal-cms-verify="))

    def test_add_verify_and_make_primary(self):
        client = self.as_user(self.admin)
        added = client.post(f"{BASE}/domains/", {"hostname": "https://WWW.Kaadir.org/about"}, format="json")
        self.assertEqual(added.status_code, 201, added.content)
        domain = added.json()
        self.assertEqual(domain["hostname"], "www.kaadir.org")
        self.assertEqual(client.post(f"{BASE}/domains/{domain['id']}/make-primary/").status_code, 400)  # not verified
        with txt("something-else"):
            checked = client.post(f"{BASE}/domains/{domain['id']}/verify/").json()
        self.assertIsNone(checked["verified_at"])
        self.assertIn("does not match", checked["last_error"])
        with txt(domain["record_value"]):
            checked = client.post(f"{BASE}/domains/{domain['id']}/verify/").json()
        self.assertIsNotNone(checked["verified_at"])
        self.assertEqual(client.post(f"{BASE}/domains/{domain['id']}/make-primary/").status_code, 200)
        self.assertEqual(Website.objects.get(pk=self.site.pk).primary_domain, "www.kaadir.org")

    def test_missing_record_is_explained(self):
        domain = self.as_user(self.admin).post(f"{BASE}/domains/", {"hostname": "kaadir.so"}, format="json").json()
        with mock.patch("apps.branding.services.lookup_txt", side_effect=dns.resolver.NXDOMAIN()):
            checked = self.client.post(f"{BASE}/domains/{domain['id']}/verify/").json()
        self.assertIn("No record named _universal-cms.kaadir.so", checked["last_error"])

    def test_domains_cannot_be_claimed_twice(self):
        other = create_website(self.stranger, name="Other", primary_domain="other.org")
        client = self.as_user(self.admin)
        self.assertEqual(client.post(f"{BASE}/domains/", {"hostname": "other.org"}, format="json").status_code, 400)
        client.post(f"{BASE}/domains/", {"hostname": "kaadir.so"}, format="json")
        stranger = self.as_user(self.stranger)
        self.assertEqual(stranger.post(f"/api/v1/websites/{other.slug}/domains/", {"hostname": "kaadir.so"}, format="json").status_code, 400)
        # Nor through the website's own primary-domain setting.
        response = stranger.patch(f"/api/v1/websites/{other.slug}/", {"primary_domain": "kaadir.so"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertNotIn("Kaadir", response.content.decode())

    def test_primary_domain_cannot_be_removed_here(self):
        primary = self.as_user(self.admin).get(f"{BASE}/domains/").json()[0]
        self.assertEqual(self.client.delete(f"{BASE}/domains/{primary['id']}/").status_code, 400)
        extra = self.client.post(f"{BASE}/domains/", {"hostname": "kaadir.so"}, format="json").json()
        self.assertEqual(self.client.delete(f"{BASE}/domains/{extra['id']}/").status_code, 204)

    def test_only_admins_manage_domains(self):
        client = self.as_user(self.editor)
        self.assertEqual(client.post(f"{BASE}/domains/", {"hostname": "kaadir.so"}, format="json").status_code, 403)
        domain = Domain.objects.create(website=self.site, hostname="kaadir.so")
        self.assertEqual(client.post(f"{BASE}/domains/{domain.pk}/verify/").status_code, 403)
        self.assertEqual(client.delete(f"{BASE}/domains/{domain.pk}/").status_code, 403)
        self.assertEqual(self.as_user(self.stranger).get(f"{BASE}/domains/").status_code, 404)
