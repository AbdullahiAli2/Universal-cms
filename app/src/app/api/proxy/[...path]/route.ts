import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";
import { apiBase } from "@/lib/server/config";
import { isSameOrigin } from "@/lib/server/security";
import { clearSessionCookie } from "@/lib/server/session";
import { clientHeaders } from "@/lib/server/upstream";

/**
 * Forwards dashboard requests to the Django API with the session token attached.
 * Only the endpoints the dashboard uses are reachable. Sign-in, sign-up and setup
 * go through their own routes so the cookie is always set correctly.
 */
const MAX_BODY_BYTES = 1_000_000;
// Uploads may be larger. The API enforces the real limit (CMS_MAX_UPLOAD_MB); this only stops runaway bodies.
const MAX_UPLOAD_BYTES = (Number(process.env.CMS_MAX_UPLOAD_MB ?? 25) + 1) * 1024 * 1024;

/** The routes that accept multipart form data: media uploads and profile photos. */
const isUpload = (method: string, segments: string[]) =>
  method === "POST" &&
  ((segments.length === 3 && segments[0] === "websites" && segments[2] === "media") || segments.join("/") === "auth/me/avatar");

const AUTH_ROUTES = [["me"], ["me", "password"], ["me", "avatar"], ["sessions"], ["sessions", "revoke-others"]];

const ALLOWED = (segments: string[]) =>
  segments[0] === "websites" ||
  segments[0] === "health" ||
  segments[0] === "workspace" ||
  (segments[0] === "settings" && segments[1] === "email") ||
  (segments[0] === "auth" &&
    (AUTH_ROUTES.some((route) => route.join("/") === segments.slice(1).join("/")) ||
      (segments.length === 3 && segments[1] === "sessions" && /^\d+$/.test(segments[2]))));

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || !ALLOWED(path)) {
    return NextResponse.json({ detail: "Not found." }, { status: 404 });
  }
  if (!["GET", "HEAD"].includes(request.method) && !isSameOrigin(request)) {
    return NextResponse.json({ detail: "Request refused." }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  // The visitor's browser and address, for the audit trail (display only).
  const headers: Record<string, string> = { Accept: "application/json", ...clientHeaders(request) };
  const hasBody = !["GET", "HEAD", "DELETE"].includes(request.method);
  const contentType = request.headers.get("content-type") ?? "";
  const upload = isUpload(request.method, path) && contentType.startsWith("multipart/form-data");
  if (hasBody) {
    const limit = upload ? MAX_UPLOAD_BYTES : MAX_BODY_BYTES;
    if (Number(request.headers.get("content-length") ?? 0) > limit) {
      return NextResponse.json({ detail: "The request is too large." }, { status: 413 });
    }
    if (upload) {
      headers["Content-Type"] = contentType; // keeps the multipart boundary
    } else if (contentType.includes("application/json")) {
      headers["Content-Type"] = "application/json";
    } else {
      return NextResponse.json({ detail: "Send JSON." }, { status: 415 });
    }
  }
  if (token) headers.Authorization = `Token ${token}`;

  const target = `${apiBase()}/${path.map(encodeURIComponent).join("/")}/${request.nextUrl.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? (upload ? await request.arrayBuffer() : await request.text()) : undefined,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { detail: "The CMS API is unreachable. Check that the server is running." },
      { status: 502 },
    );
  }

  if (upstream.status === 204) return new NextResponse(null, { status: 204 });

  const response = new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" },
  });
  if (upstream.status === 401) clearSessionCookie(response);
  return response;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
