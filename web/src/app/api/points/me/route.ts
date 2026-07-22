import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** 내 포인트 잔액 + 30일 내 만료 예정액. RLS(points_select_own)로 본인 것만 조회된다. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ balance: 0, expiringSoon: 0, signedIn: false });

  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86400000);
  const { data } = await supabase
    .from("points")
    .select("remaining, expires_at")
    .gt("delta", 0)
    .gt("remaining", 0)
    .gt("expires_at", now.toISOString());

  const lots = data ?? [];
  const balance = lots.reduce((s, r) => s + (r.remaining ?? 0), 0);
  const expiringSoon = lots
    .filter((r) => r.expires_at && new Date(r.expires_at) <= soon)
    .reduce((s, r) => s + (r.remaining ?? 0), 0);

  return NextResponse.json({ balance, expiringSoon, signedIn: true });
}
