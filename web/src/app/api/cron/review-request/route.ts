import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, sendReviewRequest } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AFTER_DAYS = 7;

/**
 * 배송완료 7일이 지난 주문에 리뷰 요청 문자를 1회 발송한다.
 * Vercel Cron이 매일 호출(vercel.json). review_requested_at으로 중복 발송을 막는다.
 * 이미 리뷰를 쓴 주문은 건너뛴다.
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
  const cutoff = new Date(Date.now() - AFTER_DAYS * 86400000).toISOString();

  const { data, error } = await admin
    .from("orders")
    .select("order_id, customer_name, customer_phone, shipping_address")
    .eq("status", "delivered")
    .lte("delivered_at", cutoff)
    .is("review_requested_at", null)
    .limit(100)
    .returns<
      {
        order_id: string;
        customer_name: string | null;
        customer_phone: string | null;
        shipping_address: { recipient?: string; phone?: string } | null;
      }[]
    >();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const orders = data ?? [];
  let sent = 0;
  let skipped = 0;
  const failures: Array<{ order_id: string; error: string }> = [];

  for (const o of orders) {
    // 이미 리뷰를 쓴 주문은 요청하지 않는다 (요청됨으로 표시해 다음번에도 제외).
    const { data: existing } = await admin
      .from("reviews")
      .select("id")
      .eq("order_id", o.order_id)
      .maybeSingle();
    if (existing) {
      await admin
        .from("orders")
        .update({ review_requested_at: new Date().toISOString() })
        .eq("order_id", o.order_id);
      skipped += 1;
      continue;
    }

    const to = normalizePhone(o.shipping_address?.phone ?? o.customer_phone);
    if (!to) {
      await admin
        .from("orders")
        .update({ review_requested_at: new Date().toISOString() })
        .eq("order_id", o.order_id);
      failures.push({ order_id: o.order_id, error: "연락처 없음" });
      continue;
    }

    const r = await sendReviewRequest({
      to,
      name: o.shipping_address?.recipient ?? o.customer_name,
    });
    await admin.from("notifications").insert({
      order_id: o.order_id,
      kind: "review_request",
      channel: r.channel,
      to_phone: to,
      status: r.ok ? "sent" : "failed",
      provider_message_id: r.messageId ?? null,
      error: r.error ?? null,
    });
    if (r.ok) {
      sent += 1;
      await admin
        .from("orders")
        .update({ review_requested_at: new Date().toISOString() })
        .eq("order_id", o.order_id);
    } else {
      failures.push({ order_id: o.order_id, error: r.error ?? "발송 실패" });
    }
  }

  return Response.json({ checked: orders.length, sent, skipped, failures: failures.slice(0, 20) });
}
