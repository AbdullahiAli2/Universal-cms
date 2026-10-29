# Architecture

Universal CMS is split into two deployable parts and one contract between them.

```
 Browser ──► Next.js dashboard (app/) ──► /api/proxy ──► Django REST API (server/) ──► PostgreSQL
                 │  httpOnly cookie                          │  token auth, roles,
                 │  holds the API token                      │  isolation, audit
                 ▼                                           ▼
        Your website frontend  ◄──── public content API (documented, Phase 2)
```

## Principles

- **Django is the source of truth** for content, permissions, publishing, websites and audit data. The dashboard holds no business logic that the API cannot also enforce.
- **Headless.** The CMS does not render your website. Frontends read the API.
- **Isolation by membership.** A user only sees a website when a `Membership` row links them to it. Other websites return 404, the same response as an unknown slug.
- **Same behaviour on every database.** Business logic never branches on the database engine. Compatibility notes are in [database.md](database.md).

## Server (`server/`)

| App | Responsibility |
| --- | --- |
| `apps.core` | Health check. |
| `apps.accounts` | Email-based `User`, token authentication with expiry, first-run setup, sign-in throttling. |
| `apps.websites` | `Website`, `Membership`, roles, website and team APIs, dashboard summary. |
| `apps.audit` | Append-only `AuditLog` written through `audit.services.record()`. |

Planned apps for later phases are listed in [roadmap.md](roadmap.md): content models, news, events, publications, pages, media, SEO, plugins, webhooks.

### Roles

Roles are ordered. A higher role includes everything below it.

| Role | Can do |
| --- | --- |
| viewer | Read the website, dashboard and team list. |
| author | Same as viewer. Content permissions arrive in Phase 2. |
| editor | Same as author. Content permissions arrive in Phase 2. |
| admin | Change website settings, invite and manage members below owner, read the activity log. |
| owner | Everything admin can do, plus delete the website and manage owner roles. A website always keeps at least one owner. |

Platform administrators (Django superusers) have no implicit website access. They are added as members like everyone else.

### Authentication

1. `POST /api/v1/auth/login/` checks the password and creates a random token.
2. The dashboard's `/api/session` route stores the token in an httpOnly, SameSite=Lax cookie (Secure in production). JavaScript in the browser cannot read it. Each sign-in rotates the token, so a user has one active session. `/api/session`, `/api/setup` and every non-GET proxy request refuse requests whose `Origin` is another site.
3. Every dashboard request goes through `/api/proxy/…`, which adds `Authorization: Token …` on the server.
4. Tokens expire after `CMS_TOKEN_TTL_DAYS`. Sign-out deletes the token.

## Dashboard (`app/`)

- **App Router.** Route groups separate `(auth)` pages from the `(dashboard)` shell.
- **Data.** TanStack Query hooks in `src/lib/queries.ts` call the typed client in `src/lib/api.ts`.
- **Forms.** React Hook Form with Zod schemas in `src/lib/schemas.ts`. Server field errors map onto the matching field.
- **Proxy.** `src/app/api/proxy/[...path]/route.ts` allows only the endpoints the dashboard uses. Sign-in and setup have their own routes so the cookie is always set correctly.
- **Theme.** Colour tokens mirror the Version 3 prototype and switch with `.dark` (next-themes).

## Request flow for a website edit

1. The user submits the settings form. Zod checks the input in the browser.
2. The browser calls `PATCH /api/proxy/websites/{slug}`.
3. The proxy attaches the token and forwards to Django.
4. Django authenticates the token, finds the caller's membership, checks the role, validates the data, saves it and writes an audit entry.
5. The response goes back through the proxy. Field errors show next to the matching input.
