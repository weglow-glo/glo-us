import { createAdminClient } from "@/lib/supabase/admin";
import { fetchTracking } from "@/lib/sweettracker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 배송중 주문을 스마트택배로 조회해 배송완료면 상태를 자동 전환한다.
 * Vercel Cron이 주기적으로 호출하며(vercel.json), 관리자가 손으로 확인할 필요가 없다.
 *
 * 인증: Vercel Cron은 Authorization: Bearer <CRON_SECRET> 를 붙여 호출한다.
 * CRON_SECRET이 설정돼 있으면 일치하는 요청만 받는다.
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
  const { data, error } = await admin
    .from("orders")
    .select("order_id, carrier, tracking_number")
    .eq("status", "shipped")
    .not("tracking_number", "is", null)
    .limit(200)
    .returns<{ order_id: string; carrier: string | null; tracking_number: string }[]>();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const orders = data ?? [];
  let delivered = 0;
  const failures: Array<{ order_id: string; error: string }> = [];

  for (const o of orders) {
    const t = await fetchTracking(o.carrier, o.tracking_number);
    if (!t.found) {
      // 아직 택배사에 집화 전이면 흔히 조회가 안 된다. 오류로 취급하지 않는다.
      if (t.error) failures.push({ order_id: o.order_id, error: t.error });
      continue;
    }
    if (!t.delivered) continue;

    await admin
      .from("orders")
      .update({
        status: "delivered",
        delivered_at: (t.deliveredAt ?? new Date()).toISOString(),
      })
      .eq("order_id", o.order_id);
    delivered += 1;
  }

  return Response.json({
    checked: orders.length,
    delivered,
    failures: failures.slice(0, 20),
  });
}
