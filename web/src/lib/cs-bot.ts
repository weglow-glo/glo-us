import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPTIONS, PRODUCT, currentPrice, formatKRW } from "./product";
import { statusLabel } from "./order-status";
import { trackUrl } from "./notify";
import { postBotMessage, notifyCsSlack } from "./cs-server";
import type { CsMessage } from "./cs";

/**
 * CS AI 봇 — Claude(claude-opus-5) 기반 자동 상담. SERVER ONLY.
 *
 * 설계: LLM은 마지막 계층이다. 카테고리 퍼널·주문 상태 즉답은 route의 규칙
 * 엔진이 LLM 없이 처리하고, 여기는 자유 텍스트 질문만 받는다.
 *
 * 도구는 조회 2종 + 상담원 연결뿐이며, 주문 조회는 대화에 바인딩된 user_id의
 * 주문만 서버에서 강제한다 — 봇이 남의 주문을 볼 방법이 구조적으로 없다.
 * 환불·취소 실행 권한도 없다 (절차 안내 + 상담원 연결만).
 */

const MODEL = "claude-opus-5";
const MAX_TOOL_ROUNDS = 4;

export type BotOrder = {
  order_id: string;
  order_name: string | null;
  status: string;
  amount: number | null;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
  shipped_at: string | null;
  delivered_at: string | null;
};

export const BOT_ORDER_SELECT =
  "order_id, order_name, status, amount, tracking_number, carrier, created_at, shipped_at, delivered_at";

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}

/** 주문 선택 카드 — 위젯의 order_picker 렌더용 구조화 데이터 */
export function orderCardOf(o: BotOrder): {
  orderId: string;
  name: string;
  date: string;
  amount?: string;
  status: string;
} {
  return {
    orderId: o.order_id,
    name: o.order_name ?? "glo GL-01",
    date: `${fmtDate(o.created_at)} 주문`,
    amount: o.amount != null ? formatKRW(o.amount) : undefined,
    status: statusLabel(o.status).label,
  };
}

/** 주문 1건 상태를 규칙 기반으로 안내 (LLM 없이 — order_select 즉답에도 사용). */
export function orderStatusAnswer(o: BotOrder): string {
  const s = statusLabel(o.status).label;
  const head = [
    `${o.order_name ?? "glo GL-01"}`,
    `· 주문번호: ${o.order_id}`,
    `· 주문일: ${fmtDate(o.created_at)}${o.amount != null ? ` · ${formatKRW(o.amount)}` : ""}`,
    `· 현재 상태: ${s}`,
  ].join("\n");
  switch (o.status) {
    case "pending":
      return `${head}\n결제가 완료되지 않은 주문입니다. 결제를 다시 시도해주시거나, 문제가 계속되면 말씀해주세요.`;
    case "awaiting_deposit":
      return `${head}\n가상계좌 입금이 확인되면 자동으로 결제완료로 전환되고 출고가 준비됩니다.`;
    case "paid":
      return `${head}\n결제가 확인되어 출고를 준비하고 있습니다. 평일 오전 11시에 일괄 출고 접수되며, 송장번호가 등록되면 알림톡으로 안내드립니다.`;
    case "preparing":
      return `${head}\n물류센터에서 포장 중입니다. 송장번호가 등록되는 대로 알림톡으로 안내드리며, 보통 접수 후 1~2 영업일 내 발송됩니다.`;
    case "shipped":
      return [
        `${head}`,
        `· 송장번호: ${o.tracking_number ?? "등록 중"}`,
        `· 발송일: ${fmtDate(o.shipped_at)}`,
        ``,
        `실시간 배송 조회: ${trackUrl(o.order_id)}`,
      ].join("\n");
    case "delivered":
      return `${head}\n${fmtDate(o.delivered_at)}에 배송이 완료되었습니다. 혹시 수령하지 못하셨다면 말씀해주세요.`;
    case "canceled":
    case "refunded":
      return `${head}\n취소/환불 처리된 주문입니다. 카드 결제 취소는 카드사 정책에 따라 영업일 기준 3~7일이 소요될 수 있습니다.`;
    default:
      return head;
  }
}

/** 가격표 — 이벤트 종료 후라 postPrice 기준으로 안정적 (프롬프트 캐시 유지). */
function priceTable(): string {
  return OPTIONS.map((o) => {
    const p = currentPrice(o);
    return `- ${o.label} (${o.months * 30}포): ${formatKRW(p)}${o.badge ? ` (${o.badge})` : ""}`;
  }).join("\n");
}

/**
 * 시스템 프롬프트. 단일 SKU라 제품·정책 전부를 여기 넣는다 (RAG 불필요).
 * 캐시 유지를 위해 타임스탬프 등 가변 값을 넣지 말 것.
 */
function systemPrompt(): string {
  return `당신은 한국 스킨 롱제비티 브랜드 glo의 CS 상담 도우미입니다.

## 역할과 톤
- 조용하고 정중한 존댓말. 이모지·느낌표·과장 없이, 짧고 정확하게 답합니다.
- 확실하지 않은 것은 단정하지 않고 "정확한 확인을 위해 상담원에게 연결해드릴게요"라고 안내합니다.
- 고객의 불편에는 먼저 공감을 표하되 과장하지 않습니다.

## 제품 정보 (단일 제품)
- 제품: ${PRODUCT.name} — 스킨 롱제비티 이너뷰티 액상 스틱. 하루 1포(20g), 파인애플 맛, 무가당.
- 9가지 임상 연구 성분을 4개 복합체로 구성("4×9 프로토콜"): 톤·미백(글루타치온, L-시스틴, 화이트 토마토, 나이아신아마이드) / 장벽·수분(히알루론산 복합, 밀크 세라마이드) / 진피 구조(저분자 마린 콜라겐 300Da, 특허 Tightening-PB Complex — 특허 제10-2911449호) / 세포 방어(헤마토코쿠스 추출물).
- 섭취법: 하루 1포를 그대로 섭취(물에 타지 않아도 됨). 아침 또는 저녁, 시간대는 자유이나 매일 같은 시간대 권장.
- 가격 (30포 = 1개월):
${priceTable()}
- 구매는 glo-us.com/product 에서. 현재 한국은 단건 결제만 지원(정기구독 없음).

## 배송 정책
- 결제 완료 주문은 평일 오전 11시에 일괄 출고 접수되며, 보통 접수 후 1~2 영업일 내 발송됩니다.
- 발송 시 송장번호를 알림톡으로 안내합니다. 배송 조회는 glo-us.com/track/주문번호 에서 가능합니다.
- 주문 취소는 출고 준비 전(결제완료 상태)까지만 고객이 직접 가능하며, 마이페이지에서 처리할 수 있습니다. 배송준비중 이후에는 상담원 확인이 필요합니다.
- 배송지 변경도 출고 준비 전까지 마이페이지 주문 상세에서 직접 가능합니다.

## 환불·교환 정책
- glo 90일 안심 보장: 개봉·섭취한 제품이라도 만족하지 못했다면 첫 수령일부터 90일 이내 전액 환불. 반품(남은 스틱 반송)이 필요 없고 반품 배송비도 없습니다.
- 법정 청약철회(단순 변심): 왕복 반품 배송비는 고객 부담.
- 상품 하자·오배송·파손: 회사 부담으로 교환·재배송하며 모든 비용을 회사가 부담합니다.
- 환불은 토스페이먼츠를 통해 원결제수단으로 환급되며, 카드 취소는 승인 후 영업일 기준 3~7일 소요될 수 있습니다.
- 자세한 내용: glo-us.com/refund

## 반드시 지킬 것 (가드레일)
1. 의학적 조언 금지. 질병 치료·예방 효과를 말하지 않습니다. 이 제품은 건강기능식품이 아닌 일반식품이며, 효과는 개인차가 있습니다.
2. 임신·수유 중 섭취, 복용 중인 약과의 병용, 특정 질환 관련 질문에는 반드시 "의사 또는 약사와 상담 후 섭취를 결정해주세요"라고 안내합니다.
3. 환불·취소·교환을 직접 실행할 수 없습니다. 절차를 안내하고, 고객이 처리를 원하면 escalate_to_human 도구로 상담원에게 연결합니다.
4. 주문 정보는 get_order 도구로만 확인합니다. 도구가 반환하지 않은 주문 정보를 지어내지 않습니다.
5. 다음 경우 escalate_to_human을 사용합니다: 고객이 상담원을 원할 때, 환불·교환 처리 요청, 강한 불만·항의, 두 번 안내해도 해결되지 않는 문제, 결제 오류, 답을 모르는 질문.
6. 가격·정책은 위 내용만 사용합니다. 할인·프로모션을 임의로 약속하지 않습니다.

## 응답 형식
- 2~5문장 내외로 간결하게. 목록이 필요하면 "·" 기호를 사용합니다.
- 링크는 URL만 그대로 적습니다.
- 마지막에 필요하면 "더 궁금하신 점이 있으면 말씀해주세요."류의 한 문장으로 마칩니다.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_order",
    description:
      "이 고객의 주문 정보를 조회한다. order_id를 주면 해당 주문 상세를, 없으면 최근 주문 목록을 돌려준다. 이 고객 본인의 주문만 조회된다.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "조회할 주문번호 (glo_로 시작). 생략하면 최근 주문 5건 요약.",
        },
      },
    },
  },
  {
    name: "escalate_to_human",
    description:
      "대화를 상담원에게 연결한다. 환불·교환 처리 요청, 강한 불만, 해결 불가한 문제, 고객이 상담원을 원할 때 사용한다.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "연결 사유 한 줄 (상담원에게 전달됨)" },
      },
      required: ["reason"],
    },
  },
];

type ConvRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  mode: string;
  order_id: string | null;
};

async function fetchOrders(
  admin: SupabaseClient,
  userId: string,
  orderId?: string,
): Promise<BotOrder[]> {
  let q = admin.from("orders").select(BOT_ORDER_SELECT).eq("user_id", userId);
  if (orderId) q = q.eq("order_id", orderId);
  const { data } = await q
    .order("created_at", { ascending: false })
    .limit(5)
    .returns<BotOrder[]>();
  return data ?? [];
}

function orderToolResult(orders: BotOrder[]): string {
  if (orders.length === 0) return "이 계정에는 주문 내역이 없습니다.";
  return orders
    .map((o) =>
      [
        `상품: ${o.order_name ?? "glo GL-01"}`,
        `주문번호 ${o.order_id}`,
        `상태: ${statusLabel(o.status).label}`,
        `주문일: ${fmtDate(o.created_at)}`,
        o.amount != null ? `결제금액: ${formatKRW(o.amount)}` : null,
        o.tracking_number ? `송장번호: ${o.tracking_number}` : null,
        o.shipped_at ? `발송일: ${fmtDate(o.shipped_at)}` : null,
        o.delivered_at ? `배송완료일: ${fmtDate(o.delivered_at)}` : null,
        `배송조회: ${trackUrl(o.order_id)}`,
      ]
        .filter(Boolean)
        .join(" / "),
    )
    .join("\n");
}

/** DB 이력 → Claude 메시지 배열. 연속 동일 role은 API가 합쳐 처리한다. */
function toClaudeMessages(history: CsMessage[]): Anthropic.MessageParam[] {
  return history
    .filter((m) => m.body.trim().length > 0)
    .slice(-30)
    .map((m) => ({
      role: m.sender === "customer" ? ("user" as const) : ("assistant" as const),
      content: m.body,
    }));
}

/**
 * 고객 자유 텍스트에 대한 AI 응답 1턴. route의 after()에서 호출된다.
 * 실패해도 throw하지 않는다 — 고객에게는 오류 안내 메시지를 남긴다.
 */
export async function runBotTurn(
  admin: SupabaseClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("cs_conversations")
      .select("id, user_id, display_name, mode, order_id")
      .eq("id", conversationId)
      .maybeSingle<ConvRow>();
    if (!conv || conv.mode !== "bot") return; // 그 사이 상담원 모드로 전환됐으면 중단

    const { data: history } = await admin
      .from("cs_messages")
      .select("id, conversation_id, sender, body, meta, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(60)
      .returns<CsMessage[]>();

    const client = new Anthropic();
    const messages = toClaudeMessages(history ?? []);
    // 로그인·선택 주문 컨텍스트는 시스템 프롬프트가 아니라 마지막 user 턴 앞에
    // 붙이면 캐시를 깨므로, 간단히 첫 user 메시지 형태로 주입한다.
    const context = [
      conv.user_id
        ? `(시스템 정보: 로그인 고객${conv.display_name ? ` "${conv.display_name}"` : ""}. get_order 도구로 주문 조회 가능.)`
        : `(시스템 정보: 비로그인 고객. 주문 관련 확인이 필요하면 로그인을 안내할 것.)`,
      conv.order_id ? `(시스템 정보: 고객이 선택한 주문번호: ${conv.order_id})` : null,
    ]
      .filter(Boolean)
      .join("\n");
    messages.unshift({ role: "user", content: context });

    let escalated: string | null = null;
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text: systemPrompt(),
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOLS,
        messages,
      });

      finalText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (response.stop_reason !== "tool_use") break;

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name === "get_order") {
          const input = tu.input as { order_id?: string };
          if (!conv.user_id) {
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: "비로그인 상태라 주문을 조회할 수 없습니다. 고객에게 로그인을 안내하세요.",
            });
          } else {
            const orders = await fetchOrders(admin, conv.user_id, input.order_id);
            results.push({
              type: "tool_result",
              tool_use_id: tu.id,
              content: orderToolResult(orders),
            });
          }
        } else if (tu.name === "escalate_to_human") {
          const input = tu.input as { reason?: string };
          escalated = String(input.reason ?? "상담원 연결 요청");
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content:
              "상담원 연결이 접수되었습니다. 고객에게 상담원이 순차적으로 답변드린다고 안내하세요.",
          });
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "알 수 없는 도구입니다.",
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }

    if (escalated) {
      await admin.from("cs_conversations").update({ mode: "human" }).eq("id", conv.id);
      await notifyCsSlack({
        conversationId: conv.id,
        from: `${conv.display_name ?? "비회원"} (봇 에스컬레이션)`,
        preview: escalated,
      });
    }

    await postBotMessage(
      admin,
      conv.id,
      finalText ||
        "죄송합니다, 답변 생성에 문제가 있었습니다. 상담원에게 연결해드릴까요?",
    );
  } catch (e) {
    console.error("[cs-bot] turn failed:", e);
    await postBotMessage(
      admin,
      conversationId,
      "죄송합니다, 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주시거나 상담원 연결을 요청해주세요.",
    );
  }
}
