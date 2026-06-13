import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  PRODUCT,
  orderName,
  generateOrderId,
} from "@/lib/product";

/**
 * Create a pending order before launching the Toss payment widget.
 * The amount is computed SERVER-SIDE from the trusted product price —
 * never trust an amount sent by the client.
 */
export async function POST(request: Request) {
  let body: {
    quantity?: number;
    customerName?: string;
    customerEmail?: string;
    customerPhone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const quantity = Math.max(1, Math.min(10, Math.floor(body.quantity ?? 1)));
  const amount = PRODUCT.price * quantity;
  const order_id = generateOrderId();

  // Attach the order to the logged-in user, if any (guest checkout allowed).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { error } = await admin.from("orders").insert({
    order_id,
    user_id: user?.id ?? null,
    status: "pending",
    product_code: PRODUCT.code,
    quantity,
    amount,
    order_name: orderName(quantity),
    customer_name: body.customerName ?? null,
    customer_email: body.customerEmail ?? user?.email ?? null,
    customer_phone: body.customerPhone ?? null,
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
    orderName: orderName(quantity),
  });
}
