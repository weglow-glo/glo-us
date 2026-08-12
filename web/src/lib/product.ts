/**
 * Single source of truth for the GL-01 product + purchase options.
 * Korea-first launch: KRW, one-time purchase (no subscription).
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
  /** 현재 판매가(KRW, 번들 전체) — getOption() 이 이벤트 기간에 따라 해석 */
  price: number;
  /** 런칭 이벤트 종료 후 일반 판매가 */
  postPrice: number;
  badge?: string;
};

/** 공식 런칭 이벤트 종료 시각 — 2026-08-11 자정(KST) = 08-11T15:00Z.
 *  이후 getOption() 이 자동으로 일반 판매가(postPrice)를 반환한다. */
export const LAUNCH_EVENT_ENDS_AT = Date.parse("2026-08-11T15:00:00Z");

export function launchEventActive(now: number = Date.now()): boolean {
  return now < LAUNCH_EVENT_ENDS_AT;
}

/** Selectable duration bundles. Price is the trusted server-side amount.
 *  price   = 런칭 이벤트가 (2026-07-22~08-11): 소비자가 119,000/월에 30–50% 할인
 *  postPrice = 일반 판매가 (2026-08-10 개정): 수량별 16/21/26/33/40% 할인 */
export const OPTIONS: ProductOption[] = [
  { key: "1m", months: 1, label: "1개월 분", price: 83300, postPrice: 99960 },
  { key: "2m", months: 2, label: "2개월 분", price: 159460, postPrice: 188020, badge: "추천" },
  { key: "3m", months: 3, label: "3개월 분", price: 224910, postPrice: 264180, badge: "베스트" },
  { key: "4m", months: 4, label: "4개월 분", price: 276080, postPrice: 318920 },
  { key: "6m", months: 6, label: "6개월 분", price: 357000, postPrice: 428400 },
];

/** 시점 기준 실판매가 — 이벤트 종료 후 자동으로 일반 판매가로 전환. */
export function currentPrice(o: ProductOption, now: number = Date.now()): number {
  return launchEventActive(now) ? o.price : o.postPrice;
}

export function getOption(key: string | undefined | null): ProductOption {
  const o = OPTIONS.find((x) => x.key === key) ?? OPTIONS[0];
  return { ...o, price: currentPrice(o) };
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
