from django.db import migrations

from apps.content.builtins import BUILTIN_TYPES


def add_builtin_types(apps, schema_editor):
    """Websites created before the content engine get the same built-in types as new ones."""
    Website = apps.get_model("websites", "Website")
    ContentType = apps.get_model("content", "ContentType")
    for website in Website.objects.all():
        existing = set(ContentType.objects.filter(website=website).values_list("key", flat=True))
        ContentType.objects.bulk_create(
            [
                ContentType(website=website, is_builtin=True, **definition)
                for definition in BUILTIN_TYPES
                if definition["key"] not in existing
            ]
        )


class Migration(migrations.Migration):
    dependencies = [
        ("content", "0001_initial"),
        ("websites", "0002_website_source_frontend"),
    ]

    operations = [migrations.RunPython(add_builtin_types, migrations.RunPython.noop)]
