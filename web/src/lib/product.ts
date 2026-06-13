/**
 * Single source of truth for the GL-01 product.
 * Korea-first launch: KRW, one-time purchase (no subscription yet).
 *
 * Pre-order phase: sells now at 50% off; every order ships 7/2 as one batch.
 * Official launch 7/2 reverts to the regular price.
 */
export const PRODUCT = {
  code: "GL-01",
  name: "glo GL-01",
  /** pre-order (50% off) unit price in KRW */
  price: 59500,
  /** regular price after the 7/2 launch */
  regularPrice: 119000,
  currency: "KRW" as const,
} as const;

export const PREORDER = {
  discountPct: 50,
  /** all pre-orders ship together on this date */
  shipDate: "7월 2일",
  shipNote: "사전결제 상품 · 7월 2일 일괄배송",
} as const;

export function orderName(quantity: number): string {
  return quantity > 1 ? `${PRODUCT.name} ${quantity}개` : PRODUCT.name;
}

export function formatKRW(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

/** Toss requires orderId to be 6–64 chars, [A-Za-z0-9_-]. */
export function generateOrderId(): string {
  return `glo_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}
