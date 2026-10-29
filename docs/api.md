# API reference

The live, always up-to-date reference is generated from the code:

- Swagger UI: `http://localhost:8000/api/docs/`
- OpenAPI schema: `http://localhost:8000/api/schema/`

Every endpoint except `health`, `auth/status`, `auth/bootstrap` and `auth/login` requires `Authorization: Token <token>`.

## Phase 1 endpoints

| Method | Path | Who | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/health/` | public | Liveness and database check. |
| GET | `/api/v1/auth/status/` | public | Whether first-run setup is still needed. |
| POST | `/api/v1/auth/bootstrap/` | public, once | Create the first platform administrator. |
| POST | `/api/v1/auth/login/` | public, throttled | Exchange email and password for a token. |
| POST | `/api/v1/auth/logout/` | signed in | Revoke the current token. |
| GET | `/api/v1/auth/me/` | signed in | Current user. |
| GET, PATCH | `/api/v1/auth/me/` | signed in | Profile: names, username, language, theme; email (needs `current_password`). |
| POST | `/api/v1/auth/me/password/` | signed in | Change password; signs out your other sessions. |
| GET | `/api/v1/auth/sessions/` | signed in | Your active sessions (`current` marks this one). |
| DELETE | `/api/v1/auth/sessions/{id}/` · POST `/api/v1/auth/sessions/revoke-others/` | signed in | Sign out one session, or all but this one. |
| GET | `/api/v1/auth/invitation/?token=` · POST `/api/v1/auth/invitation/accept/` | anyone with the link | Check an invitation; choose a password and sign in. |
| GET | `/api/v1/workspace/` | signed in | The default workspace the dashboard opens (created on first use for platform admins). |
| GET, PUT | `/api/v1/settings/email/` · POST `/api/v1/settings/email/test/` | platform admin | SMTP settings (password write-only, stored encrypted); send a test email. |
| GET | `/api/v1/websites/{slug}/roles/` · PUT `/roles/{role}/` | member; PUT `roles.manage` | Role permissions and the permission catalogue. You cannot grant what you do not have. |
| POST | `/api/v1/websites/{slug}/members/{id}/invitation/` | `users.manage` | New invitation link for someone who has not set a password. |
| GET, POST | `/api/v1/websites/` | signed in | List your websites, or create one (you become owner). |
| GET, PATCH, DELETE | `/api/v1/websites/{slug}/` | member; PATCH admin+; DELETE owner | Read, update or delete a website. |
| GET | `/api/v1/websites/{slug}/dashboard/` | member | Team counts, setup checklist, recent activity, connection details. |
| GET, POST | `/api/v1/websites/{slug}/members/` | member; POST admin+ | List or invite team members. |
| PATCH, DELETE | `/api/v1/websites/{slug}/members/{id}/` | admin+ | Change a role or remove a member. |
| GET | `/api/v1/websites/{slug}/audit-logs/` | `audit.view` | Filter with `?action=` (prefix), `?actor=`, `?search=`, `?date_from=`, `?date_to=`; `?scope=all` adds sign-ins for platform admins. |
| GET | `/api/v1/websites/{slug}/content-types/` | member | Content types with entry counts per status. |
| GET, POST | `/api/v1/websites/{slug}/entries/` | member; POST author+ | List (`?type=`, `?status=a,b`, `?search=`, `?mine=1`, `?page=`) or create a draft. |
| GET, PATCH, DELETE | `/api/v1/websites/{slug}/entries/{id}/` | member; PATCH/DELETE editor+, or the author while it is a draft | Read, edit (send `version`) or delete an entry. |
| POST | `/api/v1/websites/{slug}/entries/{id}/transition/` | see workflow | `{"action": ..., "version": n, "publish_at": "..."}` |
| GET | `/api/v1/websites/{slug}/entries/{id}/revisions/` | member | Last 50 saved versions. |
| POST | `/api/v1/websites/{slug}/entries/{id}/revisions/{rev}/restore/` | as for editing | Restore a version's content; status is kept. |
| GET, POST | `/api/v1/websites/{slug}/media/` | member; POST author+ | List (`?kind=`, `?search=`, `?ids=1,2`) or upload (multipart `file`) / add a video (`embed_url`, `title`). |
| GET, PATCH, DELETE | `/api/v1/websites/{slug}/media/{id}/` | member; change: uploader or editor+ | Details with `used_in`; files still in use cannot be deleted. |
| GET, PATCH | `/api/v1/websites/{slug}/branding/` | member; PATCH admin+ | Logos, colours, fonts, contact details, social links. |
| GET, POST | `/api/v1/websites/{slug}/domains/` | member; POST admin+ | Domains with their DNS verification record. |
| POST | `/api/v1/websites/{slug}/domains/{id}/verify/` · `/make-primary/` | admin+ | Check the TXT record; make a verified domain primary. |
| DELETE | `/api/v1/websites/{slug}/domains/{id}/` | admin+ | Remove a domain that is not primary. |
| GET, PATCH | `/api/v1/websites/{slug}/seo/` | member; PATCH admin+ | Title format, default description, indexing, verification codes, analytics IDs. |
| GET | `/api/v1/websites/{slug}/growth/` | member | Publishing output, SEO health of published entries, sitemap entries. |
| GET | `/media/{website id}/{name}` | anyone with the link | Uploaded files. Random names; served with `nosniff` and a sandboxing CSP. |

### Content workflow

| Action | From | To | Who |
| --- | --- | --- | --- |
| `submit` | draft | in_review | the author, or editor+ |
| `withdraw` | in_review | draft | the author, or editor+ |
| `publish` | draft, in_review, scheduled | published | editor+ |
| `schedule` | draft, in_review, scheduled | scheduled | editor+ (`publish_at` in the future) |
| `unpublish` | published, scheduled | draft | editor+ |
| `archive` | anything but archived | archived | editor+ |
| `restore` | archived | draft | editor+ |

- New entries are always drafts. Authors may edit and delete only their own drafts.
- Every PATCH, transition and restore takes the `version` the client last saw. A stale version returns **409**, so two people cannot overwrite each other.
- Times sent without a zone (`2026-11-01T09:00`) are read in the website's time zone.
- Scheduled entries go live when they are due: on the next content request for that website, or when `python manage.py publish_scheduled` runs. Run that command every minute from cron in production.
- Type-specific values go in `data` and are validated against the type's `fields` (see `content-types`). Errors come back as `{"data": {"field": "message"}}`.

### Creating or connecting a website

`POST /api/v1/websites/` registers a website either way. The CMS never generates, installs or edits frontend code.

| Field | Notes |
| --- | --- |
| `source` | `created` (default) for a new website, or `connected` for a website that already exists. Fixed after registration. |
| `frontend_url` | Address of the live site, such as `https://www.example.com`. Required when `source` is `connected`. |
| `frontend_framework` | Optional, for reference: `nextjs`, `react`, `vue`, `nuxt`, `angular`, `svelte`, `astro`, `static`, `mobile`, `other`. |
| `primary_domain` | When connecting without one, it is taken from `frontend_url` (not for addresses such as `localhost`). |

```json
{"name": "My shop", "source": "connected", "frontend_url": "https://www.example.com", "frontend_framework": "nextjs"}
```

Lists are paginated: `{count, next, previous, results}`, 25 per page.

Error bodies are either `{"detail": "..."}` or `{"field": ["message"]}`.

### Permissions

Each website role has permission codes. Owners always have all of them; the other roles start from these defaults and can be changed in Settings → Roles & Permissions.

| Code | Viewer | Author | Editor | Admin |
| --- | --- | --- | --- | --- |
| `content.<type>.read` | ✓ | ✓ | ✓ | ✓ |
| `content.<type>.create` (and edit/delete/submit own drafts) | | ✓ | ✓ | ✓ |
| `content.<type>.update`, `.publish`, `.delete` | | | ✓ | ✓ |
| `media.upload` | | ✓ | ✓ | ✓ |
| `media.manage` | | | ✓ | ✓ |
| `settings.manage`, `branding.manage`, `domains.manage`, `seo.manage`, `users.manage`, `roles.manage`, `audit.view` | | | | ✓ |

Editing or disabling someone's account (name, active/disabled) needs a platform administrator, because accounts can belong to more than one website.
