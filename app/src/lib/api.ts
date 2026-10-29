/**
 * Browser-side client. All requests go through /api/proxy, which attaches the
 * httpOnly session cookie on the server. The token never reaches JavaScript.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string[]>;

  constructor(message: string, status: number, fields: Record<string, string[]> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

/** Turns a DRF error body ({detail} or {field: [messages]}) into a readable message plus field errors. */
export function messageFrom(data: unknown, status: number): { message: string; fields: Record<string, string[]> } {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return { message: record.detail, fields: {} };

    const fields: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(record)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        // Nested errors, such as {"data": {"starts_at": "..."}}, become "data.starts_at".
        for (const [inner, message] of Object.entries(value as Record<string, unknown>)) {
          fields[`${key}.${inner}`] = Array.isArray(message) ? message.map(String) : [String(message)];
        }
      } else {
        fields[key] = Array.isArray(value) ? value.map(String) : [String(value)];
      }
    }
    const first = Object.values(fields)[0]?.[0];
    if (first) return { message: first, fields };
  }
  return { message: `Request failed (${status}).`, fields: {} };
}

/** Paths are written with a trailing slash (Django style). The proxy adds it back, so the browser never hits a redirect. */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const clean = path.replace(/^\/+|\/+$/g, "");
  const response = await fetch(`/api/proxy/${clean}`, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { message, fields } = messageFrom(data, response.status);
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.assign("/login");
    }
    throw new ApiError(message, response.status, fields);
  }
  return data as T;
}
