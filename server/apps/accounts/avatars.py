"""Profile photos: checked by content, cropped to a square and stored as a small WebP."""

import io
import uuid

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

MAX_BYTES = 5 * 1024 * 1024
SIZE = 256
ACCEPTED = {"JPEG", "PNG", "WEBP", "GIF"}
NOT_AN_IMAGE = "Upload a JPG, PNG, WebP or GIF image."


def avatar_url(user):
    return f"{settings.MEDIA_URL}{user.avatar}" if user.avatar else None


def process(upload):
    """Returns WebP bytes of a centred square crop, or raises ValidationError."""
    if upload.size > MAX_BYTES:
        raise ValidationError({"avatar": ["Photos can be up to 5 MB."]})
    try:
        with Image.open(upload) as probe:
            if probe.format not in ACCEPTED:
                raise ValidationError({"avatar": [NOT_AN_IMAGE]})
            probe.verify()
        upload.seek(0)
        with Image.open(upload) as image:
            image = ImageOps.exif_transpose(image)  # respect the phone's rotation
            image = image.convert("RGBA" if image.mode in ("RGBA", "LA", "P") else "RGB")
            square = ImageOps.fit(image, (SIZE, SIZE), Image.Resampling.LANCZOS, centering=(0.5, 0.45))
            out = io.BytesIO()
            square.save(out, "WEBP", quality=85, method=4)
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValidationError({"avatar": [NOT_AN_IMAGE]})
    return out.getvalue()


def replace(user, upload):
    data = process(upload)
    name = default_storage.save(f"avatars/{uuid.uuid4().hex}.webp", ContentFile(data))
    old = user.avatar
    user.avatar = name
    user.save(update_fields=["avatar"])
    if old:
        default_storage.delete(old)
    return user


def remove(user):
    if user.avatar:
        default_storage.delete(user.avatar)
        user.avatar = ""
        user.save(update_fields=["avatar"])
    return user
