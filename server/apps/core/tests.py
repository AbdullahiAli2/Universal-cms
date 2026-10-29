from django.test import TestCase


class HealthTests(TestCase):
    def test_health_reports_ok_with_database(self):
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["database"], "ok")
