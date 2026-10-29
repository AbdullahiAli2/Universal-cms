import secrets

from django.db import models


class Branding(models.Model):
    """How a website presents itself. Frontends read these values; the CMS never restyles a website itself."""

    website = models.OneToOneField("websites.Website", on_delete=models.CASCADE, related_name="branding")
    tagline = models.CharField(max_length=200, blank=True)
    logo = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    # For dark backgrounds, such as a footer.
    logo_reversed = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    icon = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    share_image = models.ForeignKey("media.MediaAsset", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    primary_color = models.CharField(max_length=7, blank=True)
    accent_color = models.CharField(max_length=7, blank=True)
    heading_font = models.CharField(max_length=60, blank=True)
    body_font = models.CharField(max_length=60, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    address = models.CharField(max_length=300, blank=True)
    office_hours = models.CharField(max_length=120, blank=True)
    maps_url = models.URLField(max_length=500, blank=True)
    # [{"network": "facebook", "url": "https://…"}]
    socials = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Branding for {self.website}"


def new_token():
    return secrets.token_hex(16)


class Domain(models.Model):
    """
    A host name that belongs to a website. Ownership is proven with a DNS TXT record:
    _universal-cms.<hostname>  TXT  "universal-cms-verify=<token>"
    """

    website = models.ForeignKey("websites.Website", on_delete=models.CASCADE, related_name="domains")
    hostname = models.CharField(max_length=253, unique=True)
    verification_token = models.CharField(max_length=64, default=new_token)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return self.hostname

    @property
    def record_name(self):
        return f"_universal-cms.{self.hostname}"

    @property
    def record_value(self):
        return f"universal-cms-verify={self.verification_token}"
