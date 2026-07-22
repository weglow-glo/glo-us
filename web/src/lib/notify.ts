import { carrierName, trackingUrlOf } from "./carriers";
import { PRODUCT } from "./product";

/**
 * 배송 알림 발송 — 센드온(Sendon).
 *
 * 알림톡 환경변수(SENDON_CHANNEL_ID + SENDON_TEMPLATE_SHIPPED)가 채워져 있으면
 * 알림톡으로 보내고, 비어 있으면 문자(LMS)로 보낸다. 템플릿 심사가 통과되면
 * .env에 템플릿 코드만 넣으면 코드 수정 없이 알림톡으로 전환된다.
 *
 * 알림톡 실패 시 문자는 fallbackType:"TEMPLATE" — 센드온 콘솔에 등록해 둔
 * '대체문자'가 자동 발송되므로 여기서 문자를 따로 보내지 않는다.
 *
 * 환경변수 (web/.env.local — 절대 커밋하지 말 것):
 *   SENDON_ID, SENDON_API_KEY, SENDON_SENDER              공통/문자
 *   SENDON_CHANNEL_ID, SENDON_TEMPLATE_SHIPPED            알림톡 (심사 통과 후)
 */

const SMS_API = "https://api.sendon.io/v2/messages/sms";
const ALIMTALK_API = "https://api.sendon.io/v2/messages/kakao/alim-talk";
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
  carrier: string | null;
  trackingNumber: string;
}): string {
  const url = trackingUrlOf(opts.carrier, opts.trackingNumber);
  const lines = [
    `[glo] 상품이 발송되었습니다.`,
    ``,
    `${opts.name ? opts.name + " 고객님, " : ""}주문하신 glo GL-01이 출고되었습니다.`,
    ``,
    `· 택배사: ${carrierName(opts.carrier)}`,
    `· 송장번호: ${opts.trackingNumber}`,
  ];
  if (url) lines.push(``, `배송 조회`, url);
  return lines.join("\n");
}

function auth(id: string, key: string): string {
  return `Basic ${Buffer.from(`${id}:${key}`).toString("base64")}`;
}

type SendonResponse = {
  code?: number;
  message?: string;
  data?: { groupId?: string };
};

async function post(
  url: string,
  id: string,
  key: string,
  body: unknown,
  channel: "lms" | "alimtalk",
): Promise<NotifyResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth(id, key) },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as SendonResponse;
    if (!res.ok || (json.code && json.code !== 200)) {
      return { ok: false, channel, error: json.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, channel, messageId: json.data?.groupId };
  } catch (e) {
    return { ok: false, channel, error: e instanceof Error ? e.message : String(e) };
  }
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
  const id = process.env.SENDON_ID;
  const key = process.env.SENDON_API_KEY;
  const from = process.env.SENDON_SENDER;
  if (!id || !key || !from) {
    return { ok: false, channel: "lms", error: "발송 환경변수(SENDON_*) 미설정" };
  }

  const channelId = process.env.SENDON_CHANNEL_ID;
  const templateId = process.env.SENDON_TEMPLATE_SHIPPED;

  // 알림톡 (심사 통과 + 환경변수 설정 시)
  if (channelId && templateId) {
    return post(ALIMTALK_API, id, key, {
      sendProfileId: channelId,
      templateId,
      to: [
        {
          phone: opts.to,
          variables: {
            "#{고객명}": opts.name ?? "고객",
            "#{상품명}": PRODUCT.name,
            "#{택배사}": carrierName(opts.carrier),
            "#{송장번호}": opts.trackingNumber,
            "#{배송조회링크}": trackUrl(opts.orderId),
          },
        },
      ],
      // 콘솔에 등록해 둔 대체문자를 그대로 사용한다.
      fallback: { fallbackType: "TEMPLATE" },
    }, "alimtalk");
  }

  // 알림톡 미설정 시 문자(LMS)
  return post(SMS_API, id, key, {
    type: "LMS",
    from: from.replace(/\D/g, ""),
    to: [opts.to],
    title: "[glo] 상품 발송 안내",
    message: shippingMessage(opts),
    isAd: false,
  }, "lms");
}
