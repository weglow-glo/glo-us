/**
 * 네이버 전환추적(NAVER CTS) — 브라우저 헬퍼.
 * 가이드: https://navercts.gitbook.io/guide (wcs.naver.net/wcslog.js)
 *
 * 계정 키는 NEXT_PUBLIC_NAVER_CTS_ID (설치안내 메일의 AccountId, "s_..." 형식).
 * 미설정이면 모든 호출이 no-op — 로더(naver-cts.tsx)도 스크립트를 안 싣는다.
 *
 * 설치 이벤트:
 *   PV            전 페이지 (SPA 라우트 전환 포함)      — naver-cts.tsx
 *   view_product  /product 진입                          — naver-cts.tsx
 *   begin_checkout 주문서(/checkout) 진입                — checkout-client
 *   purchase      결제 승인 완료 (주문번호로 재발화 방지) — checkout/success
 */

export const NAVER_CTS_ID = process.env.NEXT_PUBLIC_NAVER_CTS_ID;

type ConvItem = {
  id: string;
  name?: string;
  category?: string;
  quantity?: number | string;
  payAmount?: number | string;
  option?: string;
};

type Conv = {
  type: string;
  value?: number | string;
  id?: string;
  items?: ConvItem[];
};

type Wcs = {
  inflow: (domain?: string) => void;
  trans: (conv: Conv) => void;
};

declare global {
  interface Window {
    wcs?: Wcs;
    wcs_add?: Record<string, string>;
    wcs_do?: (add?: Record<string, string>) => void;
  }
}

function ready(): boolean {
  return Boolean(NAVER_CTS_ID && typeof window !== "undefined" && window.wcs);
}

/** PV(페이지뷰) — 모든 페이지에서 1회, 라우트 전환마다 재발화. */
export function naverPV() {
  if (!ready()) return;
  window.wcs_add = window.wcs_add || {};
  window.wcs_add.wa = NAVER_CTS_ID as string;
  // 서브도메인(www) 전환 시 쿠키 유실 방지 — 1차 도메인으로 설정
  window.wcs!.inflow("glo-us.com");
  window.wcs_do?.();
}

/** 전환 이벤트 전송 (view_product / begin_checkout / purchase …). */
export function naverConv(conv: Conv) {
  if (!ready()) return;
  window.wcs_add = window.wcs_add || {};
  window.wcs_add.wa = NAVER_CTS_ID as string;
  window.wcs!.trans(conv);
}

/** 구매완료 — 주문번호 기준 1회만 (새로고침 재발화 방지). */
export function naverPurchase(orderId: string, value: number, orderName?: string) {
  if (!ready()) return;
  const key = `glo-ncts-purchase-${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* private mode — 그냥 1회 발화 */
  }
  naverConv({
    type: "purchase",
    value,
    id: orderId,
    items: [{ id: "GL-01", name: orderName ?? "glo GL-01", payAmount: value }],
  });
}
