"""
Readable browser, operating system, device and address, parsed on the server with the `user-agents`
library (ua-parser's regularly updated database) rather than hand-written patterns.
"""

import ipaddress
from functools import lru_cache

from user_agents import parse


@lru_cache(maxsize=512)
def describe_agent(user_agent):
    """{"browser": "Chrome 130", "os": "Windows 10", "device": "Desktop"} — empty strings when unknown."""
    if not user_agent:
        return {"browser": "", "os": "", "device": ""}
    agent = parse(user_agent)
    browser = " ".join(part for part in (agent.browser.family, agent.browser.version_string.split(".")[0]) if part and part != "Other")
    os_name = " ".join(part for part in (agent.os.family, agent.os.version_string) if part and part != "Other")
    if agent.is_bot:
        device = "Bot or crawler"
    elif agent.is_mobile:
        device = "Phone"
    elif agent.is_tablet:
        device = "Tablet"
    elif agent.is_pc:
        device = "Desktop"
    elif agent.os.family == "Other":
        # curl, Python requests, Postman and similar name no operating system.
        device = "Script or API client"
    else:
        device = "Other device"
    return {"browser": browser or "Unknown browser", "os": os_name or "Unknown system", "device": device}


def describe_ip(address):
    """Normalised address plus a hint for the special cases people otherwise misread (e.g. "::1")."""
    if not address:
        return {"ip_address": "", "ip_note": ""}
    try:
        ip = ipaddress.ip_address(address.strip("[]"))
    except ValueError:
        return {"ip_address": address, "ip_note": ""}
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped  # "::ffff:203.0.113.9" -> "203.0.113.9"
    if ip.is_loopback:
        note = "This computer (local development)"
    elif ip.is_private:
        note = "Private network"
    else:
        note = ""
    return {"ip_address": str(ip), "ip_note": note}
