export type OrderStatus =
  | "pending"
  | "paid"
  | "preparing"
  | "shipped"
  | "failed"
  | "canceled"
  | "refunded";

export const STATUS_LABEL: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "결제대기", className: "bg-bg-3 text-ink-mute" },
  paid: { label: "결제완료", className: "bg-burg-600 text-cream" },
  preparing: { label: "배송준비", className: "bg-burg-100 text-cream" },
  shipped: { label: "배송완료", className: "bg-accent text-cream" },
  failed: { label: "결제실패", className: "bg-bg-3 text-burg-400" },
  canceled: { label: "취소", className: "bg-bg-3 text-ink-mute" },
  refunded: { label: "환불", className: "bg-bg-3 text-ink-mute" },
};
