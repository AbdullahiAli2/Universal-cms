"""
Content types every website starts with. Field definitions use the same format as custom types:
{"key", "label", "type", "required", "help"}; see fields.py for the supported types.

Shapes follow what real sites need, for example Kaadir Institute's publications (cover, PDF, authors)
and events (start and end, venue, format, registration link).
"""

BUILTIN_TYPES = [
    {
        "key": "article",
        "name": "News & Articles",
        "singular_name": "Article",
        "description": "News stories, blog posts and announcements.",
        "fields": [
            {"key": "cover", "label": "Cover image", "type": "image", "required": False, "help": "Shown at the top of the article and in lists."},
            {"key": "byline", "label": "Byline", "type": "text", "required": False, "help": "Shown as the writer's name. Leave empty to use the author."},
            {"key": "category", "label": "Category", "type": "text", "required": False, "help": "For example Institute news, Opportunities or Media."},
            {"key": "gallery", "label": "Photo gallery", "type": "gallery", "required": False, "help": ""},
        ],
    },
    {
        "key": "event",
        "name": "Events",
        "singular_name": "Event",
        "description": "Things happening on a date: conferences, launches, webinars.",
        "fields": [
            {"key": "starts_at", "label": "Starts", "type": "datetime", "required": True, "help": ""},
            {"key": "ends_at", "label": "Ends", "type": "datetime", "required": False, "help": ""},
            {"key": "location", "label": "Location", "type": "text", "required": False, "help": "City, or Online."},
            {"key": "venue", "label": "Venue", "type": "text", "required": False, "help": ""},
            {"key": "format", "label": "Format", "type": "text", "required": False, "help": "In person, Online or Hybrid."},
            {"key": "registration_url", "label": "Registration link", "type": "url", "required": False, "help": ""},
            {"key": "image", "label": "Event image", "type": "image", "required": False, "help": ""},
            {"key": "gallery", "label": "Photo gallery", "type": "gallery", "required": False, "help": "Photos from the event, once it has happened."},
        ],
    },
    {
        "key": "publication",
        "name": "Publications",
        "singular_name": "Publication",
        "description": "Reports, papers and downloadable documents.",
        "fields": [
            {"key": "document", "label": "PDF", "type": "document", "required": False, "help": "The downloadable version."},
            {"key": "cover", "label": "Cover image", "type": "image", "required": False, "help": ""},
            {"key": "issued_on", "label": "Date issued", "type": "date", "required": False, "help": ""},
            {"key": "authors", "label": "Authors", "type": "text", "required": False, "help": "Separate names with commas."},
            {"key": "category", "label": "Category", "type": "text", "required": False, "help": "For example Report, Policy brief or Commentary."},
        ],
    },
    {
        "key": "page",
        "name": "Pages",
        "singular_name": "Page",
        "description": "Standalone pages such as About or Contact.",
        "fields": [
            {"key": "cover", "label": "Header image", "type": "image", "required": False, "help": ""},
        ],
    },
]

BUILTIN_KEYS = {item["key"] for item in BUILTIN_TYPES}
