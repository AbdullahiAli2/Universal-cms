from django.db import models


class SeoSettings(models.Model):
    """
    Website-wide search and analytics settings. The website's frontend reads them to build page titles,
    meta tags, robots rules and its analytics snippet. The CMS stores them; it does not track visitors itself.
    """

    website = models.OneToOneField("websites.Website", on_delete=models.CASCADE, related_name="seo_settings")
    # "{title}" is the page title and "{site}" the website name, e.g. "{title} | {site}".
    title_template = models.CharField(max_length=120, default="{title} | {site}")
    default_description = models.CharField(max_length=320, blank=True)
    allow_indexing = models.BooleanField(default=True)
    google_site_verification = models.CharField(max_length=100, blank=True)
    bing_site_verification = models.CharField(max_length=100, blank=True)
    ga4_measurement_id = models.CharField(max_length=20, blank=True)
    plausible_domain = models.CharField(max_length=253, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SEO settings for {self.website}"
