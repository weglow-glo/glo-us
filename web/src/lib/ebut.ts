import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone, sendShippingNotice } from "./notify";

/**
 * 이벗WMS v2 연동 — 발주 자동화.
 *
 * 수작업 대체:
 *   아침 발주(엑셀 다운로드 → WMS 파일 등록)  → pushOrdersToWms()
 *   송장 회수(WMS 조회 → 관리자 수기 입력)     → pullInvoicesFromWms()
 *
 * v2 를 쓰는 이유: 기존 발급 키(바인허브 시절)가 v2 용이고 이벗 측에서
 * 계속 사용 가능하다고 확인. v2 는 Bearer 인증 + **출발지 IP 화이트리스트**
 * 를 함께 검사한다 — 등록된 IP(사무실)에서만 호출 가능. Vercel 은 고정 IP
 * 가 없으므로 IP 제한이 풀리기 전까지는 사무실 PC 러너에서 돌린다.
 *
 * 문서: https://www.ebut3pl.co.kr/api/guide/main.html
 * Base: https://zuzfzmjszb.apigw.ntruss.com · 초당 10회 제한
 *
 * 환경변수 (web/.env.local — 절대 커밋 금지):
 *   EBUT_API_KEY      v2 인증키 (Authorization: Bearer)
 *   EBUT_ID           이벗 로그인 ID
 *   EBUT_CUST_CODE    고객사코드
 *   EBUT_ORD_SHOP     판매처코드 (자사몰)
 *   EBUT_COURIER_CODE (선택) 택배사코드 — invcExpr
 *   EBUT_GOODS_SG_CODE / EBUT_GOODS_SO_CODE (선택) WMS 등록 상품/옵션 코드
 *   EBUT_SENDER_NAME / _PHONE / _ZIPCODE / _ADDR1 (선택) 발송인
 */

const BASE = "https://zuzfzmjszb.apigw.ntruss.com/OrderSheet/v2";

export function wmsConfigured(): boolean {
  return Boolean(
    process.env.EBUT_API_KEY &&
      process.env.EBUT_ID &&
      process.env.EBUT_CUST_CODE &&
      process.env.EBUT_ORD_SHOP,
  );
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.EBUT_API_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

/** WMS 택배사명(invcExpr) → 우리 carriers.ts 코드 */
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

function ymdKst(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // yyyy-MM-dd
}

/** 주문 → v2 주문등록(복수) 행 */
function toOrderRow(o: PushableOrder): Record<string, unknown> | { skip: string } {
  const sa = o.shipping_address ?? {};
  const phone = normalizePhone(sa.phone ?? o.customer_phone);
  if (!sa.recipient || !sa.address) return { skip: "배송지 정보 없음" };
  if (!phone) return { skip: "수령인 연락처 없음" };
  if (!sa.postcode) return { skip: "우편번호 없음" };

  const address = [sa.address, sa.detail].filter(Boolean).join(" ").slice(0, 66);
  const row: Record<string, unknown> = {
    id: process.env.EBUT_ID,
    custCode: process.env.EBUT_CUST_CODE,
    ordShop: process.env.EBUT_ORD_SHOP,
    ordGbn: "1", // 신규
    ordDate: ymdKst(o.created_at),
    payDate: ymdKst(o.approved_at ?? o.created_at),
    orderNo: o.order_id,
    orderNoSeq: "01",
    orderName: (o.customer_name ?? sa.recipient).slice(0, 18),
    receiverName: sa.recipient.slice(0, 18),
    receiverPhone: phone,
    receiverCellPhone: phone,
    receiverZipcode: String(sa.postcode).slice(0, 7),
    receiverAddress: address,
    receiverMemo: (sa.memo ?? "").slice(0, 300),
    goodsCode: "GL-01",
    goodsName: o.order_name.slice(0, 60),
    goodsOpt: "기본",
    goodsQty: Math.max(1, o.quantity ?? 1),
    goodsPrice: o.amount,
    orderDside: "1", // 판매자 선불 (무료배송)
    orderArea: "D",
  };
  // 이벗 매칭상품 정보 — ordercreatep 는 이걸 실으면 창고 매칭 작업 없이
  // 완전한 주문서로 등록된다. 코드는 마스터매칭 조회로 확인 (2026-07-31):
  // Weglow_Glo(글로) · [30포] glo GL-01 → prodCode 143490 / optionCode 150868
  const qty = Math.max(1, o.quantity ?? 1);
  row.edata = [
    {
      prodCode: process.env.EBUT_PROD_CODE ?? "143490",
      optionCode: process.env.EBUT_OPTION_CODE ?? "150868",
      basicName: "[30포] glo GL-01",
      basicNicn: "",
      boptcodeName: "-",
      orderQty: String(qty),
      basicCost: "",
      provCode: "",
      provName: "",
    },
  ];
  if (process.env.EBUT_COURIER_CODE) row.invcExpr = process.env.EBUT_COURIER_CODE;
  if (process.env.EBUT_GOODS_SG_CODE) row.goodsSGCode = process.env.EBUT_GOODS_SG_CODE;
  if (process.env.EBUT_GOODS_SO_CODE) row.goodsSOCode = process.env.EBUT_GOODS_SO_CODE;
  if (process.env.EBUT_SENDER_NAME) {
    row.senderName = process.env.EBUT_SENDER_NAME.slice(0, 18);
    row.senderPhone = process.env.EBUT_SENDER_PHONE ?? "";
    row.senderCellPhone = process.env.EBUT_SENDER_PHONE ?? "";
    row.senderZipcode = process.env.EBUT_SENDER_ZIPCODE ?? "";
    row.senderAddress = process.env.EBUT_SENDER_ADDR1 ?? "";
  }
  return row;
}

type CreateResult = {
  orderNo?: string;
  success?: string | boolean;
  resultMsg?: string;
};

/**
 * 발주 푸시: 결제완료(+아직 미전송된 배송준비중) 주문을 WMS 운영 주문서로
 * 등록하고 배송준비중으로 전환한다. orderNo+orderNoSeq 중복은 WMS 가
 * 거부하므로 재실행해도 이중 발주는 나지 않는다.
 *
 * 엔드포인트는 ordercreatem(임시 테이블 → WMS 화면에서 사용자 승인 필요)이
 * 아니라 **ordercreatep** — 매칭정보(edata) 포함 시 승인 없이 운영서버에
 * 바로 완전한 주문서가 등록된다. (2026-07-31 임시 테이블에 걸려 출고 누락될
 * 뻔한 사고 후 전환.)
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
    const row = toOrderRow(o);
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
    const res = await fetch(`${BASE}/ordercreatep`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ orderList: rows }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      errCode?: string;
      errMsg?: string;
      result?: CreateResult[];
    };
    if (!res.ok || (json.status === "error" && !json.result?.length)) {
      return {
        ok: false,
        pushed: 0,
        skipped,
        failed,
        error: json?.errMsg ?? `WMS HTTP ${res.status}`,
      };
    }

    const results = json.result ?? [];
    for (let i = 0; i < rowOrder.length; i++) {
      const orderId = rowOrder[i];
      const r = results.find((x) => x.orderNo === orderId) ?? results[i] ?? null;
      const okRow = r?.success === true || r?.success === "true";
      const dup = (r?.resultMsg ?? "").includes("이미");
      if (okRow || dup) {
        await admin
          .from("orders")
          .update({ status: "preparing", wms_pushed_at: new Date().toISOString() })
          .eq("order_id", orderId)
          .in("status", ["paid", "preparing"]);
        pushed++;
      } else {
        failed.push({ order_id: orderId, reason: r?.resultMsg ?? "알 수 없는 실패" });
      }
    }
  }

  return { ok: true, pushed, skipped, failed };
}

type StatusRow = {
  orderCodeNo?: string;
  invcExpr?: string;
  invcExprNo?: string;
  orderStatus?: string | number;
};

/**
 * 송장 회수: WMS 상태확인(주문번호 기준, 최대 100건 일괄)으로 송장번호를
 * 조회해 배송중 전환 + 알림톡 발송까지 처리한다.
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
    .limit(100) // v2 상태확인 최대 100건
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
  if (list.length === 0) return { ok: true, checked: 0, shipped: [] };

  const res = await fetch(`${BASE}/orderstatus`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      id: process.env.EBUT_ID,
      custCode: process.env.EBUT_CUST_CODE,
      codeType: "2", // 주문번호로 조회
      codeList: list.map((o) => ({ orderCodeNo: o.order_id })),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    status?: string;
    errMsg?: string;
    data?: StatusRow[];
  };
  if (!res.ok || json.status === "error") {
    return {
      ok: false,
      checked: list.length,
      shipped: [],
      error: json?.errMsg ?? `WMS HTTP ${res.status}`,
    };
  }

  const byOrder = new Map<string, StatusRow>();
  for (const d of json.data ?? []) {
    if (d.orderCodeNo) byOrder.set(String(d.orderCodeNo), d);
  }

  const shipped: { order_id: string; invoice: string; notified: boolean }[] = [];

  for (const o of list) {
    const hit = byOrder.get(o.order_id);
    const invoice = String(hit?.invcExprNo ?? "").replace(/\D/g, "");
    if (!invoice) continue;
    const carrier = carrierCodeFromWmsName(hit?.invcExpr) ?? "cj";

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
