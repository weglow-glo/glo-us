"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastCs } from "@/lib/cs-server";
import { CS_INBOX_TOPIC, csConvTopic, type CsMessage } from "@/lib/cs";

/**
 * 문의관리 서버 액션. /admin/* 전체가 proxy.ts의 Basic Auth 뒤에 있으므로
 * 여기서 별도 인증을 하지 않는다 (기존 admin/actions.ts와 동일한 전제).
 */

export type InboxConversation = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  status: "open" | "closed";
  category: string | null;
  mode: "bot" | "human";
  last_preview: string | null;
  last_message_at: string;
  admin_unread: number;
  created_at: string;
};

export type ThreadOrder = {
  id: string;
  order_id: string;
  status: string;
  amount: number | null;
  tracking_number: string | null;
  created_at: string;
};

const MAX_LEN = 2000;

export async function fetchInbox(): Promise<InboxConversation[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cs_conversations")
    .select("id, user_id, display_name, status, category, mode, last_preview, last_message_at, admin_unread, created_at")
    .order("last_message_at", { ascending: false })
    .limit(200)
    .returns<InboxConversation[]>();
  return data ?? [];
}

/** 스레드 열기 — 메시지 이력 + (회원이면) 최근 주문 컨텍스트. admin_unread 리셋. */
export async function fetchThread(
  conversationId: string,
): Promise<{ messages: CsMessage[]; orders: ThreadOrder[] }> {
  const admin = createAdminClient();

  const { data: messages } = await admin
    .from("cs_messages")
    .select("id, conversation_id, sender, body, meta, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200)
    .returns<CsMessage[]>();

  await admin.from("cs_conversations").update({ admin_unread: 0 }).eq("id", conversationId);

  const { data: conv } = await admin
    .from("cs_conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle<{ user_id: string | null }>();

  let orders: ThreadOrder[] = [];
  if (conv?.user_id) {
    const { data } = await admin
      .from("orders")
      .select("id, order_id, status, amount, tracking_number, created_at")
      .eq("user_id", conv.user_id)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<ThreadOrder[]>();
    orders = data ?? [];
  }

  return { messages: messages ?? [], orders };
}

/** 스레드를 보는 중 새 고객 메시지가 오면 읽음 처리만 한다. */
export async function markThreadRead(conversationId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("cs_conversations").update({ admin_unread: 0 }).eq("id", conversationId);
}

export async function sendReply(
  conversationId: string,
  body: string,
): Promise<{ ok: boolean; message?: CsMessage; error?: string }> {
  const text = body.trim();
  if (!text) return { ok: false, error: "내용을 입력해주세요." };
  if (text.length > MAX_LEN) return { ok: false, error: `답변은 ${MAX_LEN}자 이내로 입력해주세요.` };

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("cs_conversations")
    .select("id, customer_unread")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; customer_unread: number }>();
  if (!conv) return { ok: false, error: "대화를 찾을 수 없습니다." };

  const { data: msg, error: insErr } = await admin
    .from("cs_messages")
    .insert({ conversation_id: conv.id, sender: "admin", body: text })
    .select("id, conversation_id, sender, body, meta, created_at")
    .single<CsMessage>();
  if (insErr || !msg) {
    console.error("[admin/inbox] reply insert failed:", insErr?.message);
    return { ok: false, error: "전송에 실패했습니다. 다시 시도해주세요." };
  }

  await admin
    .from("cs_conversations")
    .update({
      last_preview: text.slice(0, 80),
      last_message_at: msg.created_at,
      customer_unread: conv.customer_unread + 1,
      admin_unread: 0,
      mode: "human", // 상담원이 답하면 봇은 이 대화에서 빠진다
    })
    .eq("id", conv.id);

  await broadcastCs(csConvTopic(conv.id), "message", msg);
  await broadcastCs(CS_INBOX_TOPIC, "update", { conversationId: conv.id });

  return { ok: true, message: msg };
}

/** 봇 응대 재개 / 상담원 모드 전환 (인박스 헤더 토글). */
export async function setConversationMode(
  conversationId: string,
  mode: "bot" | "human",
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("cs_conversations").update({ mode }).eq("id", conversationId);
  await broadcastCs(CS_INBOX_TOPIC, "update", { conversationId });
}

export async function setConversationStatus(
  conversationId: string,
  status: "open" | "closed",
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("cs_conversations").update({ status }).eq("id", conversationId);
  await broadcastCs(CS_INBOX_TOPIC, "update", { conversationId });
}
