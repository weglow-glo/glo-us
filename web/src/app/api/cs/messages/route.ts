import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastCs, notifyCsSlack } from "@/lib/cs-server";
import { CS_INBOX_TOPIC, csConvTopic, type CsMessage } from "@/lib/cs";

export const dynamic = "force-dynamic";

/**
 * 고객 CS 채팅 API — 위젯(cs-widget.tsx) 전용.
 *
 * 대화 접근권은 client_token(비밀 uuid, localStorage)이다. 비회원도 이 토큰만으로
 * 문의할 수 있고, 로그인 회원은 토큰이 없어도(기기 변경 등) 세션으로 자기 대화를
 * 되찾는다. 테이블은 RLS로 잠겨 있어 모든 접근이 여기(service role)를 거친다.
 *
 *   GET  ?token=…   대화 + 메시지 이력 (customer_unread 리셋)
 *   POST {token?, body}  메시지 전송 — 대화가 없으면 생성, 닫힌 대화는 재오픈
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LEN = 2000;
/** 도배 방지 — 대화당 고객 메시지 분당 최대 건수 */
const RATE_LIMIT_PER_MIN = 10;

type ConvRow = {
  id: string;
  client_token: string;
  user_id: string | null;
  display_name: string | null;
  status: "open" | "closed";
  admin_unread: number;
  customer_unread: number;
};

const CONV_SELECT =
  "id, client_token, user_id, display_name, status, admin_unread, customer_unread";

/** 토큰 우선, 없으면 로그인 세션으로 대화를 찾는다. */
async function resolveConversation(
  admin: ReturnType<typeof createAdminClient>,
  token: string | null,
  userId: string | null,
): Promise<ConvRow | null> {
  if (token) {
    const { data } = await admin
      .from("cs_conversations")
      .select(CONV_SELECT)
      .eq("client_token", token)
      .maybeSingle<ConvRow>();
    if (data) return data;
  }
  if (userId) {
    const { data } = await admin
      .from("cs_conversations")
      .select(CONV_SELECT)
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle<ConvRow>();
    if (data) return data;
  }
  return null;
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("token");
  const token = raw && UUID_RE.test(raw) ? raw : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  const conv = await resolveConversation(admin, token, user?.id ?? null);
  if (!conv) return NextResponse.json({ conversation: null, messages: [] });

  const { data: messages } = await admin
    .from("cs_messages")
    .select("id, conversation_id, sender, body, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(100)
    .returns<CsMessage[]>();

  if (conv.customer_unread > 0) {
    await admin.from("cs_conversations").update({ customer_unread: 0 }).eq("id", conv.id);
  }

  return NextResponse.json({
    conversation: { id: conv.id, token: conv.client_token, status: conv.status },
    messages: messages ?? [],
  });
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { token?: string; body?: string };
  const text = String(b.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "메시지를 입력해주세요." }, { status: 400 });
  if (text.length > MAX_LEN)
    return NextResponse.json({ error: `메시지는 ${MAX_LEN}자 이내로 입력해주세요.` }, { status: 400 });
  const token = typeof b.token === "string" && UUID_RE.test(b.token) ? b.token : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();

  let conv = await resolveConversation(admin, token, user?.id ?? null);
  const displayName = user
    ? String(user.user_metadata?.name ?? user.user_metadata?.nickname ?? "").trim() || null
    : null;

  if (!conv) {
    const { data: created, error: createErr } = await admin
      .from("cs_conversations")
      .insert({ user_id: user?.id ?? null, display_name: displayName })
      .select(CONV_SELECT)
      .single<ConvRow>();
    if (createErr || !created) {
      console.error("[cs] conversation create failed:", createErr?.message);
      return NextResponse.json({ error: "전송에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
    }
    conv = created;
  } else if (user && !conv.user_id) {
    // 비회원으로 시작한 대화 — 로그인 후 첫 메시지에서 계정에 연결한다.
    await admin
      .from("cs_conversations")
      .update({ user_id: user.id, display_name: displayName })
      .eq("id", conv.id);
    conv = { ...conv, user_id: user.id, display_name: displayName };
  }

  const { count } = await admin
    .from("cs_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conv.id)
    .eq("sender", "customer")
    .gte("created_at", new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= RATE_LIMIT_PER_MIN)
    return NextResponse.json({ error: "메시지가 너무 잦습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });

  const { data: msg, error: insErr } = await admin
    .from("cs_messages")
    .insert({ conversation_id: conv.id, sender: "customer", body: text })
    .select("id, conversation_id, sender, body, created_at")
    .single<CsMessage>();
  if (insErr || !msg) {
    console.error("[cs] message insert failed:", insErr?.message);
    return NextResponse.json({ error: "전송에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  await admin
    .from("cs_conversations")
    .update({
      status: "open",
      last_preview: text.slice(0, 80),
      last_message_at: msg.created_at,
      last_customer_message_at: msg.created_at,
      admin_unread: conv.admin_unread + 1,
    })
    .eq("id", conv.id);

  await broadcastCs(csConvTopic(conv.id), "message", msg);
  await broadcastCs(CS_INBOX_TOPIC, "update", { conversationId: conv.id });

  // 슬랙 통지는 "미답변 첫 메시지"에만 — 고객이 연달아 쓸 때 채널 도배 방지.
  if (conv.admin_unread === 0) {
    await notifyCsSlack({
      conversationId: conv.id,
      from: conv.display_name ?? displayName ?? "비회원",
      preview: text.slice(0, 120),
    });
  }

  return NextResponse.json({
    ok: true,
    conversation: { id: conv.id, token: conv.client_token, status: "open" },
    message: msg,
  });
}
