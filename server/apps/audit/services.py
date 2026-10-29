"""Single entry point for writing audit entries. Call it from services and views, never from models."""

from .context import current_request, request_details
from .models import AuditLog


def record(*, action, summary, actor=None, website=None, target=None):
    target_type = type(target).__name__.lower() if target is not None else ""
    target_id = str(target.pk) if target is not None else ""
    return AuditLog.objects.create(
        actor=actor if actor is not None and actor.is_authenticated else None,
        website=website,
        action=action,
        target_type=target_type,
        target_id=target_id,
        summary=summary[:255],
        **request_details(current_request()),
    )
