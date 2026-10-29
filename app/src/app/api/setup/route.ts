import { NextResponse, type NextRequest } from "next/server";

import { callApi, clientHeaders } from "@/lib/server/upstream";
import { NO_STORE, isSameOrigin } from "@/lib/server/security";
import { setSessionCookie } from "@/lib/server/session";

/** Tells the setup page whether the first administrator already exists. */
export async function GET() {
  const upstream = await callApi("auth/status/");
  return NextResponse.json(upstream.data, { status: upstream.status });
}

/** First-run setup: creates the platform administrator and signs them in. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Request refused." }, { status: 403, headers: NO_STORE });
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    // A native form post sent before the page's JavaScript loaded. Nothing is created; send the
    // browser back with a 303 so the follow-up GET carries no password.
    const setup = new URL("/setup", request.url);
    setup.searchParams.set("error", "retry");
    return NextResponse.redirect(setup, { status: 303, headers: NO_STORE });
  }
  const payload: unknown = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ detail: "Invalid request." }, { status: 400, headers: NO_STORE });

  const upstream = await callApi("auth/bootstrap/", { method: "POST", body: payload, headers: clientHeaders(request) });
  if (!upstream.ok) return NextResponse.json(upstream.data, { status: upstream.status, headers: NO_STORE });

  const data = upstream.data as { token: string; user: unknown };
  const response = NextResponse.json(data.user, { status: 201, headers: NO_STORE });
  setSessionCookie(response, data.token);
  return response;
}
