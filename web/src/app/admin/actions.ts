"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone, sendShippingNotice } from "@/lib/notify";

/** Enter a tracking number → 배송중 (dispatched / in transit). */
export async function markShipped(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tracking = String(formData.get("tracking") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({
      status: "shipped",
      tracking_number: tracking || null,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Move an order to 'preparing' (배송준비중 — 발주/포장 단계, 송장 전). */
export async function markPreparing(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status: "preparing" }).eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Move ALL paid orders to 배송준비중 in one go (pre-order batch fulfillment). */
export async function bulkPrepareAll() {
  const admin = createAdminClient();
  await admin.from("orders").update({ status: "preparing" }).eq("status", "paid");
  revalidatePath("/admin");
}

/** Confirm delivery → 배송완료. */
export async function markDelivered(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/**
 * Admin payment cancellation / refund. Unlike the customer flow (paid-only,
 * ownership-checked), admin can cancel any order that still has a live Toss
 * payment — paid through delivered. Voids the full amount at Toss, then marks
 * the order canceled. Returns a result for inline success/error display.
 */
export async function cancelOrder(
  _prev: { ok: boolean; error?: string; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; error?: string; message?: string }> {
  const id = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { ok: false, error: "주문 ID가 없습니다." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, status, payment_key")
    .eq("id", id)
    .single<{ id: string; status: string; payment_key: string | null }>();

  if (!order) return { ok: false, error: "주문을 찾을 수 없습니다." };
  if (order.status === "canceled" || order.status === "refunded")
    return { ok: true, message: "이미 취소된 주문입니다." };
  if (!order.payment_key)
    return { ok: false, error: "결제 정보가 없어 취소할 수 없습니다 (미결제 주문)." };

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[admin/cancel] TOSS_SECRET_KEY is not set");
    return { ok: false, error: "서버 설정 오류 (TOSS_SECRET_KEY 없음)." };
  }

  // Cancel the full amount at Toss. Basic auth = base64("<secretKey>:").
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  let payment: { message?: string; code?: string } = {};
  try {
    const tossRes = await fetch(
      `https://api.tosspayments.com/v1/payments/${order.payment_key}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cancelReason: reason || "관리자 취소" }),
      },
    );
    payment = await tossRes.json();
    if (!tossRes.ok) {
      return { ok: false, error: payment?.message ?? "토스 결제 취소에 실패했습니다." };
    }
  } catch (e) {
    console.error("[admin/cancel] Toss request failed:", e);
    return { ok: false, error: "토스 요청 중 오류가 발생했습니다." };
  }

  const { error: updErr } = await admin
    .from("orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      raw_cancel: payment,
    })
    .eq("id", order.id);
  if (updErr) {
    console.error("[admin/cancel] order update failed:", updErr.message);
    return {
      ok: false,
      error: "토스 취소는 완료됐지만 주문 상태 갱신에 실패했습니다. 상태를 직접 확인하세요.",
    };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order.id}`);
  return { ok: true, message: "결제가 취소되었습니다." };
}

/**
 * Bulk tracking registration. Paste one order per line:
 *   "glo_1781... 1234567890"  (order_id and tracking separated by space/comma/tab)
 * Each matched order is moved to 배송중 with its tracking number.
 */
export async function bulkTracking(formData: FormData) {
  const raw = String(formData.get("bulk") ?? "");
  const carrier = String(formData.get("carrier") ?? "").trim() || null;
  const notify = formData.get("notify") === "on";
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const rows = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[\s,\t]+/))
    .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
    .map(([orderId, tracking]) => ({ orderId, tracking }));

  for (const { orderId, tracking } of rows) {
    const { data } = await admin
      .from("orders")
      .update({
        status: "shipped",
        tracking_number: tracking,
        carrier,
        shipped_at: now,
      })
      .eq("order_id", orderId)
      .select("order_id, customer_name, customer_phone, shipping_address")
      .maybeSingle<{
        order_id: string;
        customer_name: string | null;
        customer_phone: string | null;
        shipping_address: { recipient?: string; phone?: string } | null;
      }>();

    if (!notify || !data) continue;

    // 수령인 연락처를 우선한다 (주문자와 받는 사람이 다를 수 있음).
    const to = normalizePhone(data.shipping_address?.phone ?? data.customer_phone);
    if (!to) {
      await admin.from("notifications").insert({
        order_id: orderId,
        kind: "shipped",
        channel: "lms",
        status: "failed",
        error: "연락처 없음 또는 형식 오류",
      });
      continue;
    }

    const r = await sendShippingNotice({
      to,
      orderId,
      name: data.shipping_address?.recipient ?? data.customer_name,
      carrier,
      trackingNumber: tracking,
    });

    await admin.from("notifications").insert({
      order_id: orderId,
      kind: "shipped",
      channel: r.channel,
      to_phone: to,
      status: r.ok ? "sent" : "failed",
      provider_message_id: r.messageId ?? null,
      error: r.error ?? null,
    });
    if (r.ok) {
      await admin
        .from("orders")
        .update({ shipping_notified_at: new Date().toISOString() })
        .eq("order_id", orderId);
    }
  }

  revalidatePath("/admin");
}

/**
 * 발송 문자가 실패한 주문에 다시 보낸다.
 * (배송중 + 송장번호 있음 + 아직 알림 성공 기록 없음)
 *
 * 한 번에 25건씩만 처리한다 — 서버리스 함수 실행 시간 제한 때문이며,
 * 남은 건이 있으면 버튼을 다시 누르면 된다.
 */
export async function resendFailedNotices() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("order_id, carrier, tracking_number, customer_name, customer_phone, shipping_address")
    .eq("status", "shipped")
    .not("tracking_number", "is", null)
    .is("shipping_notified_at", null)
    .limit(25)
    .returns<
      {
        order_id: string;
        carrier: string | null;
        tracking_number: string;
        customer_name: string | null;
        customer_phone: string | null;
        shipping_address: { recipient?: string; phone?: string } | null;
      }[]
    >();

  // 소량씩 병렬로 — 순차로 돌리면 25건에서도 함수 시간 제한에 걸린다.
  const CONCURRENCY = 5;
  const rows = data ?? [];
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(
      rows.slice(i, i + CONCURRENCY).map(async (o) => {
        const to = normalizePhone(o.shipping_address?.phone ?? o.customer_phone);
        if (!to) {
          await admin.from("notifications").insert({
            order_id: o.order_id,
            kind: "shipped",
            channel: "lms",
            status: "failed",
            error: "연락처 없음 또는 형식 오류",
          });
          return;
        }
        const r = await sendShippingNotice({
          to,
          orderId: o.order_id,
          name: o.shipping_address?.recipient ?? o.customer_name,
          carrier: o.carrier,
          trackingNumber: o.tracking_number,
        });
        await admin.from("notifications").insert({
          order_id: o.order_id,
          kind: "shipped",
          channel: r.channel,
          to_phone: to,
          status: r.ok ? "sent" : "failed",
          provider_message_id: r.messageId ?? null,
          error: r.error ?? null,
        });
        if (r.ok) {
          await admin
            .from("orders")
            .update({ shipping_notified_at: new Date().toISOString() })
            .eq("order_id", o.order_id);
        }
      }),
    );
  }

  revalidatePath("/admin");
}
