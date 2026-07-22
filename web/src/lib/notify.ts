import crypto from "node:crypto";
import { carrierName } from "./carriers";
import { PRODUCT } from "./product";

/**
 * 배송 알림 발송 — 솔라피(SOLAPI).
 *
 * 센드온에서 옮겨왔다. 센드온은 API 호출 IP를 고정 IP로만 허용하는데 Vercel은
 * 고정 IP가 없어 실서비스에서 전부 차단됐다. 솔라피는 IP 제한이 없다.
 *
 * 알림톡 환경변수(SOLAPI_PFID + SOLAPI_TEMPLATE_SHIPPED)가 채워져 있으면 알림톡으로,
 * 비어 있으면 문자(LMS)로 보낸다. 템플릿 심사가 끝나면 .env만 채우면 전환된다.
 *
 * 알림톡 실패 시에는 같은 요청의 text가 문자로 자동 대체발송된다(disableSms:false).
 * 센드온과 달리 대체문자를 콘솔에 따로 등록할 필요가 없다.
 *
 * 환경변수 (web/.env.local — 절대 커밋하지 말 것):
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER        공통/문자
 *   SOLAPI_PFID, SOLAPI_TEMPLATE_SHIPPED                    알림톡 (심사 통과 후)
 */

const API = "https://api.solapi.com/messages/v4/send-many/detail";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://glo-us.com";

export type NotifyResult = {
  ok: boolean;
  channel: "lms" | "alimtalk";
  messageId?: string;
  error?: string;
};

/** 숫자만 남긴다. 010-1234-5678 → 01012345678 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  return d;
}

/** 알림톡·문자의 배송조회 링크. 택배사가 아니라 우리 도메인으로 고정한다. */
export function trackUrl(orderId: string): string {
  return `${SITE}/track/${orderId}`;
}

export function shippingMessage(opts: {
  name: string | null;
  orderId: string;
  carrier: string | null;
  trackingNumber: string;
}): string {
  return [
    `[glo] 상품이 발송되었습니다.`,
    ``,
    `${opts.name ? opts.name + " 고객님, " : ""}주문하신 glo GL-01이 출고되었습니다.`,
    ``,
    `· 택배사: ${carrierName(opts.carrier)}`,
    `· 송장번호: ${opts.trackingNumber}`,
    ``,
    `배송 조회`,
    trackUrl(opts.orderId),
  ].join("\n");
}

/** 솔라피 인증 헤더: HMAC-SHA256(date + salt, apiSecret) */
function authHeader(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto.createHmac("sha256", secret).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
}

export type ShippingNotice = {
  to: string;
  orderId: string;
  name: string | null;
  carrier: string | null;
  trackingNumber: string;
};

/** 배송 알림 1건. 환경변수가 없으면 발송하지 않고 실패를 돌려준다. */
export async function sendShippingNotice(opts: ShippingNotice): Promise<NotifyResult> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER;
  if (!key || !secret || !from) {
    return { ok: false, channel: "lms", error: "발송 환경변수(SOLAPI_*) 미설정" };
  }

  const pfId = process.env.SOLAPI_PFID;
  const templateId = process.env.SOLAPI_TEMPLATE_SHIPPED;
  const useAlimtalk = Boolean(pfId && templateId);
  const text = shippingMessage(opts);

  const message: Record<string, unknown> = {
    to: opts.to,
    from: from.replace(/\D/g, ""),
    // 알림톡일 때는 대체발송(문자) 본문으로 쓰인다.
    text,
    subject: "[glo] 상품 발송 안내",
  };
  if (useAlimtalk) {
    message.kakaoOptions = {
      pfId,
      templateId,
      variables: {
        "#{고객명}": opts.name ?? "고객",
        "#{상품명}": PRODUCT.name,
        "#{택배사}": carrierName(opts.carrier),
        "#{송장번호}": opts.trackingNumber,
        "#{배송조회링크}": trackUrl(opts.orderId),
      },
      // 알림톡 실패 시 위 text로 문자 대체발송
      disableSms: false,
    };
  }

  const channel: NotifyResult["channel"] = useAlimtalk ? "alimtalk" : "lms";

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(key, secret),
      },
      body: JSON.stringify({ messages: [message] }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      failedMessageList?: Array<{ statusMessage?: string; statusCode?: string }>;
      messageList?: Array<{ messageId?: string }>;
      groupId?: string;
      message?: string;
      errorMessage?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        channel,
        error: json.errorMessage ?? json.message ?? `HTTP ${res.status}`,
      };
    }
    const failed = json.failedMessageList?.[0];
    if (failed) {
      return { ok: false, channel, error: failed.statusMessage ?? "발송 실패" };
    }
    return {
      ok: true,
      channel,
      messageId: json.messageList?.[0]?.messageId ?? json.groupId,
    };
  } catch (e) {
    return { ok: false, channel, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 배송완료 7일 후 리뷰 요청 문자 본문 */
export function reviewRequestMessage(opts: { name: string | null }): string {
  return [
    `[glo] 일주일 드셔보셨나요?`,
    ``,
    `${opts.name ? opts.name + " 고객님, " : ""}glo GL-01과 함께한 첫 일주일은 어떠셨나요?`,
    ``,
    `후기를 남겨주시면 다음 구매에 쓸 수 있는 포인트를 드립니다.`,
    `· 텍스트 후기 3,000P`,
    `· 사진 포함 5,000P`,
    ``,
    `리뷰 작성`,
    `${SITE}/account`,
  ].join("\n");
}

/** 리뷰 요청 문자 1건 (LMS) */
export async function sendReviewRequest(opts: {
  to: string;
  name: string | null;
}): Promise<NotifyResult> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER;
  if (!key || !secret || !from) {
    return { ok: false, channel: "lms", error: "발송 환경변수(SOLAPI_*) 미설정" };
  }
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(key, secret),
      },
      body: JSON.stringify({
        messages: [
          {
            to: opts.to,
            from: from.replace(/\D/g, ""),
            text: reviewRequestMessage(opts),
            subject: "[glo] 후기 이벤트 안내",
          },
        ],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      failedMessageList?: Array<{ statusMessage?: string }>;
      messageList?: Array<{ messageId?: string }>;
      groupId?: string;
      errorMessage?: string;
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, channel: "lms", error: json.errorMessage ?? json.message ?? `HTTP ${res.status}` };
    }
    const failed = json.failedMessageList?.[0];
    if (failed) return { ok: false, channel: "lms", error: failed.statusMessage ?? "발송 실패" };
    return { ok: true, channel: "lms", messageId: json.messageList?.[0]?.messageId ?? json.groupId };
  } catch (e) {
    return { ok: false, channel: "lms", error: e instanceof Error ? e.message : String(e) };
  }
}
