import { NextResponse, type NextRequest } from "next/server";

import { apiBase } from "@/lib/server/config";

/** Same pattern the API accepts: /media/<website id or "avatars">/<32 hex chars>.<ext> */
const MEDIA_PATH = /^(?:\d+|avatars)\/[0-9a-f]{32}\.(?:jpg|png|webp|gif|pdf)$/;
const PASSED_HEADERS = ["content-type", "content-length", "cache-control", "last-modified", "etag"];

/** Serves uploaded files to the dashboard by streaming them from the API server. */
export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join("/");
  if (!MEDIA_PATH.test(joined)) return new NextResponse("Not found.", { status: 404 });

  let upstream: Response;
  try {
    upstream = await fetch(`${new URL(apiBase()).origin}/media/${joined}`, {
      headers: { "If-Modified-Since": request.headers.get("if-modified-since") ?? "" },
      cache: "no-store",
    });
  } catch {
    return new NextResponse("The CMS API is unreachable.", { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 304) return new NextResponse("Not found.", { status: 404 });

  const headers = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
