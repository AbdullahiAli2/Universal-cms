import io
import shutil
import tempfile

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.content.models import Entry
from apps.websites.models import Membership, Role
from apps.websites.services import create_website

from .models import MediaAsset

BASE = "/api/v1/websites/daily-news"
TEMP_MEDIA = tempfile.mkdtemp()


def png(name="photo.png", size=(40, 30)):
    buffer = io.BytesIO()
    Image.new("RGB", size, "teal").save(buffer, "PNG")
    return SimpleUploadedFile(name, buffer.getvalue(), content_type="image/png")


def pdf(name="report.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF", content_type="application/pdf")


@override_settings(MEDIA_ROOT=TEMP_MEDIA, CMS_PUBLIC_API_URL="")
class MediaTestCase(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        make = lambda email: User.objects.create_user(email=email, password="correct-horse-battery")  # noqa: E731
        self.owner, self.editor, self.author, self.author2, self.viewer, self.stranger = (
            make(f"{name}@example.com") for name in ("owner", "editor", "author", "author2", "viewer", "stranger")
        )
        self.site = create_website(self.owner, name="Daily News")
        for user, role in [(self.editor, Role.EDITOR), (self.author, Role.AUTHOR), (self.author2, Role.AUTHOR), (self.viewer, Role.VIEWER)]:
            Membership.objects.create(website=self.site, user=user, role=role)
        self.client = APIClient()

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client

    def upload(self, user, file, **extra):
        return self.as_user(user).post(f"{BASE}/media/", {"file": file, **extra}, format="multipart")


class UploadTests(MediaTestCase):
    def test_image_upload_records_size_and_dimensions(self):
        response = self.upload(self.author, png(), alt_text="A teal square")
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual((body["kind"], body["width"], body["height"], body["mime_type"]), ("image", 40, 30, "image/png"))
        self.assertEqual(body["title"], "photo")
        self.assertRegex(body["url"], r"^/media/\d+/[0-9a-f]{32}\.png$")
        self.assertIsNone(body["public_url"])

    def test_pdf_upload(self):
        body = self.upload(self.author, pdf()).json()
        self.assertEqual((body["kind"], body["mime_type"]), ("document", "application/pdf"))
        self.assertTrue(body["url"].endswith(".pdf"))

    def test_type_comes_from_contents_not_name(self):
        renamed = png(name="looks-like.pdf")
        body = self.upload(self.author, renamed).json()
        self.assertEqual(body["kind"], "image")
        self.assertTrue(body["url"].endswith(".png"))

    def test_unsupported_files_are_refused(self):
        for upload in [
            SimpleUploadedFile("evil.html", b"<script>alert(1)</script>", content_type="text/html"),
            SimpleUploadedFile("vector.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>", content_type="image/svg+xml"),
            SimpleUploadedFile("fake.png", b"not really a png", content_type="image/png"),
        ]:
            with self.subTest(name=upload.name):
                response = self.upload(self.author, upload)
                self.assertEqual(response.status_code, 400)
                self.assertIn("file", response.json())
        self.assertFalse(MediaAsset.objects.exists())

    @override_settings(CMS_MAX_UPLOAD_MB=0)
    def test_size_limit(self):
        self.assertEqual(self.upload(self.author, png()).status_code, 400)

    def test_viewer_cannot_upload(self):
        self.assertEqual(self.upload(self.viewer, png()).status_code, 403)

    def test_video_links_are_normalised(self):
        client = self.as_user(self.author)
        response = client.post(f"{BASE}/media/", {"embed_url": "https://youtu.be/dQw4w9WgXcQ", "title": "Launch"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["embed_url"], "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
        bad = client.post(f"{BASE}/media/", {"embed_url": "https://evil.example.com/x", "title": "x"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_public_url_uses_the_published_api_address(self):
        with self.settings(CMS_PUBLIC_API_URL="https://cms.example.com/api/v1"):
            body = self.upload(self.author, png()).json()
        self.assertTrue(body["public_url"].startswith("https://cms.example.com/media/"))


class ServeTests(MediaTestCase):
    def test_files_are_served_with_safe_headers(self):
        url = self.upload(self.author, png()).json()["url"]
        self.client.force_authenticate(user=None)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertIn("sandbox", response["Content-Security-Policy"])

    def test_only_media_names_can_be_requested(self):
        for path in ["/media/../config/settings.py", "/media/1/secret.txt", "/media/1/abc.png"]:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)


class PermissionTests(MediaTestCase):
    def test_authors_change_only_their_own_files(self):
        own = self.upload(self.author, png()).json()["id"]
        other = self.upload(self.author2, png()).json()["id"]
        client = self.as_user(self.author)
        self.assertEqual(client.patch(f"{BASE}/media/{own}/", {"alt_text": "Mine"}, format="json").status_code, 200)
        self.assertEqual(client.patch(f"{BASE}/media/{other}/", {"alt_text": "x"}, format="json").status_code, 403)
        self.assertEqual(client.delete(f"{BASE}/media/{other}/").status_code, 403)
        self.assertEqual(self.as_user(self.editor).delete(f"{BASE}/media/{other}/").status_code, 204)

    def test_focal_point_is_validated(self):
        asset = self.upload(self.author, png()).json()["id"]
        client = self.as_user(self.author)
        self.assertEqual(client.patch(f"{BASE}/media/{asset}/", {"focal_point": "60% 55%"}, format="json").status_code, 200)
        self.assertEqual(client.patch(f"{BASE}/media/{asset}/", {"focal_point": "left"}, format="json").status_code, 400)

    def test_other_websites_cannot_see_or_use_files(self):
        asset = self.upload(self.author, png()).json()["id"]
        other = create_website(self.stranger, name="Other")
        client = self.as_user(self.stranger)
        self.assertEqual(client.get(f"{BASE}/media/").status_code, 404)
        self.assertEqual(client.get(f"/api/v1/websites/{other.slug}/media/{asset}/").status_code, 404)
        # Nor attach it to their own content.
        response = client.post(
            f"/api/v1/websites/{other.slug}/entries/", {"type": "article", "title": "Steal", "data": {"cover": asset}}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("cover", response.json()["data"])


class UsageTests(MediaTestCase):
    def test_files_in_use_cannot_be_deleted(self):
        image = self.upload(self.author, png()).json()["id"]
        document = self.upload(self.author, pdf()).json()["id"]
        client = self.as_user(self.editor)
        created = client.post(
            f"{BASE}/entries/", {"type": "publication", "title": "Annual report", "data": {"cover": image, "document": document}}, format="json"
        )
        self.assertEqual(created.status_code, 201, created.content)
        detail = client.get(f"{BASE}/media/{image}/").json()
        self.assertEqual(detail["used_in"][0]["title"], "Annual report")
        blocked = client.delete(f"{BASE}/media/{image}/")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("Annual report", str(blocked.json()))
        Entry.objects.all().delete()
        self.assertEqual(client.delete(f"{BASE}/media/{image}/").status_code, 204)

    def test_fields_check_the_kind_of_file(self):
        image = self.upload(self.author, png()).json()["id"]
        document = self.upload(self.author, pdf()).json()["id"]
        client = self.as_user(self.editor)
        wrong = client.post(f"{BASE}/entries/", {"type": "publication", "title": "R", "data": {"cover": document, "document": image}}, format="json")
        self.assertEqual(set(wrong.json()["data"]), {"cover", "document"})
        gallery = client.post(f"{BASE}/entries/", {"type": "article", "title": "G", "data": {"gallery": [image, image]}}, format="json")
        self.assertEqual(gallery.json()["data"]["gallery"], [image])

    def test_entry_share_image_is_checked_and_counted(self):
        image = self.upload(self.author, png()).json()["id"]
        client = self.as_user(self.editor)
        entry = client.post(f"{BASE}/entries/", {"type": "page", "title": "About", "seo": {"image": image, "description": "About us"}}, format="json")
        self.assertEqual(entry.status_code, 201, entry.content)
        self.assertEqual(entry.json()["seo"], {"image": image, "description": "About us"})
        self.assertEqual(client.get(f"{BASE}/media/{image}/").json()["used_in"][0]["title"], "About")
        bad = client.post(f"{BASE}/entries/", {"type": "page", "title": "X", "seo": {"image": 999999, "canonical_url": "nope"}}, format="json")
        self.assertEqual(set(bad.json()["seo"]), {"image", "canonical_url"})

    def test_list_filters_and_totals(self):
        self.upload(self.author, png(), alt_text="Harbour at dusk")
        self.upload(self.author, pdf())
        body = self.as_user(self.viewer).get(f"{BASE}/media/?kind=image").json()
        self.assertEqual(body["count"], 1)
        self.assertEqual((body["totals"]["all"], body["totals"]["image"], body["totals"]["document"]), (2, 1, 1))
        self.assertEqual(self.as_user(self.viewer).get(f"{BASE}/media/?search=harbour").json()["count"], 1)


class SortTests(MediaTestCase):
    def test_sort_options(self):
        self.upload(self.author, png(name="bravo.png"))
        self.upload(self.author, pdf(name="alpha.pdf"))
        client = self.as_user(self.viewer)
        names = lambda sort: [item["title"] for item in client.get(f"{BASE}/media/?sort={sort}").json()["results"]]  # noqa: E731
        self.assertEqual(names("name"), ["alpha", "bravo"])
        self.assertEqual(names("-name"), ["bravo", "alpha"])
        self.assertEqual(names("oldest"), ["bravo", "alpha"])
        self.assertEqual(names("size")[0], "bravo")  # the PNG is larger than the tiny PDF
