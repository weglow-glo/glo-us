import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth callback. Supabase (after Kakao) redirects here with `?code=...`.
 * We exchange the code for a session (sets auth cookies), then send the
 * user to `next` (defaults to /account).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] exchange failed:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
