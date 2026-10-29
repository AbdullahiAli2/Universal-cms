# Windows setup (PowerShell)

Run every command in PowerShell from the project folder, the one that contains `compose.yaml`. Each command block is one sequence in order.

> These steps were written from the documentation of each tool. They have **not** been executed on Windows by the project authors yet. If a step fails, the troubleshooting section lists the usual causes.

## 0. Install the tools once

| Tool | Install | Check |
| --- | --- | --- |
| Git | https://git-scm.com/download/win | `git --version` |
| Python 3.13 is installed by uv (see step 1) | nothing to install | |
| uv | `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 \| iex"` | `uv --version` |
| Node.js 22 LTS | https://nodejs.org/ (LTS installer) | `node --version` |
| pnpm 10 | `corepack enable` then `corepack prepare pnpm@10 --activate` | `pnpm --version` |
| Docker Desktop (optional, for Docker) | https://www.docker.com/products/docker-desktop/ (enable WSL 2) | `docker --version` |

Open a new PowerShell window after installing, so the new commands are on your PATH.

If PowerShell blocks scripts, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## 1. API (Django): SQLite, the fastest start

```powershell
cd server
uv python install 3.13
uv sync
uv lock
```

`uv sync` creates `.venv` and `uv lock` writes `uv.lock`. Commit `uv.lock` when you publish.

Create the database tables. The migration files are generated from the models the first time, then committed:

```powershell
$env:DJANGO_DEBUG = "1"
$env:CMS_DATABASE = "sqlite"
uv run python manage.py makemigrations
uv run python manage.py migrate
uv run python manage.py test
```

Start the API:

```powershell
uv run python manage.py runserver 8000
```

Leave this window open. The API is at http://localhost:8000/api/v1/ and the API docs are at **http://localhost:8000/api/docs/**.

## 1b. API with PostgreSQL (closer to production)

Start PostgreSQL 16 in Docker:

```powershell
docker run -d --name cms-db -e POSTGRES_USER=universal_cms -e POSTGRES_PASSWORD=dev-password -e POSTGRES_DB=universal_cms -p 5432:5432 postgres:16-alpine
```

In a PowerShell window in `server/`:

```powershell
$env:DJANGO_DEBUG = "1"
$env:CMS_DATABASE = "postgres"
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5432"
$env:POSTGRES_USER = "universal_cms"
$env:POSTGRES_PASSWORD = "dev-password"
$env:POSTGRES_DB = "universal_cms"
uv run python manage.py migrate
uv run python manage.py test
```

Settings you set in one window do not carry into another. Repeat them in every new window.

## 2. Dashboard (Next.js)

Open a second PowerShell window in the project folder:

```powershell
cd app
pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

`pnpm install` creates `pnpm-lock.yaml`. Commit it. Open **http://localhost:3000**.

The dashboard reads the API at `http://localhost:8000/api/v1` by default. To use another address, set `CMS_API_URL` in this window before `pnpm dev`: `$env:CMS_API_URL = "http://localhost:8001/api/v1"`.

## 3. Create the first administrator

Open http://localhost:3000. On a fresh database, the dashboard shows **Set up Universal CMS**. Enter your name, email and a password of at least 12 characters. This page closes after the first administrator is created, and it cannot be used again.

To use the Django admin instead, run `uv run python manage.py createsuperuser` in `server/`. The Django admin is at http://localhost:8000/admin/.

## 4. Docker Compose (one command)

Requires Docker Desktop running, and the migration files from step 1 committed.

```powershell
Copy-Item .env.example .env
notepad .env
```

In `.env`, replace every `CHANGE-ME` value. To make a secret key, run this in `server/`:

```powershell
uv run python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Then start everything:

```powershell
docker compose up --build
```

- Dashboard: **http://localhost:3000**
- API docs (Swagger UI): **http://localhost:8000/api/docs/**
- API schema: http://localhost:8000/api/schema/
- Health check: http://localhost:8000/api/v1/health/

Stop with `Ctrl+C`, or run `docker compose down`. Data is kept in the `pgdata` volume. To delete it as well, run `docker compose down -v`.

## Troubleshooting

- **`cannot be loaded because running scripts is disabled`**: run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`uv` not found after install**: close and reopen PowerShell.
- **`makemigrations` says "No changes detected" but tables are missing**: the migration folders are empty. Run `makemigrations` before `migrate`.
- **`pnpm install` fails with `ERR_PNPM_NO_LOCKFILE` in Docker**: run `pnpm install` once in `app/` to create `pnpm-lock.yaml`, then build again.
- **`DJANGO_SECRET_KEY must be set`**: set `$env:DJANGO_DEBUG = "1"` for local work, or set `DJANGO_SECRET_KEY`.
- **Port 3000 or 8000 in use**: find the process with `netstat -ano | findstr :8000`, or change the port (`runserver 8001`, `pnpm dev -p 3001`).
- **`mysqlclient` fails**: MySQL is optional. Do not run `uv sync --extra mysql` unless you need it.
- **Docker: `port is already allocated`**: another service uses 5432, 8000 or 3000. Stop it or change the host port in `compose.yaml`.
- **Line-ending warnings from Git**: harmless. To silence them: `git config core.autocrlf true`.
