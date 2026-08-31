/**
 * 자체 CS 채팅 — 서버 전용 헬퍼. Client Component에 import 금지.
 *
 * 실시간: Supabase Realtime Broadcast를 HTTP로 발행한다. Vercel 서버리스는
 * 웹소켓을 유지할 수 없지만 발행은 단발 POST면 충분하고, 구독은 각 브라우저가
 * Supabase에 직접 웹소켓으로 붙는다 (서버 경유 없음).
 *
 * 운영자 통지: 슬랙 인커밍 웹훅(#글로-cs). 환경변수 없으면 조용히 건너뛴다.
 *   SLACK_CS_WEBHOOK_URL  (web/.env.local + Vercel — 절대 커밋하지 말 것)
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://glo-us.com";

/** Realtime Broadcast 1건 발행. 실패해도 채팅 자체는 저장돼 있으므로 로그만 남긴다. */
export async function broadcastCs(
  topic: string,
  event: string,
  payload: unknown,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: [{ topic, event, payload, private: false }] }),
    });
    if (!res.ok) console.error("[cs] broadcast failed:", res.status, await res.text());
  } catch (e) {
    console.error("[cs] broadcast failed:", e);
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { csConvTopic, CS_INBOX_TOPIC, type CsMessage, type CsMeta } from "./cs";

/**
 * 봇/시스템 발신 메시지 1건: 저장 → 대화 메타 갱신 → 브로드캐스트.
 * 규칙 기반 응답(route)과 AI 응답(cs-bot)이 공용으로 쓴다.
 */
export async function postBotMessage(
  admin: SupabaseClient,
  conversationId: string,
  body: string,
  meta?: CsMeta,
): Promise<CsMessage | null> {
  const { data: msg, error } = await admin
    .from("cs_messages")
    .insert({ conversation_id: conversationId, sender: "bot", body, meta: meta ?? null })
    .select("id, conversation_id, sender, body, meta, created_at")
    .single<CsMessage>();
  if (error || !msg) {
    console.error("[cs-bot] message insert failed:", error?.message);
    return null;
  }

  const { data: conv } = await admin
    .from("cs_conversations")
    .select("customer_unread")
    .eq("id", conversationId)
    .maybeSingle<{ customer_unread: number }>();
  await admin
    .from("cs_conversations")
    .update({
      last_preview: body.slice(0, 80),
      last_message_at: msg.created_at,
      customer_unread: (conv?.customer_unread ?? 0) + 1,
    })
    .eq("id", conversationId);

  await broadcastCs(csConvTopic(conversationId), "message", msg);
  await broadcastCs(CS_INBOX_TOPIC, "update", { conversationId });
  return msg;
}

/** 새 고객 문의를 슬랙 #글로-cs 채널에 통지한다 (베스트에포트). */
export async function notifyCsSlack(opts: {
  conversationId: string;
  from: string;
  preview: string;
}): Promise<void> {
  const hook = process.env.SLACK_CS_WEBHOOK_URL;
  if (!hook) return;
  const text = [
    `[glo CS] 새 고객 문의 — ${opts.from}`,
    `> ${opts.preview}`,
    `답변하기: ${SITE}/admin/inbox?c=${opts.conversationId}`,
  ].join("\n");
  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error("[cs] slack notify failed:", res.status);
  } catch (e) {
    console.error("[cs] slack notify failed:", e);
  }
}
