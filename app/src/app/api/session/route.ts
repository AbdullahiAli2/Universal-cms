import { NextResponse, type NextRequest } from "next/server";

import { callApi, clientHeaders } from "@/lib/server/upstream";
import { NO_STORE, isSameOrigin, safeNextPath } from "@/lib/server/security";
import { clearSessionCookie, setSessionCookie } from "@/lib/server/session";
import { SESSION_COOKIE } from "@/lib/constants";

const FORBIDDEN = () => NextResponse.json({ detail: "Request refused." }, { status: 403, headers: NO_STORE });

/**
 * Reads the credentials from the request body only. A native form post (sent before the page
 * has loaded its JavaScript) arrives URL-encoded; the dashboard's own fetch sends JSON.
 */
async function readCredentials(request: NextRequest): Promise<{ payload: unknown; isForm: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const email = form?.get("email");
    const password = form?.get("password");
    const payload = typeof email === "string" && typeof password === "string" ? { email, password } : null;
    return { payload, isForm: true };
  }
  return { payload: await request.json().catch(() => null), isForm: false };
}

/** Sign in: exchanges email and password for a token and stores it in an httpOnly cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return FORBIDDEN();
  const { payload, isForm } = await readCredentials(request);

  if (isForm) {
    // Redirect with 303 so the browser follows with a GET that carries no credentials.
    const login = new URL("/login", request.url);
    const next = request.nextUrl.searchParams.get("next");
    if (next) login.searchParams.set("next", safeNextPath(next));
    if (!payload) {
      login.searchParams.set("error", "invalid");
      return NextResponse.redirect(login, { status: 303, headers: NO_STORE });
    }
    const upstream = await callApi("auth/login/", { method: "POST", body: payload, headers: clientHeaders(request) });
    if (!upstream.ok) {
      login.searchParams.set("error", upstream.status === 429 ? "throttled" : upstream.status === 401 || upstream.status === 400 ? "invalid" : "unavailable");
      return NextResponse.redirect(login, { status: 303, headers: NO_STORE });
    }
    const data = upstream.data as { token: string };
    const response = NextResponse.redirect(new URL(safeNextPath(next), request.url), { status: 303, headers: NO_STORE });
    setSessionCookie(response, data.token);
    return response;
  }

  if (!payload) return NextResponse.json({ detail: "Invalid request." }, { status: 400, headers: NO_STORE });

  const upstream = await callApi("auth/login/", { method: "POST", body: payload, headers: clientHeaders(request) });
  if (!upstream.ok) return NextResponse.json(upstream.data, { status: upstream.status, headers: NO_STORE });

  const data = upstream.data as { token: string; user: unknown };
  const response = NextResponse.json(data.user, { headers: NO_STORE });
  setSessionCookie(response, data.token);
  return response;
}

/** Sign out: revokes the token on the API and clears the cookie. */
export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return FORBIDDEN();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) await callApi("auth/logout/", { method: "POST", token });
  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  clearSessionCookie(response);
  return response;
}
