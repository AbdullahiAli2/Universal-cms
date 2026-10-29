"""Branding and domain rules. Members read; branding.manage and domains.manage allow changes."""

import dns.exception
import dns.resolver
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from apps.audit import services as audit
from apps.websites.models import Website
from apps.websites.permissions import require_perm
from apps.websites.serializers import DOMAIN_UNAVAILABLE

from .models import Branding, Domain

MEDIA_FIELDS = ("logo", "logo_reversed", "icon", "share_image")


def get_branding(website):
    branding, _created = Branding.objects.get_or_create(website=website)
    return branding


def update_branding(website, user, changes):
    require_perm(website, "branding.manage")
    branding = get_branding(website)
    for field, value in changes.items():
        setattr(branding, field, value)
    branding.save()
    audit.record(
        action="branding.updated", actor=user, website=website, target=branding,
        summary=f"Updated branding: {', '.join(sorted(changes))}"[:255],
    )
    return branding


def hostname_taken(hostname, website):
    """True when another website already uses this host name, as its primary domain or as an extra one."""
    return (
        Website.objects.filter(primary_domain=hostname).exclude(pk=website.pk).exists()
        or Domain.objects.filter(hostname=hostname).exclude(website=website).exists()
    )


def list_domains(website):
    # The primary domain is listed too, so it can be verified like any other.
    if website.primary_domain and not Domain.objects.filter(hostname=website.primary_domain).exists():
        try:
            with transaction.atomic():
                Domain.objects.create(website=website, hostname=website.primary_domain)
        except IntegrityError:
            pass
    return Domain.objects.filter(website=website)


@transaction.atomic
def add_domain(website, user, hostname):
    require_perm(website, "domains.manage")
    if Domain.objects.filter(website=website, hostname=hostname).exists():
        raise ValidationError({"hostname": ["This domain is already on this website."]})
    if hostname_taken(hostname, website):
        raise ValidationError({"hostname": [DOMAIN_UNAVAILABLE]})
    try:
        with transaction.atomic():
            domain = Domain.objects.create(website=website, hostname=hostname)
    except IntegrityError:
        raise ValidationError({"hostname": [DOMAIN_UNAVAILABLE]})
    audit.record(action="domain.added", actor=user, website=website, target=domain, summary=f"Added domain {hostname}")
    return domain


def get_domain(website, domain_id):
    domain = Domain.objects.filter(website=website, pk=domain_id).first()
    if domain is None:
        raise NotFound("Domain not found.")
    return domain


def remove_domain(website, user, domain_id):
    require_perm(website, "domains.manage")
    domain = get_domain(website, domain_id)
    if domain.hostname == website.primary_domain:
        raise ValidationError({"detail": "This is the primary domain. Make another domain primary, or clear it in Settings, first."})
    audit.record(action="domain.removed", actor=user, website=website, summary=f"Removed domain {domain.hostname}")
    domain.delete()


def lookup_txt(name):
    """TXT strings at a DNS name. Separate so tests can replace it."""
    answer = dns.resolver.resolve(name, "TXT", lifetime=5)
    return [b"".join(record.strings).decode("utf-8", "replace") for record in answer]


def verify_domain(website, user, domain_id):
    require_perm(website, "domains.manage")
    domain = get_domain(website, domain_id)
    try:
        values = lookup_txt(domain.record_name)
        found = domain.record_value in [value.strip().strip('"') for value in values]
        error = "" if found else "The TXT record was found but its value does not match. Check it and try again."
    except dns.resolver.NXDOMAIN:
        found, error = False, f"No record named {domain.record_name} yet. DNS changes can take up to an hour."
    except dns.resolver.NoAnswer:
        found, error = False, f"{domain.record_name} exists but has no TXT record."
    except (dns.exception.Timeout, dns.resolver.NoNameservers):
        found, error = False, "The DNS servers did not answer. Try again in a few minutes."
    except dns.exception.DNSException:
        found, error = False, "The domain could not be checked. Make sure the name is correct."
    domain.last_checked_at = timezone.now()
    domain.last_error = error
    if found and domain.verified_at is None:
        domain.verified_at = timezone.now()
        audit.record(action="domain.verified", actor=user, website=website, target=domain, summary=f"Verified {domain.hostname}")
    domain.save()
    return domain


@transaction.atomic
def make_primary(website, user, domain_id):
    require_perm(website, "domains.manage")
    domain = get_domain(website, domain_id)
    if domain.verified_at is None:
        raise ValidationError({"detail": "Verify this domain before making it primary."})
    website.primary_domain = domain.hostname
    try:
        with transaction.atomic():
            website.save(update_fields=["primary_domain", "updated_at"])
    except IntegrityError:
        raise ValidationError({"detail": DOMAIN_UNAVAILABLE})
    audit.record(action="domain.primary", actor=user, website=website, target=domain, summary=f"Made {domain.hostname} the primary domain")
    return domain
