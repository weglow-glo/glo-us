import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderConfirmation } from "@/lib/email";

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
      "id, amount, status, order_name, customer_name, customer_email, user_id, shipping_address",
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
  if (order.amount !== amount) {
    return NextResponse.json(
      { error: "결제 금액이 주문 금액과 일치하지 않습니다." },
      { status: 400 },
    );
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
