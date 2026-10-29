# Database support

The database is chosen with `CMS_DATABASE`. Application code never checks which engine is in use.

| Engine | Setting | Status | Notes |
| --- | --- | --- | --- |
| PostgreSQL 16 | `CMS_DATABASE=postgres` | Recommended. A CI job runs the test suite against it. The job has not run yet. | Used by Docker Compose. |
| SQLite | `CMS_DATABASE=sqlite` | Supported for local development and tests. | Single writer, so do not use it for multi-worker production. |
| MySQL 8 | `CMS_DATABASE=mysql` | Optional. Configured, but **not yet verified** by the test suite. | Needs `uv sync --extra mysql` and MySQL client headers. Uses utf8mb4. |

## Known limitations

- **MySQL:** case-insensitive collation is the default, so email uniqueness is also case-insensitive there. Check this before you rely on mixed-case emails.
- **MySQL:** `CheckConstraint` and `UniqueConstraint` behaviour matches Django's documentation, but no MySQL CI job exists yet.
- **SQLite:** concurrent writes lock the file. Use PostgreSQL for more than one API worker.

## Migrations

Migrations are plain Django migrations. Each app owns its migrations. The API never creates tables at runtime, and no user-provided code runs during a migration.

```bash
cd server
uv run python manage.py makemigrations
uv run python manage.py migrate
```

Commit the generated `migrations/` files with the model changes that produced them.
