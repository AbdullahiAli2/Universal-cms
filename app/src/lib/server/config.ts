/** Server-only configuration. Never import this from a client component. */
export function apiBase(): string {
  return (process.env.CMS_API_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");
}

/** Secure by default in production builds. Set CMS_COOKIE_SECURE=false only for plain-HTTP local testing. */
export function cookieSecure(): boolean {
  const value = process.env.CMS_COOKIE_SECURE?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return process.env.NODE_ENV === "production";
}
