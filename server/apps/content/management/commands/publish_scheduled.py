from django.core.management.base import BaseCommand

from apps.content.services import publish_due_entries


class Command(BaseCommand):
    help = "Publish scheduled entries whose time has come. Run every minute from cron or a scheduler."

    def handle(self, *args, **options):
        count = publish_due_entries()
        self.stdout.write(f"Published {count} scheduled entr{'y' if count == 1 else 'ies'}.")
