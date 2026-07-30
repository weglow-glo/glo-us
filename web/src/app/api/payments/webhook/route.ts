import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderConfirmation } from "@/lib/email";
import { sendMetaPurchase } from "@/lib/meta-capi";
import { grantPoints } from "@/lib/points";

/**
 * 토스페이먼츠 웹훅 — 가상계좌 입금 확정용.
 *
 * 가상계좌는 발급 시점의 승인 응답이 WAITING_FOR_DEPOSIT 이고, 실제 입금은
 * 이 웹훅(DEPOSIT_CALLBACK / 상태 변경)으로 뒤늦게 통보된다. 콜백 본문은
 * 신뢰하지 않는다 — orderId 만 받아 토스 API 에서 결제 상태를 직접 재조회해
 * 그 결과로만 상태를 바꾼다 (위조 콜백 방어).
 *
 * 토스 개발자센터 → 웹훅에 등록할 URL:
 *   https://www.glo-us.com/api/payments/webhook
 */
export async function POST(request: Request) {
  let body: { orderId?: string; secret?: string; status?: string; data?: { orderId?: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // DEPOSIT_CALLBACK 은 최상위 orderId, 일반 웹훅(v2)은 data.orderId 에 온다.
  const orderId = body?.orderId ?? body?.data?.orderId;
  if (!orderId) return NextResponse.json({ ok: false }, { status: 400 });

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[webhook] TOSS_SECRET_KEY is not set");
    // 200 이 아니면 토스가 재시도한다 — 설정 오류는 재시도해도 소용없지만
    // 알림 목적으로 500 을 남긴다.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_id, status, amount, order_name, customer_name, customer_email, customer_phone, user_id, used_points, raw_payment, payment_key",
    )
    .eq("order_id", orderId)
    .maybeSingle<{
      id: string;
      order_id: string;
      status: string;
      amount: number;
      order_name: string;
      customer_name: string | null;
      customer_email: string | null;
      customer_phone: string | null;
      user_id: string | null;
      used_points: number | null;
      raw_payment: { secret?: string } | null;
      payment_key: string | null;
    }>();

  // 모르는 주문이어도 200 — 토스 재시도 폭주 방지.
  if (!order) return NextResponse.json({ ok: true, ignored: true });

  // 콜백 secret 이 오면 발급 시 저장해둔 값과 대조 (1차 검증).
  if (body.secret && order.raw_payment?.secret && body.secret !== order.raw_payment.secret) {
    console.error("[webhook] secret mismatch for", orderId);
    return NextResponse.json({ ok: true, ignored: true });
  }

  // ★ 확정 검증: 토스 API 에서 결제 상태를 직접 재조회.
  // (orderId 조회 엔드포인트는 이 상점에서 NOT_FOUND_MERCHANT 를 반환해
  //  발급 시 저장해둔 paymentKey 로 조회한다.)
  if (!order.payment_key) return NextResponse.json({ ok: true, ignored: true });
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const res = await fetch(
    `https://api.tosspayments.com/v1/payments/${encodeURIComponent(order.payment_key)}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) {
    console.error("[webhook] Toss lookup failed for", orderId, res.status);
    return NextResponse.json({ ok: false }, { status: 502 }); // 토스가 재시도
  }
  const payment = (await res.json()) as {
    status?: string;
    method?: string;
    approvedAt?: string;
    [k: string]: unknown;
  };

  // 입금 완료 → paid (입금대기 상태였던 주문만 승격)
  if (payment.status === "DONE" && order.status === "awaiting_deposit") {
    const { error } = await admin
      .from("orders")
      .update({
        status: "paid",
        payment_method: payment.method ?? null,
        approved_at: payment.approvedAt ?? new Date().toISOString(),
        raw_payment: payment,
      })
      .eq("id", order.id)
      .eq("status", "awaiting_deposit"); // 경합 방지
    if (error) {
      console.error("[webhook] paid update failed:", error.message);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    // 결제 확정 부수효과 (best-effort) — confirm 라우트의 paid 경로와 동일 취지.
    void sendMetaPurchase({
      eventId: order.order_id,
      value: order.amount,
      currency: "KRW",
      email: order.customer_email,
      phone: order.customer_phone,
      externalId: order.user_id,
      fbp: null,
      fbc: null,
      clientIp: null,
      userAgent: null,
      sourceUrl: null,
    });
    if (order.customer_email) {
      void sendOrderConfirmation({
        to: order.customer_email,
        orderId: order.order_id,
        orderName: order.order_name,
        amount: order.amount,
        customerName: order.customer_name,
        approvedAt: payment.approvedAt,
      }).catch((e) => console.error("[webhook] email dispatch error:", e));
    }
    return NextResponse.json({ ok: true, paid: true });
  }

  // 입금 없이 종료(계좌 만료·취소) → failed + 선차감 포인트 복원
  const TERMINAL = ["CANCELED", "PARTIAL_CANCELED", "ABORTED", "EXPIRED"];
  if (
    order.status === "awaiting_deposit" &&
    payment.status &&
    TERMINAL.includes(payment.status)
  ) {
    const { error } = await admin
      .from("orders")
      .update({ status: "failed", raw_payment: payment })
      .eq("id", order.id)
      .eq("status", "awaiting_deposit");
    if (!error && (order.used_points ?? 0) > 0 && order.user_id) {
      await grantPoints(admin, {
        userId: order.user_id,
        delta: order.used_points as number,
        reason: "order_use_revert",
        refId: order.order_id,
      });
    }
    return NextResponse.json({ ok: true, expired: true });
  }

  return NextResponse.json({ ok: true, noop: true });
}
