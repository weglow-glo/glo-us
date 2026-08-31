import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastCs, notifyCsSlack, postBotMessage } from "@/lib/cs-server";
import {
  CS_INBOX_TOPIC,
  csConvTopic,
  CS_CATEGORY_LABEL,
  CS_CATEGORY_NEEDS_ORDER,
  type CsCategory,
  type CsMessage,
  type CsMeta,
} from "@/lib/cs";
import {
  runBotTurn,
  orderStatusAnswer,
  orderCardOf,
  BOT_ORDER_SELECT,
  type BotOrder,
} from "@/lib/cs-bot";

export const dynamic = "force-dynamic";

/**
 * 고객 CS 채팅 API — 위젯(cs-widget.tsx) 전용.
 *
 * 대화 접근권은 client_token(비밀 uuid, localStorage). 비회원도 이 토큰만으로
 * 문의할 수 있고, 로그인 회원은 토큰이 없어도(기기 변경 등) 세션으로 자기 대화를
 * 되찾는다. 테이블은 RLS로 잠겨 있어 모든 접근이 여기(service role)를 거친다.
 *
 * 응대 계층: ① 카테고리 퍼널(meta) ② 주문 상태 규칙 즉답 — 둘 다 LLM 없음 —
 * ③ 자유 텍스트는 Claude 봇(cs-bot.ts, after()로 응답 후 브로드캐스트)
 * ④ 상담원 모드(mode=human)면 슬랙 통지 → admin inbox.
 *
 *   GET  ?token=…        대화 + 메시지 이력 (customer_unread 리셋, 회원 바인딩)
 *   POST {token?, body, meta?}  메시지 전송 — 대화가 없으면 생성
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
  category: CsCategory | null;
  mode: "bot" | "human";
  order_id: string | null;
  admin_unread: number;
  customer_unread: number;
};

const CONV_SELECT =
  "id, client_token, user_id, display_name, status, category, mode, order_id, admin_unread, customer_unread";

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
  if (!conv) return NextResponse.json({ conversation: null, messages: [], loggedIn: !!user });

  // 비회원으로 시작한 대화 — 로그인 후 돌아오면 여기서 계정에 연결한다.
  if (user && !conv.user_id) {
    const displayName =
      String(user.user_metadata?.name ?? user.user_metadata?.nickname ?? "").trim() || null;
    await admin
      .from("cs_conversations")
      .update({ user_id: user.id, display_name: displayName })
      .eq("id", conv.id);
    conv.user_id = user.id;
  }

  const { data: messages } = await admin
    .from("cs_messages")
    .select("id, conversation_id, sender, body, meta, created_at")
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
    loggedIn: !!user,
  });
}

/** meta 파싱 — 알 수 없는 형태는 무시하고 일반 텍스트로 취급 */
function parseMeta(raw: unknown): CsMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as { kind?: string; value?: string; orderId?: string };
  if (m.kind === "category" && typeof m.value === "string" && m.value in CS_CATEGORY_LABEL)
    return { kind: "category", value: m.value as CsCategory };
  if (m.kind === "order_select" && typeof m.orderId === "string")
    return { kind: "order_select", orderId: m.orderId.slice(0, 64) };
  if (m.kind === "resume") return { kind: "resume" };
  if (m.kind === "escalate") return { kind: "escalate" };
  if (m.kind === "restart") return { kind: "restart" };
  if (m.kind === "back") return { kind: "back" };
  return null;
}

/**
 * 카테고리 확정 후 다음 스텝 안내 (LLM 없음).
 * 새 대화의 첫 메시지에서는 위젯이 아직 브로드캐스트를 구독하기 전이라,
 * 봇 즉답을 POST 응답에도 실어 보낸다 — 그래서 게시한 메시지를 반환한다.
 */
async function categoryReply(
  admin: ReturnType<typeof createAdminClient>,
  conv: ConvRow,
  category: CsCategory,
): Promise<CsMessage | null> {
  if (CS_CATEGORY_NEEDS_ORDER.includes(category)) {
    if (!conv.user_id) {
      return postBotMessage(
        admin,
        conv.id,
        "주문 확인을 위해 로그인이 필요합니다. 로그인하시면 주문 내역을 바로 확인해드릴게요.",
        { kind: "login_prompt" },
      );
    }
    const { data: orders } = await admin
      .from("orders")
      .select(BOT_ORDER_SELECT)
      .eq("user_id", conv.user_id)
      .order("created_at", { ascending: false })
      .limit(5)
      .returns<BotOrder[]>();

    if (!orders || orders.length === 0) {
      return postBotMessage(
        admin,
        conv.id,
        "이 계정으로 조회되는 주문이 없습니다. 다른 계정으로 주문하셨거나 비회원 주문이라면, 주문번호를 알려주시면 확인을 도와드릴게요.",
      );
    }
    if (orders.length === 1) {
      await admin
        .from("cs_conversations")
        .update({ order_id: orders[0].order_id })
        .eq("id", conv.id);
      return postBotMessage(
        admin,
        conv.id,
        orderStatusAnswer(orders[0]) + "\n\n더 궁금하신 점이 있으면 말씀해주세요.",
      );
    }
    return postBotMessage(admin, conv.id, "어떤 주문 건인지 선택해주세요.", {
      kind: "order_picker",
      orders: orders.map(orderCardOf),
    });
  }

  return postBotMessage(
    admin,
    conv.id,
    category === "product"
      ? "네, 제품에 대해 무엇이든 물어보세요. 성분, 섭취 방법, 가격 등 궁금하신 점을 편하게 남겨주시면 됩니다."
      : "네, 궁금하신 내용을 편하게 남겨주세요. 확인 후 바로 안내드리겠습니다.",
  );
}

/** 상담원 연결 — 모드 전환 + 슬랙 통지 + 안내 (봇/고객 요청 공용). */
async function escalate(
  admin: ReturnType<typeof createAdminClient>,
  conv: ConvRow,
  reason: string,
): Promise<CsMessage | null> {
  await admin.from("cs_conversations").update({ mode: "human" }).eq("id", conv.id);
  await notifyCsSlack({
    conversationId: conv.id,
    from: conv.display_name ?? "비회원",
    preview: reason,
  });
  return postBotMessage(
    admin,
    conv.id,
    "상담원에게 연결해드렸습니다. 순차적으로 확인 후 답변드리며, 답변이 등록되면 이 창에서 바로 보실 수 있습니다. (평일 10:00–18:00)",
  );
}

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as {
    token?: string;
    body?: string;
    meta?: unknown;
  };
  const text = String(b.body ?? "").trim();
  const meta = parseMeta(b.meta);
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
    .insert({ conversation_id: conv.id, sender: "customer", body: text, meta })
    .select("id, conversation_id, sender, body, meta, created_at")
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

  // ---- 응대 계층 분기 ----
  let botReply: CsMessage | null = null;
  if (meta?.kind === "category") {
    await admin
      .from("cs_conversations")
      .update({ category: meta.value })
      .eq("id", conv.id);
    botReply = await categoryReply(admin, { ...conv, category: meta.value }, meta.value);
  } else if (meta?.kind === "resume") {
    // 로그인 후 복귀 — 진행 중이던 카테고리 스텝을 다시 밟는다.
    botReply = await categoryReply(admin, conv, conv.category ?? "order");
  } else if (meta?.kind === "order_select") {
    // 소유권 검증: 이 대화 회원의 주문만 (봇이 남의 주문을 볼 수 없는 이유)
    const { data: order } = conv.user_id
      ? await admin
          .from("orders")
          .select(BOT_ORDER_SELECT)
          .eq("user_id", conv.user_id)
          .eq("order_id", meta.orderId)
          .maybeSingle<BotOrder>()
      : { data: null };
    if (!order) {
      botReply = await postBotMessage(admin, conv.id, "해당 주문을 찾을 수 없습니다. 다시 선택해주세요.");
    } else {
      await admin
        .from("cs_conversations")
        .update({ order_id: order.order_id })
        .eq("id", conv.id);
      botReply = await postBotMessage(
        admin,
        conv.id,
        orderStatusAnswer(order) + "\n\n더 궁금하신 점이 있으면 말씀해주세요.",
      );
    }
  } else if (meta?.kind === "escalate") {
    botReply = await escalate(admin, conv, "고객이 상담원 연결을 요청했습니다.");
  } else if (meta?.kind === "back") {
    // 이전 단계 — 주문 선택을 되돌리고, 되돌릴 주문 선택지가 없으면 카테고리로.
    if (conv.order_id && conv.user_id) {
      await admin.from("cs_conversations").update({ order_id: null }).eq("id", conv.id);
      const { data: orders } = await admin
        .from("orders")
        .select(BOT_ORDER_SELECT)
        .eq("user_id", conv.user_id)
        .order("created_at", { ascending: false })
        .limit(5)
        .returns<BotOrder[]>();
      if (orders && orders.length >= 2) {
        botReply = await postBotMessage(admin, conv.id, "어떤 주문 건인지 다시 선택해주세요.", {
          kind: "order_picker",
          orders: orders.map(orderCardOf),
        });
      } else {
        await admin.from("cs_conversations").update({ category: null }).eq("id", conv.id);
        botReply = await postBotMessage(admin, conv.id, "어떤 문의로 찾아주셨나요?", {
          kind: "category_picker",
        });
      }
    } else {
      await admin.from("cs_conversations").update({ category: null }).eq("id", conv.id);
      botReply = await postBotMessage(admin, conv.id, "어떤 문의로 찾아주셨나요?", {
        kind: "category_picker",
      });
    }
  } else if (meta?.kind === "restart") {
    // 처음으로 — 퍼널 상태를 비우고 봇 응대로 되돌린 뒤 카테고리부터 다시.
    await admin
      .from("cs_conversations")
      .update({ category: null, order_id: null, mode: "bot" })
      .eq("id", conv.id);
    botReply = await postBotMessage(
      admin,
      conv.id,
      "네, 처음부터 다시 도와드릴게요. 어떤 문의로 찾아주셨나요?",
      { kind: "category_picker" },
    );
  } else if (conv.mode === "bot") {
    // 자유 텍스트 → AI 봇. 응답은 브로드캐스트로 도착하므로 요청은 먼저 반환한다.
    const convId = conv.id;
    after(async () => {
      await runBotTurn(admin, convId);
    });
  } else {
    // 상담원 모드 — 슬랙 통지는 "미답변 첫 메시지"에만 (도배 방지)
    if (conv.admin_unread === 0) {
      await notifyCsSlack({
        conversationId: conv.id,
        from: conv.display_name ?? displayName ?? "비회원",
        preview: text.slice(0, 120),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    conversation: { id: conv.id, token: conv.client_token, status: "open" },
    message: msg,
    // 구독 시작 전(새 대화 첫 메시지)에도 봇 즉답이 보이도록 응답에 동봉
    botReply,
  });
}
