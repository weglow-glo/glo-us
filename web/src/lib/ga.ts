/**
 * Google Analytics 4 (gtag.js) — 방문·유입 분석용.
 *
 * Meta Pixel / 네이버 CTS 가 광고 성과 측정이라면, GA4 는 전체 트래픽의
 * 유입 경로·페이지 흐름·전환 퍼널을 본다. 측정 ID 가 없으면 전부 no-op
 * 이므로 로컬·프리뷰에서는 자동으로 꺼진다.
 */

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function gaEnabled(): boolean {
  return Boolean(GA_ID) && typeof window !== "undefined";
}

/** 페이지뷰 — SPA 라우트 전환마다 수동 발화 (자동 page_view 는 끈다) */
export function gaPageView(path: string): void {
  if (!gaEnabled()) return;
  window.gtag?.("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** 임의 이벤트 */
export function gaEvent(name: string, params?: Record<string, unknown>): void {
  if (!gaEnabled()) return;
  window.gtag?.("event", name, params ?? {});
}

/** GA4 표준 전자상거래 — 상품 조회 */
export function gaViewItem(price: number): void {
  gaEvent("view_item", {
    currency: "KRW",
    value: price,
    items: [{ item_id: "GL-01", item_name: "glo GL-01", price }],
  });
}

/** GA4 표준 전자상거래 — 체크아웃 시작 */
export function gaBeginCheckout(opts: {
  value: number;
  optionLabel: string;
  round?: string | null;
}): void {
  gaEvent("begin_checkout", {
    currency: "KRW",
    value: opts.value,
    items: [
      {
        item_id: "GL-01",
        item_name: "glo GL-01",
        item_variant: opts.optionLabel,
        price: opts.value,
        quantity: 1,
      },
    ],
    // 공구/자사몰 구분 — GA 리포트에서 채널 분리용
    channel: opts.round ? "groupbuy" : "direct",
    ...(opts.round ? { seller_handle: opts.round } : {}),
  });
}

/** GA4 표준 전자상거래 — 구매 완료 (주문번호로 중복 제거) */
export function gaPurchase(opts: {
  orderId: string;
  value: number;
  orderName?: string;
}): void {
  gaEvent("purchase", {
    transaction_id: opts.orderId,
    currency: "KRW",
    value: opts.value,
    items: [
      {
        item_id: "GL-01",
        item_name: opts.orderName ?? "glo GL-01",
        price: opts.value,
        quantity: 1,
      },
    ],
  });
}
