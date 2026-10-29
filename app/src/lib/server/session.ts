import type { NextResponse } from "next/server";

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

import { cookieSecure } from "./config";

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  // Same attributes as when it was set, so every browser replaces the cookie instead of adding a second one.
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(),
    path: "/",
    maxAge: 0,
  });
}
