# Django API image. Build context is ./server.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:0.8.0 /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first so code changes do not invalidate this layer.
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

COPY . .

# collectstatic needs settings to load. This placeholder is used only during the build.
RUN DJANGO_SECRET_KEY=build-only-placeholder python manage.py collectstatic --noinput \
    && useradd --create-home --uid 10001 cms \
    && mkdir -p /app/data/media \
    && chown -R cms:cms /app/data

USER cms
EXPOSE 8000

# Apply migrations on start, then serve with gunicorn. Scale with GUNICORN_WORKERS.
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers ${GUNICORN_WORKERS:-3} --access-logfile -"]
