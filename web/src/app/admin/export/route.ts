import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Row = {
  order_id: string;
  created_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  product_code: string;
  quantity: number;
  amount: number;
  payment_method: string | null;
  tracking_number: string | null;
  shipping_address: Record<string, string> | null;
};

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const admin = createAdminClient();
  const base = admin
    .from("orders")
    .select(
      "order_id, created_at, status, customer_name, customer_email, customer_phone, product_code, quantity, amount, payment_method, tracking_number, shipping_address",
    );
  const filtered = status ? base.eq("status", status) : base;
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<Row[]>();
  if (error) {
    return new Response(`error: ${error.message}`, { status: 500 });
  }

  const headers = [
    "주문번호", "주문일시", "상태", "수령인", "연락처", "이메일",
    "우편번호", "주소", "상세주소", "배송메모", "상품", "수량", "금액(원)",
    "결제수단", "송장번호",
  ];
  const lines = [headers.join(",")];
  for (const o of data ?? []) {
    const sa = o.shipping_address ?? {};
    lines.push(
      [
        o.order_id,
        o.created_at,
        o.status,
        sa.recipient || o.customer_name || "",
        sa.phone || o.customer_phone || "",
        o.customer_email || "",
        sa.postcode || "",
        sa.address || "",
        sa.detail || "",
        sa.memo || "",
        o.product_code,
        o.quantity,
        o.amount,
        o.payment_method || "",
        o.tracking_number || "",
      ]
        .map(cell)
        .join(","),
    );
  }

  // Prepend BOM so Excel reads UTF-8 Korean correctly.
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="glo-orders.csv"`,
    },
  });
}
