import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";

const PUBLIC_PAGES = ["/login", "/setup", "/invite"];
// Never meant to be in a URL. Old builds could put them there when the form submitted before hydration.
const SECRET_PARAMS = ["email", "password", "confirm", "display_name", "token"];

/** Redirects by cookie presence only. The API still checks the token on every request. */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Invitation links carry a one-time token by design; everywhere else secrets are stripped.
  const secrets = pathname === "/invite" ? SECRET_PARAMS.filter((name) => name !== "token") : SECRET_PARAMS;
  if (secrets.some((name) => request.nextUrl.searchParams.has(name))) {
    const clean = request.nextUrl.clone();
    for (const name of secrets) clean.searchParams.delete(name);
    const response = NextResponse.redirect(clean, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PAGES.includes(pathname);

  if (!signedIn && !isPublic) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  if (signedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|favicon.svg).*)"],
};
