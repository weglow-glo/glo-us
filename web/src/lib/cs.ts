/**
 * 자체 CS 채팅 — 클라이언트/서버 공용 타입과 Realtime 토픽 이름.
 * 서버 전용 로직(브로드캐스트 발행, 슬랙 통지)은 cs-server.ts, AI 봇은 cs-bot.ts.
 */

export type CsSender = "customer" | "admin" | "bot";

/** 퍼널 카테고리 — cs_conversations.category */
export type CsCategory = "order" | "shipping" | "product" | "refund" | "etc";

export const CS_CATEGORY_LABEL: Record<CsCategory, string> = {
  order: "주문·결제",
  shipping: "배송",
  product: "제품·복용법",
  refund: "교환·환불",
  etc: "기타 문의",
};

/** 로그인해야 주문 컨텍스트를 붙일 수 있는 카테고리 */
export const CS_CATEGORY_NEEDS_ORDER: CsCategory[] = ["order", "shipping", "refund"];

/** 주문 선택 카드 1건 — label은 구버전 메시지 호환용 */
export type CsOrderCard = {
  orderId: string;
  name?: string;
  date?: string;
  amount?: string;
  status: string;
  label?: string;
};

/**
 * 구조화 메시지 페이로드 (cs_messages.meta).
 * 고객 발신: category / order_select / resume / escalate / restart
 * 봇 발신:   login_prompt / order_picker / category_picker
 */
export type CsMeta =
  | { kind: "category"; value: CsCategory }
  | { kind: "order_select"; orderId: string }
  | { kind: "resume" }
  | { kind: "escalate" }
  | { kind: "restart" }
  | { kind: "back" }
  | { kind: "login_prompt" }
  | { kind: "category_picker" }
  | { kind: "order_picker"; orders: CsOrderCard[] };

export type CsMessage = {
  id: string;
  conversation_id: string;
  sender: CsSender;
  body: string;
  meta?: CsMeta | null;
  created_at: string;
};

/** 관리자 인박스 목록이 구독하는 토픽 — 대화 목록에 변화가 생기면 발행된다. */
export const CS_INBOX_TOPIC = "cs-inbox";

/** 대화 1건의 토픽 — 위젯과 관리자 스레드가 함께 구독한다. */
export function csConvTopic(conversationId: string): string {
  return `cs-conv-${conversationId}`;
}
