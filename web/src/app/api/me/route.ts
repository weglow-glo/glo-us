import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lightweight auth probe for client UI (nav swap). Reads the session
// server-side so it works even if the auth cookie isn't JS-readable.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ user: null });

  const m = (user.user_metadata ?? {}) as Record<string, string>;
  return NextResponse.json({
    user: {
      name: m.nickname || m.name || m.full_name || m.preferred_username || "회원",
      avatar: m.avatar_url || m.picture || null,
    },
  });
}
