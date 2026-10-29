# Configuration

All settings come from environment variables. See [`.env.example`](../.env.example) for a working template.

## Django API

| Variable | Default | Purpose |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | required unless `DJANGO_DEBUG=1` | Signing key. Use a long random value and keep it private. |
| `DJANGO_DEBUG` | `0` | Set to `1` only for local development. |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1,[::1],server` | Host names the API answers to. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | empty | Origins allowed to make cross-origin unsafe requests. |
| `DJANGO_BEHIND_HTTPS_PROXY` | `0` | Trust `X-Forwarded-Proto` from your reverse proxy. |
| `DJANGO_SECURE_SSL_REDIRECT` | `0` | Redirect HTTP to HTTPS inside Django. |
| `DJANGO_HSTS_SECONDS` | `0` | HTTP Strict Transport Security lifetime. Enable only for permanent HTTPS. |
| `DJANGO_LOG_LEVEL` | `INFO` | Root log level. |
| `CMS_TOKEN_TTL_DAYS` | `14` | Token lifetime. |
| `CMS_LOGIN_RATE` | `10/min` | Sign-in attempts per client address. Dashboard sign-ins all arrive from the Next.js server's address. |
| `CMS_LOGIN_EMAIL_RATE` | `5/min` | Sign-in attempts per account, from any address. |
| `CMS_MEDIA_ROOT` | `server/data/media` | Where uploaded files are stored. Back it up with the database. |
| `CMS_MAX_UPLOAD_MB` | `25` | Largest upload accepted. Set it on the dashboard too, so its proxy allows the same size. |
| `CMS_DASHBOARD_URL` | `http://localhost:3000` | Where people open the dashboard. Used for links in emails, such as invitations. |
| `CMS_ENCRYPTION_KEY` | derived from `DJANGO_SECRET_KEY` | Encrypts stored secrets such as the SMTP password. Set your own long random value; changing it makes saved secrets unreadable (re-enter them). |
| `CMS_PUBLIC_API_URL` | empty | Public address of this API as websites call it, e.g. `https://cms.example.com/api/v1`. Shown on each website's Connection card. |
| `GUNICORN_WORKERS` | `3` | Worker processes in the Docker image. |

## Database

| Variable | Default | Purpose |
| --- | --- | --- |
| `CMS_DATABASE` | `postgres` | `postgres`, `sqlite` or `mysql`. |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `localhost`, `5432`, `universal_cms`, `universal_cms`, empty | PostgreSQL connection. |
| `POSTGRES_CONN_MAX_AGE` | `60` | Seconds to keep a connection open. |
| `SQLITE_PATH` | `data/db.sqlite3` | SQLite file, relative to `server/`. |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | `localhost`, `3306`, `universal_cms`, `universal_cms`, empty | MySQL connection (optional). |

## Dashboard

| Variable | Default | Purpose |
| --- | --- | --- |
| `CMS_API_URL` | `http://localhost:8000/api/v1` | Where the dashboard server reaches the API. Used only on the server. |
| `CMS_COOKIE_SECURE` | `true` in production builds, `false` in `next dev` | Mark the session cookie `Secure`. Set `false` only to test over plain HTTP on an address other than localhost. |
| `CMS_TRUSTED_ORIGINS` | empty | Extra origins (comma-separated, e.g. `https://cms.example.com`) accepted for sign-in and changes, for reverse proxies that rewrite `Host` without setting `X-Forwarded-Host`. |
