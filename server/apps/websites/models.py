from django.conf import settings
from django.db import models


class WebsiteType(models.TextChoices):
    NEWS = "news", "News and magazine"
    BLOG = "blog", "Blog"
    CORPORATE = "corporate", "Corporate"
    EVENTS = "events", "Events"
    PUBLICATIONS = "publications", "Publications"
    DOCS = "docs", "Documentation"
    CUSTOM = "custom", "Custom"


class WebsiteSource(models.TextChoices):
    CREATED = "created", "Created in Universal CMS"
    CONNECTED = "connected", "Connected existing website"


class Framework(models.TextChoices):
    """What an existing frontend is built with. Reference only: the CMS never generates or edits frontend code."""

    NEXTJS = "nextjs", "Next.js"
    REACT = "react", "React"
    VUE = "vue", "Vue"
    NUXT = "nuxt", "Nuxt"
    ANGULAR = "angular", "Angular"
    SVELTE = "svelte", "Svelte or SvelteKit"
    ASTRO = "astro", "Astro"
    STATIC = "static", "Static HTML"
    MOBILE = "mobile", "Mobile app"
    OTHER = "other", "Other"


class WebsiteStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ARCHIVED = "archived", "Archived"


class Role(models.TextChoices):
    OWNER = "owner", "Owner"
    ADMIN = "admin", "Admin"
    EDITOR = "editor", "Editor"
    AUTHOR = "author", "Author"
    VIEWER = "viewer", "Viewer"


# Higher rank can do everything a lower rank can do.
ROLE_RANK = {
    Role.VIEWER: 1,
    Role.AUTHOR: 2,
    Role.EDITOR: 3,
    Role.ADMIN: 4,
    Role.OWNER: 5,
}


class Website(models.Model):
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.TextField(blank=True)
    website_type = models.CharField(max_length=20, choices=WebsiteType.choices, default=WebsiteType.NEWS)
    default_language = models.CharField(max_length=12, default="en")
    # NULL, not "", for "no domain". Blank strings would collide under the unique constraint.
    primary_domain = models.CharField(max_length=253, blank=True, null=True, unique=True)
    timezone = models.CharField(max_length=63, default="UTC")
    status = models.CharField(max_length=20, choices=WebsiteStatus.choices, default=WebsiteStatus.ACTIVE)
    # How the website was registered. Set once at creation.
    source = models.CharField(max_length=20, choices=WebsiteSource.choices, default=WebsiteSource.CREATED)
    # Address of the live frontend, for example https://www.example.com. Stored for the team's reference.
    frontend_url = models.URLField(max_length=300, blank=True)
    frontend_framework = models.CharField(max_length=20, choices=Framework.choices, blank=True)
    # The workspace the dashboard opens after sign-in. Exactly one website per installation has it.
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_websites",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "id"]
        constraints = [
            models.UniqueConstraint(fields=["is_default"], condition=models.Q(is_default=True), name="one_default_website"),
        ]

    def save(self, *args, **kwargs):
        self.primary_domain = (self.primary_domain or "").strip().lower() or None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Membership(models.Model):
    """Links a user to a website with a role. This is the only source of website access."""

    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="website_memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["website", "user"], name="unique_website_member"),
        ]

    def __str__(self):
        return f"{self.user} on {self.website} as {self.role}"


class RolePermission(models.Model):
    """
    The permission codes a role has on one website, when an admin has changed them.
    Without a row the role uses the defaults in permissions.DEFAULT_PERMISSIONS. Owners are never stored:
    they always have every permission.
    """

    website = models.ForeignKey(Website, on_delete=models.CASCADE, related_name="role_permissions")
    role = models.CharField(max_length=20, choices=Role.choices)
    permissions = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["website", "role"], name="unique_role_permission")]

    def __str__(self):
        return f"{self.role} on {self.website}"
