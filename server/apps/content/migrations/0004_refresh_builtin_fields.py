from django.db import migrations

from apps.content.builtins import BUILTIN_TYPES


def refresh_builtin_fields(apps, schema_editor):
    """Built-in types gain media fields (cover, PDF, gallery). Existing values in entries are kept."""
    ContentType = apps.get_model("content", "ContentType")
    for definition in BUILTIN_TYPES:
        ContentType.objects.filter(key=definition["key"], is_builtin=True).update(fields=definition["fields"])


class Migration(migrations.Migration):
    dependencies = [("content", "0003_entry_seo_entryrevision_seo")]

    operations = [migrations.RunPython(refresh_builtin_fields, migrations.RunPython.noop)]
