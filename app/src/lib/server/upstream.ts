import { apiBase } from "./config";

export type UpstreamResult = { ok: boolean; status: number; data: unknown };

/** Calls the Django API from a route handler. `path` has no leading slash and keeps its trailing slash. */
export async function callApi(
  path: string,
  init: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<UpstreamResult> {
  const headers: Record<string, string> = { Accept: "application/json", ...init.headers };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Token ${init.token}`;

  try {
    const response = await fetch(`${apiBase()}/${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return {
      ok: false,
      status: 502,
      data: { detail: "The CMS API is unreachable. Check that the server is running." },
    };
  }
}

/**
 * The browser and address of the person signing in, for the Active sessions list. Every request reaches
 * the API from this server, so it passes them on. They are shown to the user only, never used for access.
 */
export function clientHeaders(request: Request): Record<string, string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  return {
    "X-Client-User-Agent": (request.headers.get("user-agent") ?? "").slice(0, 300),
    "X-Client-IP": forwarded.slice(0, 64),
  };
}
