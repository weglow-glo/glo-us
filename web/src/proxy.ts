import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware` convention to `proxy`.
export async function proxy(request: NextRequest) {
  // Gate the admin dashboard with HTTP Basic Auth (exposes all customer PII).
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return new NextResponse("Admin disabled (ADMIN_PASSWORD not set)", {
        status: 503,
      });
    }
    const header = request.headers.get("authorization");
    let ok = false;
    if (header?.startsWith("Basic ")) {
      try {
        const pass = atob(header.slice(6)).split(":")[1] ?? "";
        ok = pass === expected;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      return new NextResponse("인증이 필요합니다.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="glo admin"' },
      });
    }
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and image files.
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
