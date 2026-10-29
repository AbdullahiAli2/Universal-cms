"""
Uploads and media rules. File types are decided from the file's contents, never from its name.

Permissions: media.upload lets you upload and change your own files; media.manage lets you change any file.
"""

import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.db import transaction
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.audit import services as audit
from apps.websites.permissions import has_perm

from .models import MediaAsset, MediaKind

IMAGE_FORMATS = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp"), "GIF": ("image/gif", ".gif")}
UNSUPPORTED = "Upload a JPG, PNG, WebP or GIF image, or a PDF document."
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")


def can_upload(website):
    return has_perm(website, "media.upload")


def can_change(website, user, asset):
    if has_perm(website, "media.manage"):
        return True
    return can_upload(website) and asset.uploaded_by_id is not None and asset.uploaded_by_id == user.id


def max_upload_bytes():
    return settings.CMS_MAX_UPLOAD_MB * 1024 * 1024


def inspect_upload(upload):
    """Returns (kind, mime, extension, width, height) or raises ValidationError."""
    if upload.size > max_upload_bytes():
        raise ValidationError({"file": [f"Files can be up to {settings.CMS_MAX_UPLOAD_MB} MB."]})
    upload.seek(0)
    head = upload.read(8)
    upload.seek(0)
    if head.startswith(b"%PDF-"):
        return MediaKind.DOCUMENT, "application/pdf", ".pdf", None, None
    try:
        with Image.open(upload) as image:
            image_format = image.format
            width, height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError({"file": [UNSUPPORTED]})
    finally:
        upload.seek(0)
    if image_format not in IMAGE_FORMATS:
        raise ValidationError({"file": [UNSUPPORTED]})
    mime, extension = IMAGE_FORMATS[image_format]
    return MediaKind.IMAGE, mime, extension, width, height


def normalise_video_url(url):
    """Turns YouTube and Vimeo page links into privacy-friendly embed addresses."""
    parts = urlsplit((url or "").strip())
    host = (parts.hostname or "").lower().removeprefix("www.").removeprefix("m.")
    video_id = ""
    if host in ("youtube.com", "youtube-nocookie.com"):
        if parts.path == "/watch":
            video_id = parse_qs(parts.query).get("v", [""])[0]
        elif parts.path.startswith(("/embed/", "/shorts/", "/live/")):
            video_id = parts.path.split("/")[2]
    elif host == "youtu.be":
        video_id = parts.path.lstrip("/").split("/")[0]
    if video_id and YOUTUBE_ID.match(video_id):
        return f"https://www.youtube-nocookie.com/embed/{video_id}"
    if host in ("vimeo.com", "player.vimeo.com"):
        number = parts.path.rstrip("/").split("/")[-1]
        if number.isdigit():
            return f"https://player.vimeo.com/video/{number}"
    raise ValidationError({"embed_url": ["Paste a YouTube or Vimeo link."]})


def get_asset(website, asset_id):
    asset = MediaAsset.objects.filter(website=website, pk=asset_id).select_related("uploaded_by").first()
    if asset is None:
        raise NotFound("File not found.")
    return asset


@transaction.atomic
def upload_file(website, user, upload, *, title="", alt_text="", caption="", credit=""):
    if not can_upload(website):
        raise PermissionDenied("Your role on this website does not allow uploading files.")
    kind, mime, extension, width, height = inspect_upload(upload)
    original = Path(upload.name or "file").name[:255]
    asset = MediaAsset(
        website=website,
        kind=kind,
        title=(title or Path(original).stem or "Untitled")[:200],
        original_name=original,
        mime_type=mime,
        size=upload.size,
        width=width,
        height=height,
        alt_text=alt_text,
        caption=caption,
        credit=credit,
        uploaded_by=user,
    )
    # Save under the detected extension, so a PNG named "photo.pdf" is stored and served as a PNG.
    asset.file.save(f"upload{extension}", upload, save=False)
    asset.save()
    audit.record(action="media.uploaded", actor=user, website=website, target=asset, summary=f"Uploaded “{asset.title}”")
    return asset


@transaction.atomic
def add_video(website, user, *, embed_url, title, caption="", credit=""):
    if not can_upload(website):
        raise PermissionDenied("Your role on this website does not allow adding media.")
    asset = MediaAsset.objects.create(
        website=website, kind=MediaKind.VIDEO, embed_url=normalise_video_url(embed_url), title=title,
        caption=caption, credit=credit, uploaded_by=user,
    )
    audit.record(action="media.uploaded", actor=user, website=website, target=asset, summary=f"Added video “{asset.title}”")
    return asset


def update_asset(website, user, asset_id, changes):
    asset = get_asset(website, asset_id)
    if not can_change(website, user, asset):
        raise PermissionDenied("Your role does not allow changing this file.")
    if "embed_url" in changes:
        if asset.kind != MediaKind.VIDEO:
            raise ValidationError({"embed_url": ["Only video links have an address to change."]})
        changes["embed_url"] = normalise_video_url(changes["embed_url"])
    for field, value in changes.items():
        setattr(asset, field, value)
    asset.save()
    audit.record(action="media.updated", actor=user, website=website, target=asset, summary=f"Updated “{asset.title}”")
    return asset


def usage(website, asset_id):
    """Where a file is used: entry fields, entry share images and the website's branding."""
    from apps.content.models import Entry  # content depends on media, so import here

    used = []
    media_types = {"image", "document", "gallery"}
    for entry in Entry.objects.filter(website=website).select_related("content_type").only(
        "id", "title", "data", "seo", "content_type__key", "content_type__fields"
    ):
        keys = [f["key"] for f in entry.content_type.fields if f.get("type") in media_types]
        hit = any(entry.data.get(key) == asset_id or (isinstance(entry.data.get(key), list) and asset_id in entry.data[key]) for key in keys)
        if hit or (entry.seo or {}).get("image") == asset_id:
            used.append({"kind": "entry", "id": entry.id, "type": entry.content_type.key, "title": entry.title})
    branding = getattr(website, "branding", None)
    if branding is not None:
        for field, label in (("logo", "Logo"), ("logo_reversed", "Reversed logo"), ("icon", "Site icon"), ("share_image", "Default share image")):
            if getattr(branding, f"{field}_id") == asset_id:
                used.append({"kind": "branding", "id": None, "type": field, "title": label})
    return used


@transaction.atomic
def delete_asset(website, user, asset_id):
    asset = get_asset(website, asset_id)
    if not can_change(website, user, asset):
        raise PermissionDenied("Your role does not allow deleting this file.")
    used = usage(website, asset.pk)
    if used:
        names = ", ".join(f"“{item['title']}”" for item in used[:3])
        more = f" and {len(used) - 3} more" if len(used) > 3 else ""
        raise ValidationError({"detail": f"This file is still used by {names}{more}. Remove it there first."})
    audit.record(action="media.deleted", actor=user, website=website, summary=f"Deleted “{asset.title}”")
    stored = asset.file.name
    asset.delete()
    if stored:
        # Remove the file only once the database change is committed.
        storage = asset.file.storage
        transaction.on_commit(lambda: storage.delete(stored))
