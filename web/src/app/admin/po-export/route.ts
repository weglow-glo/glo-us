import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 발주 엑셀 — matches the 위글로우 수기발주 양식 (업로드용 sheet, 23 columns).
 * Emits .xlsx because the shipping program only accepts Excel uploads.
 * Defaults to orders awaiting fulfillment (paid + preparing); pass ?status= to
 * override with a single status. Filled columns mirror the template's sample
 * row (송하인 4종 고정 + 정리한품목명/수량/성함/연락처/주소) plus 우편번호 and
 * 배송메세지, which the shipping program can use when present.
 */

const HEADERS = [
  "송하인", "송하인연락처", "송하인우편번호", "송하인주소지", "회원아이디",
  "주문시간", "결제금액", "주문상태", "상품상태", "주문번호", "상품주문번호",
  "품목명", "옵션", "단계변경", "정리한품목명", "수량", "배송메세지", "성함",
  "연락처", "연락처2", "의사메모", "우편번호", "주소",
];

// [1] = (주)위글로우 sender block from the template's 송하인 정보 sheet.
const SENDER = {
  name: "(주)위글로우",
  phone: "02-467-1024",
  postcode: "06018",
  address: "서울특별시 성동구 왕십리로 38 홍성빌딩 3층",
};
const ITEM_NAME = "[1] glo GL-01 30포 1박스";

type Row = {
  order_id: string;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: {
    recipient?: string;
    phone?: string;
    postcode?: string;
    address?: string;
    detail?: string;
    memo?: string;
  } | null;
  created_at: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const admin = createAdminClient();
  const base = admin
    .from("orders")
    .select("order_id, quantity, customer_name, customer_phone, shipping_address, created_at");
  const filtered = status
    ? base.eq("status", status)
    : base.in("status", ["paid", "preparing"]);
  const { data, error } = await filtered
    .order("created_at", { ascending: true })
    .limit(5000)
    .returns<Row[]>();
  if (error) {
    return new Response(`error: ${error.message}`, { status: 500 });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("업로드용");
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };

  for (const o of data ?? []) {
    const sa = o.shipping_address ?? {};
    const addr = [sa.address, sa.detail].filter(Boolean).join(" ");
    ws.addRow([
      SENDER.name, SENDER.phone, SENDER.postcode, SENDER.address,
      "", // 회원아이디
      "", // 주문시간
      "", // 결제금액
      "", // 주문상태
      "", // 상품상태
      o.order_id,
      "", // 상품주문번호
      "", // 품목명
      "", // 옵션
      "", // 단계변경
      ITEM_NAME,
      o.quantity,
      sa.memo || "",
      sa.recipient || o.customer_name || "",
      sa.phone || o.customer_phone || "",
      "", // 연락처2
      "", // 의사메모
      sa.postcode || "",
      addr,
    ]);
  }

  // Phone/postcode columns as text so leading zeros survive in Excel.
  for (const col of [2, 3, 19, 20, 22]) {
    ws.getColumn(col).numFmt = "@";
  }
  ws.columns.forEach((c, i) => {
    c.width = [15, 15, 13, 40][i] ?? (i === 22 ? 44 : 16);
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="glo-po.xlsx"`,
    },
  });
}
