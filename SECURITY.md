# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem. Email the maintainers privately at the address listed on the repository profile, with:

- a description of the problem and its impact,
- steps to reproduce,
- the version or commit you tested.

We aim to acknowledge reports within three working days and to publish a fix or mitigation before public disclosure.

## Supported versions

Universal CMS has not released a stable version yet. Security fixes apply to the default branch only.

## Deployment checklist

- Set a long random `DJANGO_SECRET_KEY`, never the example value.
- Set `DJANGO_DEBUG=0`.
- Serve both the API and the dashboard over HTTPS, then set `CMS_COOKIE_SECURE=true`, `DJANGO_BEHIND_HTTPS_PROXY=1` and `DJANGO_SECURE_SSL_REDIRECT=1`.
- Restrict `DJANGO_ALLOWED_HOSTS` to your real host names.
- Use a strong PostgreSQL password and keep the database off the public internet.
- Keep `CMS_TOKEN_TTL_DAYS` short for shared computers.
- Back up the database. Audit logs are kept in it.

## Design notes

- **First-run setup** is protected by a unique database row. Two simultaneous setup requests cannot both create an administrator.
- **Domains** are unique across websites. A clash returns a generic message that does not name the other website or its owner. Verifying that you control a domain is not implemented yet, so a domain claim is currently trusted. Add ownership verification before you route public traffic by domain.

## Known limitations (Phase 1)

- Sign-in throttling uses Django's cache. Each process keeps its own counts unless you configure a shared cache.
- There is no multi-factor authentication yet.
- There is no password reset email yet. An administrator sets accounts up in the Django admin.
- Tokens are stored in plain text in the database. Treat database backups as sensitive.
- The sign-in throttle depends on the client address Django sees. Behind a proxy, configure it so the real client address is passed on, or every user shares one limit.
