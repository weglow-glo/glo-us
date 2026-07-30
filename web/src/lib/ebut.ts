import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, sendShippingNotice } from "./notify";

/**
 * 이벗WMS v3 연동 — 발주 자동화.
 *
 * 수작업 대체:
 *   아침 발주(엑셀 다운로드 → WMS 파일 등록)  → pushOrdersToWms()
 *   송장 회수(WMS 조회 → 관리자 수기 입력)     → pullInvoicesFromWms()
 *
 * 흐름: POST /orders/draft 로 오픈DB에 임시주문을 넣으면 현장담당자가
 * 운영서버로 이관한다(기존 엑셀 업로드와 같은 지점). 출고되면
 * GET /orders 에서 invoice_no 가 채워지므로 그걸 회수해 배송중 전환
 * + 기존 알림톡 발송까지 이어진다.
 *
 * 게이트웨이: https://api.ebut.co.kr/v3/wms · 인증: X-API-Key (+ X-Service: wms)
 * Rate limit: API Key 200 req/min.
 *
 * 환경변수 (web/.env.local — 절대 커밋 금지):
 *   EBUT_API_KEY            ebut_live_… (help@ebut.co.kr 로 발급)
 *   EBUT_SELLER_CODE        셀러 코드
 *   EBUT_SALES_CHANNEL_CODE 판매처 코드 (WMS 기초정보 > 판매처코드)
 *   EBUT_COURIER_CODE       (선택) 셀러별 택배사 코드 (기초정보 > 택배사코드)
 *   EBUT_SELLER_SKU_CODE    (선택) GL-01 의 셀러 SKU 코드 — 현장 매칭 보조
 *   EBUT_SENDER_NAME / _PHONE / _ZIPCODE / _ADDR1  (선택) 보내는사람
 */

const BASE = "https://api.ebut.co.kr/v3/wms";

export function wmsConfigured(): boolean {
  return Boolean(
    process.env.EBUT_API_KEY &&
      process.env.EBUT_SELLER_CODE &&
      process.env.EBUT_SALES_CHANNEL_CODE,
  );
}

function headers(): Record<string, string> {
  return {
    "X-API-Key": process.env.EBUT_API_KEY ?? "",
    "X-Service": "wms",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** WMS courier_name → 우리 carriers.ts 코드 */
export function carrierCodeFromWmsName(name: string | null | undefined): string | null {
  const n = (name ?? "").replace(/\s/g, "");
  if (!n) return null;
  if (n.includes("CJ") || n.includes("대한통운")) return "cj";
  if (n.includes("한진")) return "hanjin";
  if (n.includes("롯데")) return "lotte";
  if (n.includes("우체국")) return "post";
  if (n.includes("로젠")) return "logen";
  if (n.includes("경동")) return "kdexp";
  return null;
}

type ShippingAddress = {
  recipient?: string;
  phone?: string;
  postcode?: string;
  address?: string;
  detail?: string;
  memo?: string;
} | null;

export type PushableOrder = {
  order_id: string;
  order_name: string;
  quantity: number | null;
  amount: number;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: ShippingAddress;
  approved_at: string | null;
  created_at: string;
};

function yyyymmddKst(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return d
    .toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
    .replaceAll("-", "");
}

/** 주문 → 오픈DB 임시주문 행 */
function toDraftRow(o: PushableOrder): Record<string, unknown> | { skip: string } {
  const sa = o.shipping_address ?? {};
  const phone = normalizePhone(sa.phone ?? o.customer_phone);
  if (!sa.recipient || !sa.address) return { skip: "배송지 정보 없음" };
  if (!phone) return { skip: "수령인 연락처 없음" };
  if (!sa.postcode) return { skip: "우편번호 없음" };

  const row: Record<string, unknown> = {
    seller_code: process.env.EBUT_SELLER_CODE,
    sales_channel_code: process.env.EBUT_SALES_CHANNEL_CODE,
    order_type_code: 1, // 신규
    mall_order_no: o.order_id,
    mall_order_seq: "01",
    order_date: yyyymmddKst(o.created_at),
    payment_date: yyyymmddKst(o.approved_at ?? o.created_at),
    orderer_name: o.customer_name ?? sa.recipient,
    recipient_name: sa.recipient,
    recipient_mobile: phone,
    recipient_zipcode: String(sa.postcode).slice(0, 7),
    recipient_addr1: sa.address,
    recipient_addr2: sa.detail ?? "",
    delivery_memo: sa.memo ?? "",
    mall_product_code: "GL-01",
    mall_product_name: o.order_name,
    order_qty: Math.max(1, o.quantity ?? 1),
    order_price: o.amount,
    delivery_area_code: "D",
    delivery_fee_party_code: 1, // 판매자 선불 (무료배송)
  };
  if (process.env.EBUT_COURIER_CODE) row.courier_code = process.env.EBUT_COURIER_CODE;
  if (process.env.EBUT_SELLER_SKU_CODE) row.seller_sku_code = process.env.EBUT_SELLER_SKU_CODE;
  if (process.env.EBUT_SENDER_NAME) {
    row.sender_name = process.env.EBUT_SENDER_NAME;
    row.sender_phone = process.env.EBUT_SENDER_PHONE ?? "";
    row.sender_mobile = process.env.EBUT_SENDER_PHONE ?? "";
    row.sender_zipcode = process.env.EBUT_SENDER_ZIPCODE ?? "";
    row.sender_addr1 = process.env.EBUT_SENDER_ADDR1 ?? "";
  }
  return row;
}

type DraftResult = {
  success: boolean;
  result_message?: string;
  draft_id?: string;
  mall_order_no?: string;
};

/**
 * 발주 푸시: 결제완료(+아직 미전송된 배송준비중) 주문을 WMS 오픈DB에 등록하고
 * 배송준비중으로 전환한다. WMS 가 mall_order_no+seq 로 중복을 거부하므로
 * 재실행해도 이중 발주는 나지 않는다.
 */
export async function pushOrdersToWms(admin: SupabaseClient): Promise<{
  ok: boolean;
  pushed: number;
  skipped: { order_id: string; reason: string }[];
  failed: { order_id: string; reason: string }[];
  error?: string;
}> {
  if (!wmsConfigured()) {
    return { ok: false, pushed: 0, skipped: [], failed: [], error: "EBUT_* 환경변수 미설정" };
  }

  const { data: orders, error } = await admin
    .from("orders")
    .select(
      "order_id, order_name, quantity, amount, customer_name, customer_phone, shipping_address, approved_at, created_at, status, wms_pushed_at",
    )
    .or("status.eq.paid,and(status.eq.preparing,wms_pushed_at.is.null)")
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<(PushableOrder & { status: string; wms_pushed_at: string | null })[]>();
  if (error) return { ok: false, pushed: 0, skipped: [], failed: [], error: error.message };

  const list = orders ?? [];
  if (list.length === 0) return { ok: true, pushed: 0, skipped: [], failed: [] };

  const skipped: { order_id: string; reason: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const rowOrder: string[] = [];
  for (const o of list) {
    const row = toDraftRow(o);
    if ("skip" in row) {
      skipped.push({ order_id: o.order_id, reason: row.skip as string });
      continue;
    }
    rows.push(row);
    rowOrder.push(o.order_id);
  }

  const failed: { order_id: string; reason: string }[] = [];
  let pushed = 0;

  if (rows.length > 0) {
    const res = await fetch(`${BASE}/orders/draft`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(rows),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { drafts?: DraftResult[] };
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        pushed: 0,
        skipped,
        failed,
        error: json?.error?.message ?? `WMS HTTP ${res.status}`,
      };
    }

    const drafts = json.data?.drafts ?? [];
    for (let i = 0; i < rowOrder.length; i++) {
      const orderId = rowOrder[i];
      // 응답 순서가 요청 순서와 같다는 보장이 없으니 mall_order_no 로 대조
      const d =
        drafts.find((x) => x.mall_order_no === orderId) ?? drafts[i] ?? null;
      const dup = d?.result_message?.includes("이미 등록된");
      if (d?.success || dup) {
        await admin
          .from("orders")
          .update({
            status: "preparing",
            wms_draft_id: d?.draft_id || null,
            wms_pushed_at: new Date().toISOString(),
          })
          .eq("order_id", orderId)
          .in("status", ["paid", "preparing"]);
        pushed++;
      } else {
        failed.push({ order_id: orderId, reason: d?.result_message ?? "알 수 없는 실패" });
      }
    }
  }

  return { ok: true, pushed, skipped, failed };
}

type WmsOrder = {
  mall_order_no?: string;
  invoice_no?: string;
  courier_name?: string;
  order_status_code?: number;
  shipped_date?: string;
};

/**
 * 송장 회수: WMS에 발주된(배송준비중) 주문의 송장번호를 조회해
 * 배송중 전환 + 알림톡 발송까지 처리한다.
 */
export async function pullInvoicesFromWms(admin: SupabaseClient): Promise<{
  ok: boolean;
  checked: number;
  shipped: { order_id: string; invoice: string; notified: boolean }[];
  error?: string;
}> {
  if (!wmsConfigured()) {
    return { ok: false, checked: 0, shipped: [], error: "EBUT_* 환경변수 미설정" };
  }

  const { data: orders, error } = await admin
    .from("orders")
    .select("order_id, customer_name, customer_phone, shipping_address")
    .eq("status", "preparing")
    .not("wms_pushed_at", "is", null)
    .is("tracking_number", null)
    .limit(80) // rate limit(200/min) 여유
    .returns<
      {
        order_id: string;
        customer_name: string | null;
        customer_phone: string | null;
        shipping_address: ShippingAddress;
      }[]
    >();
  if (error) return { ok: false, checked: 0, shipped: [], error: error.message };

  const list = orders ?? [];
  const shipped: { order_id: string; invoice: string; notified: boolean }[] = [];

  for (const o of list) {
    const url = new URL(`${BASE}/orders`);
    url.searchParams.set("seller_code", process.env.EBUT_SELLER_CODE ?? "");
    url.searchParams.set("mall_order_no", o.order_id);
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) continue;
    const json = (await res.json().catch(() => ({}))) as { data?: WmsOrder[] };
    const hit = (json.data ?? []).find((w) => w.invoice_no && String(w.invoice_no).trim());
    if (!hit) continue;

    const invoice = String(hit.invoice_no).replace(/\D/g, "");
    if (!invoice) continue;
    const carrier = carrierCodeFromWmsName(hit.courier_name) ?? "cj";

    const { error: upErr } = await admin
      .from("orders")
      .update({
        status: "shipped",
        carrier,
        tracking_number: invoice,
        shipped_at: new Date().toISOString(),
      })
      .eq("order_id", o.order_id)
      .eq("status", "preparing"); // 경합 방지
    if (upErr) continue;

    // 알림톡/문자 — 관리자 일괄 등록과 동일한 규약
    let notified = false;
    const to = normalizePhone(o.shipping_address?.phone ?? o.customer_phone);
    if (!to) {
      await admin.from("notifications").insert({
        order_id: o.order_id,
        kind: "shipped",
        channel: "lms",
        status: "failed",
        error: "연락처 없음 또는 형식 오류",
      });
    } else {
      const r = await sendShippingNotice({
        to,
        orderId: o.order_id,
        name: o.shipping_address?.recipient ?? o.customer_name,
        carrier,
        trackingNumber: invoice,
      });
      await admin.from("notifications").insert({
        order_id: o.order_id,
        kind: "shipped",
        channel: r.channel,
        to_phone: to,
        status: r.ok ? "sent" : "failed",
        provider_message_id: r.messageId ?? null,
        error: r.error ?? null,
      });
      if (r.ok) {
        notified = true;
        await admin
          .from("orders")
          .update({ shipping_notified_at: new Date().toISOString() })
          .eq("order_id", o.order_id);
      }
    }
    shipped.push({ order_id: o.order_id, invoice, notified });
  }

  return { ok: true, checked: list.length, shipped };
}
