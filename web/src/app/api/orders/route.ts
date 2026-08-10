import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT, getOption, generateOrderId } from "@/lib/product";
import { parseRoundOptions } from "@/lib/groupbuy";
import { pointBalance } from "@/lib/points";

/**
 * Create a pending order before launching the Toss payment widget.
 * The amount is computed SERVER-SIDE from the trusted product price —
 * never trust an amount sent by the client.
 */
export async function POST(request: Request) {
  let body: {
    option?: string;
    round?: string;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
    shippingAddress?: {
      recipient?: string;
      phone?: string;
      postcode?: string;
      address?: string;
      detail?: string;
      memo?: string;
    };
    usePoints?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const order_id = generateOrderId();

  // Attach the order to the logged-in user, if any (guest checkout allowed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // 가격·수량은 신뢰 테이블에서만 — 일반 주문은 product.ts OPTIONS,
  // 공구·협찬 주문은 승인된 회차의 전용 옵션(groupbuy_rounds.options).
  let opt: { key: string; months: number; label: string; price: number };
  let roundId: string | null = null;
  let sellerHandle: string | null = null;

  if (body.round) {
    const handle = String(body.round).toLowerCase();
    const { data: round, error: roundError } = await admin
      .from("groupbuy_rounds")
      .select("id, handle, status, starts_at, ends_at, options")
      .eq("handle", handle)
      .maybeSingle();

    const now = Date.now();
    const live =
      round &&
      round.status === "approved" &&
      round.starts_at &&
      round.ends_at &&
      now >= Date.parse(round.starts_at) &&
      now < Date.parse(round.ends_at);
    if (roundError || !live) {
      // 핸들 조작·기간 종료 — 공구가로 결제되지 않도록 명시적으로 거절한다.
      return NextResponse.json(
        { error: "진행 중인 프로모션이 아닙니다. 일반 구매로 진행해주세요." },
        { status: 400 },
      );
    }
    const options = parseRoundOptions(round.options);
    const ropt = options?.find((o) => o.key === body.option);
    if (!ropt) {
      return NextResponse.json({ error: "선택한 구성을 찾을 수 없습니다." }, { status: 400 });
    }
    // 공구 주문은 포인트 사용 불가 (적립도 없음 — 리뷰 포인트는 별도 경로라 유지).
    if (Math.floor(Number(body.usePoints) || 0) > 0) {
      return NextResponse.json(
        { error: "프로모션 주문에는 포인트를 사용할 수 없습니다." },
        { status: 400 },
      );
    }
    opt = ropt;
    roundId = round.id;
    sellerHandle = round.handle;
  } else {
    opt = getOption(body.option);
  }

  // 포인트 사용 — 잔액은 서버에서 검증하고, 실제 차감은 결제 승인 시점에 한다.
  // 토스 최소 결제금액(100원)을 남겨야 하므로 상품가 - 100 까지만 쓸 수 있다.
  let usePoints = roundId ? 0 : Math.max(0, Math.floor(Number(body.usePoints) || 0));
  if (usePoints > 0) {
    if (!user)
      return NextResponse.json({ error: "포인트는 로그인 후 사용할 수 있습니다." }, { status: 401 });
    const balance = await pointBalance(admin, user.id);
    if (usePoints > balance)
      return NextResponse.json({ error: "보유 포인트가 부족합니다." }, { status: 400 });
    usePoints = Math.min(usePoints, opt.price - 100);
  }
  const amount = opt.price - usePoints;
  const { error } = await admin.from("orders").insert({
    order_id,
    user_id: user?.id ?? null,
    status: "pending",
    product_code: PRODUCT.code,
    quantity: opt.months,
    amount,
    used_points: usePoints,
    order_name: `${PRODUCT.name} ${opt.label}`,
    round_id: roundId,
    seller_handle: sellerHandle,
    customer_name: body.customerName ?? null,
    customer_email: body.customerEmail ?? user?.email ?? null,
    customer_phone: body.customerPhone ?? null,
    shipping_address: body.shippingAddress ?? null,
  });

  if (error) {
    console.error("[orders] insert failed:", error.message);
    return NextResponse.json(
      { error: "주문 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    orderId: order_id,
    amount,
    orderName: `${PRODUCT.name} ${opt.label}`,
  });
}
