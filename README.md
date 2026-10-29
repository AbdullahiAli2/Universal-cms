# Universal CMS

A self-hosted, headless content management system for any kind of website. Django provides the content API, permissions, publishing and audit log. Next.js provides the dashboard. Your website reads content through the API, so the CMS never depends on how your site looks.

> **Project status: Phase 1 source is written, but it has not been run yet.** The environment that produced this code could not install Python or Node packages, so no tests, migrations or builds have been executed. Read [What is verified](#what-is-verified) before you rely on it.

## What Phase 1 includes

- Django REST API with OpenAPI docs at `/api/docs/`
- PostgreSQL by default, with SQLite and MySQL selectable through `CMS_DATABASE`
- First-run setup that creates the platform administrator
- Email and password sign-in, token expiry, sign-in throttling
- Websites with slugs, types, domains, languages and time zones
- Team membership with five roles (viewer, author, editor, admin, owner)
- Per-website isolation: other websites return 404
- Activity log for website, member and sign-in events
- Dashboard with website list, create wizard, overview with real counts and setup checklist, and a settings page for details, team, activity and deletion
- Docker Compose with PostgreSQL, API and dashboard
- CI workflow for API tests on SQLite and PostgreSQL, and for the dashboard build

Content types, news, events, publications, pages, media, SEO, plugins and webhooks are **not** implemented yet. Their sidebar entries are marked "Soon". See [docs/roadmap.md](docs/roadmap.md).

## Quick start

Windows users: follow [docs/windows.md](docs/windows.md) in order. It covers uv, pnpm, Docker Desktop and the first-run steps.

Before the first Docker build, the project needs its generated files. Run these once and commit the results:

```bash
cd server && uv sync && uv lock && uv run python manage.py makemigrations && cd ..
cd app && pnpm install && cd ..
```

Then:

```bash
cp .env.example .env          # replace every CHANGE-ME value
docker compose up --build
```

- Dashboard: http://localhost:3000
- API docs: http://localhost:8000/api/docs/

On a fresh database, the dashboard opens the setup page to create the administrator.

## Local development

Requirements: Python 3.13, [uv](https://docs.astral.sh/uv/), Node.js 22, pnpm 10.

**API**

```bash
cd server
uv sync
export DJANGO_DEBUG=1 CMS_DATABASE=sqlite          # or CMS_DATABASE=postgres with POSTGRES_* set
uv run python manage.py makemigrations            # first run only: creates the migration files
uv run python manage.py migrate
uv run python manage.py test
uv run python manage.py runserver 8000
```

**Dashboard**

```bash
cd app
pnpm install
pnpm typecheck
pnpm dev                                          # http://localhost:3000
```

The dashboard expects the API at `CMS_API_URL` (default `http://localhost:8000/api/v1`).

## Repository layout

```
universal-cms/
├── app/          Next.js dashboard (App Router, TypeScript, Tailwind v4)
├── server/       Django API (apps: core, accounts, websites, audit)
├── docs/         Architecture, API, configuration, database, plugin design, roadmap
├── compose.yaml  PostgreSQL + API + dashboard
├── .env.example  Every setting, with safe placeholders
├── .github/      CI workflow
├── LICENSE       MIT
└── README.md
```

## What is verified

| Item | Status |
| --- | --- |
| Python source compiles (`py_compile`) | Checked. |
| TypeScript and TSX files parse | Checked. |
| API unit and integration tests (`manage.py test`) | **Written, not run.** |
| `makemigrations` and `migrate` on PostgreSQL and SQLite | **Not run.** Migration files are not in the repository yet. |
| Dashboard typecheck and production build | **Not run.** `pnpm-lock.yaml` is not committed yet. |
| Docker Compose stack | **Not run.** |
| CI workflow | **Not run** on GitHub. |
| MySQL | **Not verified.** Configured only. |

### First steps for a maintainer

1. `cd server && uv sync && uv lock` and commit `uv.lock`.
2. `uv run python manage.py makemigrations && uv run python manage.py migrate` and commit `apps/*/migrations/`.
3. `uv run python manage.py test` on SQLite and PostgreSQL. Fix anything that fails.
4. `cd app && pnpm install && pnpm typecheck && pnpm build`. Commit `pnpm-lock.yaml`.
5. `docker compose up --build` and sign in through the dashboard.

Until steps 1–4 pass, treat the code as untested.

## Security

Read [SECURITY.md](SECURITY.md) before you expose the API to a network. Production needs a real `DJANGO_SECRET_KEY`, HTTPS, and `DJANGO_DEBUG=0`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The project is MIT licensed. See [LICENSE](LICENSE).
