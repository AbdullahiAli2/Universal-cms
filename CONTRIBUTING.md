# Contributing

Thanks for helping. Universal CMS is early, so small focused changes are easiest to review.

## Before you start

- Check [docs/roadmap.md](docs/roadmap.md). Work on the current phase is preferred.
- For large changes, open an issue first so the design can be agreed.

## Development setup

See the local development section of the [README](README.md).

## Rules for changes

- **Keep the API as the source of truth.** Never put a permission check only in the dashboard.
- **Every website-scoped query starts from `visible_websites(user)`.** Never query `Website.objects` directly in a view.
- **Write audit entries for changes** through `apps.audit.services.record()`.
- **Do not branch on the database engine.** If a feature needs database-specific behaviour, document it in [docs/database.md](docs/database.md) and test it on each supported engine.
- **Add tests with behaviour changes.** Permission changes need tests for each role that is allowed and each role that is refused.
- **Keep the design.** The dashboard follows the Version 3 prototype's tokens and layout. Discuss visual changes in an issue first.
- **No secrets in the repository.** Use `.env.example` for new settings, with placeholder values.

## Pull requests

1. Describe what changed and why.
2. List the commands you ran (`manage.py test`, `pnpm typecheck`, `pnpm build`).
3. Update the docs and `.env.example` if you added configuration.

## Commit and code style

- Python: standard Django and DRF conventions.
- TypeScript: strict mode. Avoid `any`. Validate input with Zod.
