/**
 * Single source of truth for order status — shared by the storefront mypage
 * and the admin dashboard so labels never drift.
 *
 * Lifecycle: pending → (가상계좌: awaiting_deposit →) paid → preparing →
 * shipped(배송중) → delivered(배송완료)
 * with failed / canceled / refunded as terminal off-ramps.
 *
 * awaiting_deposit: 가상계좌 발급 완료·입금 전. 토스 승인 응답이 성공이어도
 * status=WAITING_FOR_DEPOSIT 이면 돈이 들어온 게 아니다 — 절대 출고 금지.
 */
export type OrderStatus =
  | "pending"
  | "awaiting_deposit"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "failed"
  | "canceled"
  | "refunded";

export const STATUS_LABEL: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "결제대기", className: "bg-bg-3 text-ink-mute" },
  awaiting_deposit: { label: "입금대기", className: "bg-bg-3 text-burg-400" },
  paid: { label: "결제완료", className: "bg-burg-600 text-cream" },
  preparing: { label: "배송준비중", className: "bg-burg-100 text-cream" },
  shipped: { label: "배송중", className: "bg-burg-300 text-cream" },
  delivered: { label: "배송완료", className: "bg-accent text-cream" },
  failed: { label: "결제실패", className: "bg-bg-3 text-burg-400" },
  canceled: { label: "결제취소", className: "bg-bg-3 text-ink-mute" },
  refunded: { label: "환불", className: "bg-bg-3 text-ink-mute" },
};

export function statusLabel(status: string): { label: string; className: string } {
  return STATUS_LABEL[status as OrderStatus] ?? STATUS_LABEL.pending;
}

/**
 * Cancellation is allowed only before fulfillment begins — i.e. the order is
 * paid but the admin hasn't moved it to 배송준비중 yet. Once preparing/shipped/
 * delivered, the customer can no longer self-cancel.
 */
export function isCancelable(status: string): boolean {
  return status === "paid" || status === "awaiting_deposit";
}
