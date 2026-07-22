import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 포인트 공용 헬퍼 (정책: docs/points-policy.md)
 * 적립 로트: delta>0 행 (remaining 잔량, expires_at 만료일 = 지급일 + 6개월)
 * 사용/회수: delta<0 행 (이력용). 차감은 DB 함수 use_points가 FIFO로 처리.
 */

export const POINT_VALID_MONTHS = 6;

/** 적립 (로트 생성). (ref_id, reason) 유니크로 중복 지급이 차단된다. */
export async function grantPoints(
  admin: SupabaseClient,
  opts: { userId: string; delta: number; reason: string; refId: string },
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const expires = new Date();
  expires.setMonth(expires.getMonth() + POINT_VALID_MONTHS);
  const { error } = await admin.from("points").insert({
    user_id: opts.userId,
    delta: opts.delta,
    remaining: opts.delta,
    reason: opts.reason,
    ref_id: opts.refId,
    expires_at: expires.toISOString(),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, duplicate: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** 사용 가능 잔액 (만료 제외). */
export async function pointBalance(
  admin: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await admin
    .from("points")
    .select("remaining")
    .eq("user_id", userId)
    .gt("delta", 0)
    .gt("remaining", 0)
    .gt("expires_at", new Date().toISOString());
  return (data ?? []).reduce((s, r) => s + (r.remaining ?? 0), 0);
}

/** FIFO 차감. 잔액 부족이면 { ok:false, insufficient:true }. */
export async function usePoints(
  admin: SupabaseClient,
  opts: { userId: string; amount: number; refId: string; reason?: string },
): Promise<{ ok: boolean; insufficient?: boolean; error?: string }> {
  const { error } = await admin.rpc("use_points", {
    p_user: opts.userId,
    p_amount: opts.amount,
    p_ref: opts.refId,
    p_reason: opts.reason ?? "order_use",
  });
  if (error) {
    if (error.message.includes("insufficient_points"))
      return { ok: false, insufficient: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * 환불·취소 시 포인트 정산:
 *  1) 주문에 쓴 포인트 복원 (새 로트, 복원일 + 6개월)
 *  2) 그 주문으로 작성된 리뷰의 적립 포인트를 잔액 내에서 회수
 * 중복 호출은 (ref_id, reason) 유니크가 막는다. 실패해도 던지지 않는다(베스트에포트).
 */
export async function settleRefundPoints(
  admin: SupabaseClient,
  order: { order_id: string; user_id: string | null; used_points: number | null },
): Promise<void> {
  if (!order.user_id) return;

  // 1) 사용분 복원
  if ((order.used_points ?? 0) > 0) {
    const r = await grantPoints(admin, {
      userId: order.user_id,
      delta: order.used_points!,
      reason: "order_refund_restore",
      refId: order.order_id,
    });
    if (!r.ok && !r.duplicate)
      console.error("[points] refund restore failed:", order.order_id, r.error);
  }

  // 2) 리뷰 적립분 회수 (잔액 내에서만 — 마이너스 없음)
  try {
    const { data: review } = await admin
      .from("reviews")
      .select("id")
      .eq("order_id", order.order_id)
      .maybeSingle<{ id: string }>();
    if (!review) return;

    const { data: grants } = await admin
      .from("points")
      .select("delta")
      .eq("ref_id", review.id)
      .gt("delta", 0)
      .in("reason", ["review_text", "review_media"]);
    const granted = (grants ?? []).reduce((s, r) => s + r.delta, 0);
    if (granted <= 0) return;

    const balance = await pointBalance(admin, order.user_id);
    const clawback = Math.min(granted, balance);
    if (clawback <= 0) return;

    const r = await usePoints(admin, {
      userId: order.user_id,
      amount: clawback,
      refId: order.order_id,
      reason: "review_clawback",
    });
    if (!r.ok && !r.insufficient)
      console.error("[points] clawback failed:", order.order_id, r.error);
  } catch (e) {
    console.error("[points] clawback error:", e);
  }
}
