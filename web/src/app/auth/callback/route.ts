import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMetaRegistration } from "@/lib/meta-capi";

/**
 * OAuth callback. Supabase (after Kakao) redirects here with `?code=...`.
 * We exchange the code for a session (sets auth cookies), then send the
 * user to `next` (defaults to /).
 *
 * On a brand-new signup we also fire a Meta CompleteRegistration: server-side
 * via CAPI here (reliable), plus the browser pixel fires the deduped twin when
 * it sees the `_reg` param we append to the destination.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const user = data.user;
      let dest = `${origin}${next}`;

      // A first OAuth login creates the auth user just now → treat as signup.
      const createdAt = user?.created_at ? Date.parse(user.created_at) : 0;
      const isNewSignup = createdAt > 0 && Date.now() - createdAt < 5 * 60 * 1000;

      if (isNewSignup && user) {
        // Deterministic id so the CAPI + browser events dedupe.
        const eventId = `reg_${user.id}_${Math.floor(createdAt / 1000)}`;
        const cookieHeader = request.headers.get("cookie") ?? "";
        const readCookie = (name: string) =>
          cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;

        // Awaited so the event isn't dropped when the serverless fn returns.
        await sendMetaRegistration({
          eventId,
          email: user.email ?? null,
          externalId: user.id,
          fbp: readCookie("_fbp"),
          fbc: readCookie("_fbc"),
          clientIp:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
          userAgent: request.headers.get("user-agent"),
          sourceUrl: request.headers.get("referer"),
        });

        const u = new URL(dest);
        u.searchParams.set("_reg", eventId);
        dest = u.toString();
      }

      return NextResponse.redirect(dest);
    }
    console.error("[auth/callback] exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
