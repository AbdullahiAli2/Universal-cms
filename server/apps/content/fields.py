"""Validates Entry.data against a content type's field definitions."""

from datetime import date, datetime

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

MAX_TEXT = 500
MAX_TEXTAREA = 5000
MAX_GALLERY = 50
# Field types that point at files in the website's media library, and the kind of file each accepts.
MEDIA_FIELD_KINDS = {"image": "image", "document": "document", "gallery": "image"}
_url = URLValidator(schemes=["http", "https"])


def _media_id(value):
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("Choose a file from the media library.")
    return value


def _clean_value(field, value, tz, media):
    """Returns the cleaned value, or raises ValueError with a message for the editor."""
    kind = field["type"]
    if kind == "text":
        if not isinstance(value, str):
            raise ValueError("Enter text.")
        value = value.strip()
        if len(value) > MAX_TEXT:
            raise ValueError(f"Keep this under {MAX_TEXT} characters.")
        return value
    if kind == "textarea":
        if not isinstance(value, str):
            raise ValueError("Enter text.")
        if len(value) > MAX_TEXTAREA:
            raise ValueError(f"Keep this under {MAX_TEXTAREA} characters.")
        return value
    if kind == "url":
        if not isinstance(value, str):
            raise ValueError("Enter a web address.")
        value = value.strip()
        try:
            _url(value)
        except DjangoValidationError:
            raise ValueError("Enter a full web address, starting with https://.")
        return value
    if kind == "date":
        parsed = parse_date(value) if isinstance(value, str) else None
        if not isinstance(parsed, date):
            raise ValueError("Enter a date as YYYY-MM-DD.")
        return parsed.isoformat()
    if kind == "datetime":
        try:
            parsed = parse_datetime(value) if isinstance(value, str) else None
        except ValueError:
            parsed = None
        if not isinstance(parsed, datetime):
            raise ValueError("Enter a date and time.")
        if timezone.is_naive(parsed):
            # Editors type local times. Read them in the website's time zone.
            parsed = timezone.make_aware(parsed, tz or timezone.get_default_timezone())
        return parsed.isoformat()
    if kind == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Enter a number.")
        return value
    if kind == "boolean":
        if not isinstance(value, bool):
            raise ValueError("Choose yes or no.")
        return value
    if kind in ("image", "document"):
        asset_id = _media_id(value)
        if asset_id not in media(MEDIA_FIELD_KINDS[kind], [asset_id]):
            raise ValueError("That file is not in this website's media library." if kind == "document" else "Choose an image from this website's media library.")
        return asset_id
    if kind == "gallery":
        if not isinstance(value, list):
            raise ValueError("Choose images from the media library.")
        ids = list(dict.fromkeys(_media_id(item) for item in value))
        if len(ids) > MAX_GALLERY:
            raise ValueError(f"A gallery can hold up to {MAX_GALLERY} images.")
        found = media("image", ids)
        if any(asset_id not in found for asset_id in ids):
            raise ValueError("Every gallery item must be an image from this website's media library.")
        return ids
    raise ValueError("This field type is not supported.")


def no_media(kind, ids):
    return set()


def clean_data(definitions, data, tz=None, media=no_media):
    """
    Keeps only defined keys, converts values, and checks required fields.
    `media(kind, ids)` returns the ids that exist in the website's library with that kind.
    Returns (cleaned, errors) where errors maps field keys to messages.
    """
    data = data if isinstance(data, dict) else {}
    cleaned, errors = {}, {}
    for field in definitions:
        key = field["key"]
        value = data.get(key)
        empty = value is None or value == [] or (isinstance(value, str) and not value.strip())
        if empty:
            if field.get("required"):
                errors[key] = f"{field['label']} is required."
            continue
        try:
            cleaned[key] = _clean_value(field, value, tz, media)
        except ValueError as error:
            errors[key] = str(error)
    return cleaned, errors
