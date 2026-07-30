import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderConfirmation } from "@/lib/email";
import { sendMetaPurchase } from "@/lib/meta-capi";
import { usePoints, grantPoints } from "@/lib/points";

const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

/**
 * Confirm a Toss payment server-side.
 * Flow: widget redirects to /checkout/success with { paymentKey, orderId, amount }
 *  → this route verifies the amount against the stored pending order
 *  → calls Toss confirm with the SECRET key
 *  → marks the order paid.
 */
export async function POST(request: Request) {
  let body: { paymentKey?: string; orderId?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { paymentKey, orderId, amount } = body;
  if (!paymentKey || !orderId || typeof amount !== "number") {
    return NextResponse.json(
      { error: "paymentKey, orderId, amount는 필수입니다." },
      { status: 400 },
    );
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[confirm] TOSS_SECRET_KEY is not set");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  const admin = createAdminClient();

  // 1) Look up the pending order and verify the amount matches what we stored.
  const { data: order, error: lookupError } = await admin
    .from("orders")
    .select(
      "id, amount, status, order_name, customer_name, customer_email, customer_phone, user_id, shipping_address, used_points, raw_payment",
    )
    .eq("order_id", orderId)
    .single();

  if (lookupError || !order) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (order.status === "paid") {
    // Idempotent: already confirmed (e.g. user refreshed success page).
    return NextResponse.json({ ok: true, alreadyPaid: true });
  }
  if (order.status === "awaiting_deposit") {
    // 가상계좌 발급 후 success 페이지 새로고침 — 토스 재승인 없이 안내만 반복.
    const rp = (order as unknown as { raw_payment?: { virtualAccount?: unknown; orderName?: string; totalAmount?: number } }).raw_payment;
    return NextResponse.json({
      ok: true,
      awaitingDeposit: true,
      orderId,
      virtualAccount: rp?.virtualAccount ?? null,
      orderName: order.order_name,
      totalAmount: order.amount,
    });
  }
  if (order.amount !== amount) {
    return NextResponse.json(
      { error: "결제 금액이 주문 금액과 일치하지 않습니다." },
      { status: 400 },
    );
  }

  // 1.5) 포인트를 먼저 차감한다 (FIFO, 원자적). 잔액이 그 사이 소진됐으면 승인 전에
  //      중단하고, 토스 승인이 실패하면 아래에서 되돌린다.
  const usedPoints = (order.used_points as number | null) ?? 0;
  if (usedPoints > 0 && order.user_id) {
    const pu = await usePoints(admin, {
      userId: order.user_id,
      amount: usedPoints,
      refId: orderId,
      reason: "order_use",
    });
    if (!pu.ok) {
      return NextResponse.json(
        {
          error: pu.insufficient
            ? "포인트 잔액이 부족합니다. 처음부터 다시 시도해주세요."
            : "포인트 처리에 실패했습니다. 다시 시도해주세요.",
        },
        { status: 400 },
      );
    }
  }

  // 2) Confirm with Toss. Basic auth = base64("<secretKey>:").
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const tossRes = await fetch(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const payment = await tossRes.json();

  if (!tossRes.ok) {
    // 승인 실패 → 먼저 차감한 포인트를 복원한다.
    if (usedPoints > 0 && order.user_id) {
      await grantPoints(admin, {
        userId: order.user_id,
        delta: usedPoints,
        reason: "order_use_revert",
        refId: orderId,
      });
    }
    // Toss returns { code, message } on failure.
    await admin
      .from("orders")
      .update({ status: "failed", raw_payment: payment })
      .eq("id", order.id);
    return NextResponse.json(
      { error: payment?.message ?? "결제 승인에 실패했습니다.", code: payment?.code },
      { status: 400 },
    );
  }

  // 2.5) ★ 가상계좌: 승인 응답이 성공이어도 status=WAITING_FOR_DEPOSIT 이면
  //     입금 전이다. paid 로 마킹하면 무입금 출고 사고가 난다 — awaiting_deposit
  //     으로 저장하고, 입금 완료는 토스 웹훅(/api/payments/webhook)이 확정한다.
  if (payment?.status === "WAITING_FOR_DEPOSIT") {
    const { error: waitErr } = await admin
      .from("orders")
      .update({
        status: "awaiting_deposit",
        payment_key: paymentKey,
        payment_method: payment?.method ?? null,
        raw_payment: payment,
      })
      .eq("id", order.id);
    if (waitErr) {
      console.error("[confirm] awaiting_deposit update failed:", waitErr.message);
      return NextResponse.json(
        { error: "가상계좌 발급은 완료됐지만 주문 기록에 실패했습니다. 고객센터로 문의해주세요." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      awaitingDeposit: true,
      orderId,
      orderName: payment?.orderName,
      method: payment?.method,
      totalAmount: payment?.totalAmount,
      virtualAccount: payment?.virtualAccount ?? null,
    });
  }
  if (payment?.status !== "DONE") {
    // 예상 밖 상태 — 결제 완료로 취급하지 않는다.
    if (usedPoints > 0 && order.user_id) {
      await grantPoints(admin, {
        userId: order.user_id,
        delta: usedPoints,
        reason: "order_use_revert",
        refId: orderId,
      });
    }
    await admin
      .from("orders")
      .update({ status: "failed", raw_payment: payment })
      .eq("id", order.id);
    return NextResponse.json(
      { error: `결제가 완료되지 않았습니다 (상태: ${payment?.status ?? "알 수 없음"}).` },
      { status: 400 },
    );
  }

  // 3) Mark the order paid.
  const { error: updateError } = await admin
    .from("orders")
    .update({
      status: "paid",
      payment_key: paymentKey,
      payment_method: payment?.method ?? null,
      approved_at: payment?.approvedAt ?? new Date().toISOString(),
      raw_payment: payment,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("[confirm] order update failed:", updateError.message);
    // Payment succeeded at Toss but our DB write failed — surface clearly.
    return NextResponse.json(
      { error: "결제는 완료됐지만 주문 기록에 실패했습니다. 고객센터로 문의해주세요." },
      { status: 500 },
    );
  }

  // Best-effort: remember this address in the user's address book for next time.
  // De-duped on the core fields; the first saved address becomes the default.
  const sa = order.shipping_address as {
    recipient?: string;
    phone?: string;
    postcode?: string;
    address?: string;
    detail?: string;
    memo?: string;
  } | null;
  if (order.user_id && sa?.recipient && sa?.address) {
    try {
      const { data: existing } = await admin
        .from("shipping_addresses")
        .select("id")
        .eq("user_id", order.user_id)
        .eq("recipient", sa.recipient)
        .eq("phone", sa.phone ?? "")
        .eq("address", sa.address)
        .eq("detail", sa.detail ?? "")
        .limit(1);

      if (!existing || existing.length === 0) {
        const { count } = await admin
          .from("shipping_addresses")
          .select("id", { count: "exact", head: true })
          .eq("user_id", order.user_id);
        await admin.from("shipping_addresses").insert({
          user_id: order.user_id,
          recipient: sa.recipient,
          phone: sa.phone ?? "",
          postcode: sa.postcode ?? null,
          address: sa.address,
          detail: sa.detail ?? null,
          memo: sa.memo ?? null,
          is_default: (count ?? 0) === 0,
        });
      }
    } catch (e) {
      console.error("[confirm] address-book save failed:", e);
    }
  }

  // Best-effort: Meta Conversions API Purchase (deduped with the browser pixel
  // via event_id = orderId). Pull fbp/fbc cookies + IP/UA for better matching.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const readCookie = (name: string) =>
    cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;
  void sendMetaPurchase({
    eventId: orderId,
    value: order.amount,
    currency: "KRW",
    email: order.customer_email,
    phone: order.customer_phone,
    externalId: order.user_id,
    fbp: readCookie("_fbp"),
    fbc: readCookie("_fbc"),
    clientIp:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request.headers.get("user-agent"),
    sourceUrl: request.headers.get("referer"),
  });

  // Best-effort order confirmation email — never block/fail the response on it.
  const emailTo = order.customer_email ?? payment?.receipt?.email ?? null;
  if (emailTo) {
    void sendOrderConfirmation({
      to: emailTo,
      orderId,
      orderName: order.order_name,
      amount: order.amount,
      customerName: order.customer_name,
      approvedAt: payment?.approvedAt,
    }).catch((e) => console.error("[confirm] email dispatch error:", e));
  }

  return NextResponse.json({
    ok: true,
    orderId,
    orderName: payment?.orderName,
    method: payment?.method,
    totalAmount: payment?.totalAmount,
    approvedAt: payment?.approvedAt,
  });
}
