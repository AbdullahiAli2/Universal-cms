# Plugins and extensions (design)

> **Status: design only.** The plugin system is planned for Phase 4. Nothing described here is implemented yet, and the dashboard does not install or run third-party code.

## Goals

- Extend the CMS without forking it.
- Never execute untrusted packages automatically.
- Keep core and third-party code separate, so an upgrade of one does not silently break the other.

## Planned extension points

| Point | Example |
| --- | --- |
| Field types | A custom "Product SKU" field with validation and an editor control. |
| Content hooks | Run code after an entry is published. |
| API resources | Add an endpoint under `/api/v1/websites/{slug}/x/`. |
| Dashboard panels | Add a widget to the website overview. |
| Webhooks | Subscribe to content events. |

## Compatibility rules

- Each plugin declares the CMS versions it supports (`cms_version` range).
- A plugin declares every permission it needs. Admins approve them when the plugin is enabled.
- A plugin runs only after an administrator enables it for a specific website.
- A failing plugin is disabled automatically and the failure is written to the audit log.

## Installation policy

Plugins are installed by an operator, from a reviewed source. The dashboard shows what a plugin asks for, but it never downloads and runs a package on its own.
