import { NextResponse, type NextRequest } from "next/server";

import { NO_STORE, isSameOrigin } from "@/lib/server/security";
import { setSessionCookie } from "@/lib/server/session";
import { callApi, clientHeaders } from "@/lib/server/upstream";

/** Who an invitation is for, so the page can greet them before they choose a password. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const upstream = await callApi(`auth/invitation/?token=${encodeURIComponent(token)}`);
  return NextResponse.json(upstream.data, { status: upstream.status, headers: { ...NO_STORE, "Referrer-Policy": "no-referrer" } });
}

/** Accepts an invitation: sets the password and signs the person in with an httpOnly cookie. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ detail: "Request refused." }, { status: 403, headers: NO_STORE });
  const payload: unknown = await request.json().catch(() => null);
  if (!payload) return NextResponse.json({ detail: "Invalid request." }, { status: 400, headers: NO_STORE });

  const upstream = await callApi("auth/invitation/accept/", { method: "POST", body: payload, headers: clientHeaders(request) });
  if (!upstream.ok) return NextResponse.json(upstream.data, { status: upstream.status, headers: NO_STORE });

  const data = upstream.data as { token: string; user: unknown };
  const response = NextResponse.json(data.user, { status: 201, headers: NO_STORE });
  setSessionCookie(response, data.token);
  return response;
}
