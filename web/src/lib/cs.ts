/**
 * 자체 CS 채팅 — 클라이언트/서버 공용 타입과 Realtime 토픽 이름.
 * 서버 전용 로직(브로드캐스트 발행, 슬랙 통지)은 cs-server.ts에 있다.
 */

export type CsMessage = {
  id: string;
  conversation_id: string;
  sender: "customer" | "admin";
  body: string;
  created_at: string;
};

/** 관리자 인박스 목록이 구독하는 토픽 — 대화 목록에 변화가 생기면 발행된다. */
export const CS_INBOX_TOPIC = "cs-inbox";

/** 대화 1건의 토픽 — 위젯과 관리자 스레드가 함께 구독한다. */
export function csConvTopic(conversationId: string): string {
  return `cs-conv-${conversationId}`;
}
