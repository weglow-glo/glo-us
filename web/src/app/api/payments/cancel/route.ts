import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleRefundPoints } from "@/lib/points";
import { isCancelable } from "@/lib/order-status";

/**
 * Customer-initiated payment cancellation.
 * Allowed only while the order is still `paid` (before fulfillment begins).
 * Verifies ownership via the user-scoped client (RLS), cancels at Toss with
 * the SECRET key, then marks the order canceled with the admin client.
 */
export async function POST(request: Request) {
  let body: { orderId?: string; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderId = body.orderId;
  if (!orderId) {
    return NextResponse.json({ error: "orderId는 필수입니다." }, { status: 400 });
  }

  // 1) Auth — must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  // 2) Ownership + state — RLS (orders_select_own) returns the row only if it's
  //    this user's order.
  const { data: order } = await supabase
    .from("orders")
    .select("id, status, payment_key, user_id, used_points")
    .eq("order_id", orderId)
    .single<{
      id: string;
      status: string;
      payment_key: string | null;
      user_id: string | null;
      used_points: number | null;
    }>();

  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }
  if (order.status === "canceled") {
    return NextResponse.json({ ok: true, alreadyCanceled: true });
  }
  if (!isCancelable(order.status)) {
    return NextResponse.json(
      { error: "배송 준비가 시작된 주문은 취소할 수 없습니다. 고객센터로 문의해주세요." },
      { status: 409 },
    );
  }
  if (!order.payment_key) {
    return NextResponse.json(
      { error: "결제 정보를 찾을 수 없어 취소할 수 없습니다." },
      { status: 400 },
    );
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    console.error("[cancel] TOSS_SECRET_KEY is not set");
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 });
  }

  // 3) Cancel at Toss. Basic auth = base64("<secretKey>:").
  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const tossRes = await fetch(
    `https://api.tosspayments.com/v1/payments/${order.payment_key}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cancelReason: body.reason?.trim() || "고객 요청" }),
    },
  );
  const payment = await tossRes.json();

  if (!tossRes.ok) {
    return NextResponse.json(
      { error: payment?.message ?? "결제 취소에 실패했습니다.", code: payment?.code },
      { status: 400 },
    );
  }

  // 4) Mark canceled (admin client — users have no update policy).
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("orders")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      raw_cancel: payment,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("[cancel] order update failed:", updateError.message);
    return NextResponse.json(
      { error: "취소는 처리됐지만 주문 기록 갱신에 실패했습니다. 고객센터로 문의해주세요." },
      { status: 500 },
    );
  }

  // 포인트 정산 — 사용분 복원 + 이 주문 리뷰 적립분 회수 (베스트에포트)
  await settleRefundPoints(admin, {
    order_id: orderId,
    user_id: order.user_id,
    used_points: order.used_points,
  });

  return NextResponse.json({ ok: true });
}
