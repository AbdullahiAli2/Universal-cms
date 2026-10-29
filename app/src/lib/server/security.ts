import type { NextRequest } from "next/server";

export { safeNextPath } from "@/lib/utils";

/**
 * CSRF guard for route handlers that act on the session cookie.
 *
 * Browsers send Origin (and Sec-Fetch-Site) on every POST, PATCH, PUT and DELETE,
 * so a request made from another site is refused even though SameSite=Lax would
 * still attach the cookie for a sibling subdomain. Requests with neither header
 * come from non-browser clients, which cannot be tricked into sending a cookie.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // includes Origin: null from sandboxed frames and file:// pages
  }
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
  if (host && originHost === host) return true;
  // For reverse proxies that rewrite Host without setting X-Forwarded-Host, e.g. CMS_TRUSTED_ORIGINS=https://cms.example.com
  return trustedOrigins().includes(new URL(origin).origin);
}

function trustedOrigins(): string[] {
  return (process.env.CMS_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export const NO_STORE = { "Cache-Control": "no-store" } as const;
