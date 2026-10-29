"""
The request being handled, so audit entries can record where a change came from (path, method,
browser, address) without every caller passing the request along.
"""

from contextvars import ContextVar

_current_request = ContextVar("current_request", default=None)


def current_request():
    return _current_request.get()


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = _current_request.set(request)
        try:
            return self.get_response(request)
        finally:
            _current_request.reset(token)


def request_details(request):
    """Path, method, browser and address. The dashboard forwards the visitor's browser and address,
    because every dashboard request reaches the API from its server. Display only, never for access."""
    if request is None:
        return {"method": "", "path": "", "ip_address": "", "user_agent": ""}
    agent = request.headers.get("X-Client-User-Agent") or request.META.get("HTTP_USER_AGENT", "")
    address = request.headers.get("X-Client-IP") or request.META.get("REMOTE_ADDR", "")
    return {
        "method": request.method[:10],
        "path": request.path[:300],
        "ip_address": address.split(",")[0].strip()[:64],
        "user_agent": agent[:300],
    }
