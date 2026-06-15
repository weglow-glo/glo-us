import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PRODUCT, getOption, orderNameOf, generateOrderId } from "@/lib/product";

/**
 * Create a pending order before launching the Toss payment widget.
 * The amount is computed SERVER-SIDE from the trusted product price —
 * never trust an amount sent by the client.
 */
export async function POST(request: Request) {
  let body: {
    option?: string;
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
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Price + quantity come from the trusted option table, not the client.
  const opt = getOption(body.option);
  const amount = opt.price;
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
    quantity: opt.months,
    amount,
    order_name: orderNameOf(opt),
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
    orderName: orderNameOf(opt),
  });
}
