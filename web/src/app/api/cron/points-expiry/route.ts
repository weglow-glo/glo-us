import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, sendPointsExpiryNotice } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOTICE_DAYS = 30;

/**
 * 30일 내 만료되는 포인트 로트를 가진 회원에게 안내 문자를 1회 발송한다
 * (공정위 가이드라인 — 소멸 사전 안내). Vercel Cron이 매일 호출.
 * 로트별 expiry_notified_at으로 중복 발송을 막고, 연락처는 최근 주문에서 가져온다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();
  const soon = new Date(now.getTime() + NOTICE_DAYS * 86400000);

  const { data, error } = await admin
    .from("points")
    .select("id, user_id, remaining, expires_at")
    .gt("delta", 0)
    .gt("remaining", 0)
    .gt("expires_at", now.toISOString())
    .lte("expires_at", soon.toISOString())
    .is("expiry_notified_at", null)
    .limit(200)
    .returns<{ id: string; user_id: string; remaining: number; expires_at: string }[]>();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 사용자별로 묶어 1통만 보낸다.
  const byUser = new Map<string, { lots: string[]; total: number; earliest: string }>();
  for (const lot of data ?? []) {
    const cur = byUser.get(lot.user_id) ?? { lots: [], total: 0, earliest: lot.expires_at };
    cur.lots.push(lot.id);
    cur.total += lot.remaining;
    if (lot.expires_at < cur.earliest) cur.earliest = lot.expires_at;
    byUser.set(lot.user_id, cur);
  }

  let sent = 0;
  const failures: string[] = [];
  for (const [userId, info] of byUser) {
    // 연락처: 이 회원의 가장 최근 주문에서
    const { data: ord } = await admin
      .from("orders")
      .select("customer_phone, customer_name, shipping_address")
      .eq("user_id", userId)
      .not("customer_phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        customer_phone: string | null;
        customer_name: string | null;
        shipping_address: { phone?: string; recipient?: string } | null;
      }>();
    const to = normalizePhone(ord?.shipping_address?.phone ?? ord?.customer_phone);

    if (to) {
      const r = await sendPointsExpiryNotice({
        to,
        name: ord?.shipping_address?.recipient ?? ord?.customer_name ?? null,
        amount: info.total,
        expiresAt: info.earliest,
      });
      if (!r.ok) {
        failures.push(`${userId.slice(0, 8)}: ${r.error}`);
        continue; // 발송 실패 시 표시하지 않아 다음 날 재시도된다.
      }
      sent += 1;
    }
    // 연락처가 없으면 보낼 수 없으므로 표시만 하고 넘어간다.
    await admin
      .from("points")
      .update({ expiry_notified_at: new Date().toISOString() })
      .in("id", info.lots);
  }

  return Response.json({ users: byUser.size, sent, failures: failures.slice(0, 10) });
}
