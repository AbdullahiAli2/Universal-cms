"""Sending email with the stored settings."""

import smtplib
import socket
from email.utils import formataddr

from django.core.mail import EmailMessage
from django.core.mail.backends.smtp import EmailBackend
from django.utils import timezone

from .crypto import decrypt
from .models import EmailSettings, Security


class EmailNotConfigured(Exception):
    pass


def build_connection(config):
    password = decrypt(config.password_encrypted)
    if password is None:
        raise EmailNotConfigured("The saved password cannot be read. Enter it again and save.")
    return EmailBackend(
        host=config.host,
        port=config.port,
        username=config.username or None,
        password=password or None,
        use_tls=config.security == Security.STARTTLS,
        use_ssl=config.security == Security.SSL,
        timeout=config.timeout,
        fail_silently=False,
    )


def _message(config, to, subject, body, connection):
    sender = formataddr((config.from_name, config.from_email)) if config.from_name else config.from_email
    return EmailMessage(
        subject=subject,
        body=body,
        from_email=sender,
        to=[to],
        reply_to=[config.reply_to] if config.reply_to else None,
        connection=connection,
    )


def explain(error):
    """A message an administrator can act on, without leaking the password."""
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "The server refused the user name or password."
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "The server refused the recipient address."
    if isinstance(error, smtplib.SMTPSenderRefused):
        return "The server refused the sender address. Use an address your provider allows."
    if isinstance(error, (socket.timeout, TimeoutError)):
        return "The server did not answer in time. Check the host, port and security setting."
    if isinstance(error, (ConnectionRefusedError, socket.gaierror, OSError)) and not isinstance(error, smtplib.SMTPException):
        return "Could not connect. Check the host name, port and security setting."
    if isinstance(error, smtplib.SMTPException):
        return f"The server rejected the message: {str(error)[:200]}"
    return "Sending failed."


def send_test(config, to):
    """Sends a test message and records the result. Returns (ok, message)."""
    try:
        connection = build_connection(config)
        _message(
            config, to, "Universal CMS test email",
            "This is a test message from Universal CMS. Your email settings work.", connection,
        ).send()
        ok, error = True, ""
    except EmailNotConfigured as problem:
        ok, error = False, str(problem)
    except Exception as problem:  # noqa: BLE001 - every SMTP failure becomes a readable message
        ok, error = False, explain(problem)
    config.last_test_at = timezone.now()
    config.last_test_ok = ok
    config.last_test_error = error[:300]
    config.save(update_fields=["last_test_at", "last_test_ok", "last_test_error"])
    return ok, error


def send(to, subject, body):
    """
    Sends a system email when email is set up and switched on. Returns (sent, error). Callers carry on
    either way, for example by showing an invitation link to copy instead.
    """
    config = EmailSettings.load()
    if not config.enabled or not config.host or not config.from_email:
        return False, "Email is not set up."
    try:
        _message(config, to, subject, body, build_connection(config)).send()
        return True, ""
    except EmailNotConfigured as problem:
        return False, str(problem)
    except Exception as problem:  # noqa: BLE001
        return False, explain(problem)
