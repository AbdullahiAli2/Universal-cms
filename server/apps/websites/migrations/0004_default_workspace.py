from django.db import migrations


def mark_default(apps, schema_editor):
    """Existing installations: the oldest website becomes the workspace the dashboard opens."""
    Website = apps.get_model("websites", "Website")
    if Website.objects.filter(is_default=True).exists():
        return
    oldest = Website.objects.order_by("created_at", "id").first()
    if oldest is not None:
        Website.objects.filter(pk=oldest.pk).update(is_default=True)


class Migration(migrations.Migration):
    dependencies = [("websites", "0003_rolepermission_website_is_default_and_more")]

    operations = [migrations.RunPython(mark_default, migrations.RunPython.noop)]
