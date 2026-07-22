/**
 * Single source of truth for the GL-01 product + pre-order options.
 * Korea-first launch: KRW, one-time pre-order (no subscription).
 * Every order ships 7/22 as one batch; the regular price resumes at launch.
 */
export const PRODUCT = {
  code: "GL-01",
  name: "glo GL-01",
  /** regular price per month after the 7/22 launch */
  regularPrice: 119000,
  currency: "KRW" as const,
} as const;

export type ProductOption = {
  key: string;
  months: number;
  label: string;
  /** pre-order sale price in KRW for the whole bundle */
  price: number;
  badge?: string;
};

/** Selectable duration bundles. Price is the trusted server-side amount.
 *  Launch pricing (2026-07-22): 119,000/월 소비자가에 수량별 10–30% 할인. */
export const OPTIONS: ProductOption[] = [
  { key: "1m", months: 1, label: "1개월 분", price: 107100 },
  { key: "2m", months: 2, label: "2개월 분", price: 202300, badge: "추천" },
  { key: "3m", months: 3, label: "3개월 분", price: 285600, badge: "베스트" },
  { key: "4m", months: 4, label: "4개월 분", price: 357000 },
  { key: "6m", months: 6, label: "6개월 분", price: 499800 },
];

export function getOption(key: string | undefined | null): ProductOption {
  return OPTIONS.find((o) => o.key === key) ?? OPTIONS[0];
}

/** Regular (pre-discount) price for an option = months × monthly regular price. */
export function regularOf(o: ProductOption): number {
  return o.months * PRODUCT.regularPrice;
}

/** Discount percent vs the regular price (e.g. 52.5). */
export function discountOf(o: ProductOption): number {
  return Math.round((1 - o.price / regularOf(o)) * 1000) / 10;
}

export function formatPct(d: number): string {
  return `${Number.isInteger(d) ? d : d.toFixed(1)}%`;
}

export function orderNameOf(o: ProductOption): string {
  return `${PRODUCT.name} ${o.label}`;
}

export function formatKRW(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

/** Toss requires orderId to be 6–64 chars, [A-Za-z0-9_-]. */
export function generateOrderId(): string {
  return `glo_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export const PREORDER = {
  /** all pre-orders ship together on this date */
  shipDate: "7월 22일",
  shipNote: "사전결제 상품 · 7월 22일 일괄배송",
} as const;
