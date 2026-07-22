import { carrierName, trackingUrlOf } from "./carriers";

/**
 * 배송 알림 발송 — 센드온(Sendon).
 *
 * 지금은 문자(LMS)로 보낸다. 알림톡 템플릿 심사가 끝나면 알림톡 API로 바꾸고,
 * fallback을 CUSTOM/LMS로 두면 알림톡 실패 시 이 문구가 문자로 자동 대체발송된다.
 * (알림톡 body: { sendProfileId, templateId, to:[{phone, variables}], fallback })
 *
 * 필요한 환경변수 (web/.env.local — 절대 커밋하지 말 것):
 *   SENDON_ID        센드온 계정 ID
 *   SENDON_API_KEY   콘솔에서 발급한 API Key
 *   SENDON_SENDER    사전 등록된 발신번호 (숫자만)
 */

const API = "https://api.sendon.io/v2/messages/sms";

export type NotifyResult = {
  ok: boolean;
  channel: "lms";
  messageId?: string;
  error?: string;
};

/** 숫자만 남긴다. 010-1234-5678 → 01012345678 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  return d;
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

/** 문자 1건 발송. 환경변수가 없으면 발송하지 않고 실패를 돌려준다. */
export async function sendShippingNotice(opts: {
  to: string;
  name: string | null;
  carrier: string | null;
  trackingNumber: string;
}): Promise<NotifyResult> {
  const id = process.env.SENDON_ID;
  const key = process.env.SENDON_API_KEY;
  const from = process.env.SENDON_SENDER;
  if (!id || !key || !from) {
    return { ok: false, channel: "lms", error: "발송 환경변수(SENDON_*) 미설정" };
  }

  const body = {
    type: "LMS",
    from: from.replace(/\D/g, ""),
    to: [opts.to],
    // 한글 32자 제한. 짧게 유지할 것.
    title: "[glo] 상품 발송 안내",
    message: shippingMessage(opts),
    // 배송 안내는 정보성 메시지이므로 광고 아님 (광고 표기 의무 없음).
    isAd: false,
  };

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${id}:${key}`).toString("base64")}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      code?: number;
      message?: string;
      data?: { groupId?: string };
    };
    if (!res.ok || (json.code && json.code !== 200)) {
      return {
        ok: false,
        channel: "lms",
        error: json.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, channel: "lms", messageId: json.data?.groupId };
  } catch (e) {
    return { ok: false, channel: "lms", error: e instanceof Error ? e.message : String(e) };
  }
}
