"""
Universal CMS settings.

Every deployment-specific value comes from environment variables so the same
code runs in local development, Docker Compose and production. See
docs/configuration.md for the full list.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    raw = env(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in (env(name, default) or "").split(",") if item.strip()]


CMS_VERSION = "0.1.0"

# --- Core -------------------------------------------------------------------

DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = env("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "insecure-development-key-do-not-use-in-production"
    else:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be set. Generate one with: "
            "python -c 'import secrets; print(secrets.token_urlsafe(50))'"
        )

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1],server")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "django_filters",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.websites",
    "apps.media",
    "apps.content",
    "apps.branding",
    "apps.growth",
    "apps.mail",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.audit.context.RequestContextMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Database ---------------------------------------------------------------
# CMS_DATABASE selects the engine. Business logic never branches on it.
#   postgres (default, recommended for production)
#   sqlite   (local development and tests)
#   mysql    (optional; see docs/database.md for limitations)


def build_databases() -> dict:
    engine = (env("CMS_DATABASE", "postgres") or "postgres").lower()

    if engine == "postgres":
        return {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": env("POSTGRES_DB", "universal_cms"),
                "USER": env("POSTGRES_USER", "universal_cms"),
                "PASSWORD": env("POSTGRES_PASSWORD", ""),
                "HOST": env("POSTGRES_HOST", "localhost"),
                "PORT": env("POSTGRES_PORT", "5432"),
                "CONN_MAX_AGE": int(env("POSTGRES_CONN_MAX_AGE", "60")),
            }
        }

    if engine == "sqlite":
        path = Path(env("SQLITE_PATH", str(BASE_DIR / "data" / "db.sqlite3")))
        path.parent.mkdir(parents=True, exist_ok=True)
        return {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": path}}

    if engine == "mysql":
        return {
            "default": {
                "ENGINE": "django.db.backends.mysql",
                "NAME": env("MYSQL_DATABASE", "universal_cms"),
                "USER": env("MYSQL_USER", "universal_cms"),
                "PASSWORD": env("MYSQL_PASSWORD", ""),
                "HOST": env("MYSQL_HOST", "localhost"),
                "PORT": env("MYSQL_PORT", "3306"),
                "OPTIONS": {"charset": "utf8mb4"},
            }
        }

    raise ImproperlyConfigured(f"Unknown CMS_DATABASE '{engine}'. Use postgres, sqlite or mysql.")


DATABASES = build_databases()
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Internationalisation ---------------------------------------------------

LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files -----------------------------------------------------------

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# --- Uploaded media ---------------------------------------------------------

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("CMS_MEDIA_ROOT", str(BASE_DIR / "data" / "media")))
CMS_MAX_UPLOAD_MB = int(env("CMS_MAX_UPLOAD_MB", "25"))
# Uploads larger than this are streamed to a temporary file instead of memory.
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# --- REST framework ---------------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.SessionTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_THROTTLE_RATES": {
        "login": env("CMS_LOGIN_RATE", "10/min"),
        "login_email": env("CMS_LOGIN_EMAIL_RATE", "5/min"),
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Universal CMS API",
    "DESCRIPTION": "Headless content API. Every endpoint is scoped to the websites the caller belongs to.",
    "VERSION": CMS_VERSION,
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

# Tokens expire after this many days. The CMS dashboard uses an httpOnly cookie
# that holds the token, so this also limits how long a stolen cookie is useful.
CMS_TOKEN_TTL_DAYS = int(env("CMS_TOKEN_TTL_DAYS", "14"))

# Public address of this API as a website's frontend calls it, for example https://cms.example.com/api/v1.
# Shown to website owners on the dashboard. Leave empty to hide it.
CMS_PUBLIC_API_URL = (env("CMS_PUBLIC_API_URL", "") or "").rstrip("/")

# Where people open the dashboard. Used for links in emails, such as invitations.
CMS_DASHBOARD_URL = (env("CMS_DASHBOARD_URL", "http://localhost:3000") or "").rstrip("/")

# Encrypts stored secrets such as the SMTP password. Set your own (any long random string) in production;
# without it the key is derived from DJANGO_SECRET_KEY, so changing that key makes stored secrets unreadable.
CMS_ENCRYPTION_KEY = env("CMS_ENCRYPTION_KEY", "") or ""

# --- Production security ----------------------------------------------------

SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_SSL_REDIRECT = env_bool("DJANGO_SECURE_SSL_REDIRECT", False)
# Only enable HSTS once the site is served over HTTPS for good. Start with a short value.
SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "0"))
if env_bool("DJANGO_BEHIND_HTTPS_PROXY", False):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --- Logging ----------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
}
