import crypto from "node:crypto";
import { carrierName, trackingUrlOf } from "./carriers";

/**
 * 배송 알림 발송.
 *
 * 현재는 문자(LMS)로 보낸다. 알림톡 템플릿 심사가 끝나면 sendShippingNotice의
 * payload만 알림톡(type: "ATA")으로 바꾸면 되고, 솔라피가 알림톡 실패 시 문자로
 * 자동 대체발송하므로 이 함수의 인터페이스는 그대로 둔다.
 *
 * 필요한 환경변수 (web/.env.local — 절대 커밋하지 말 것):
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER   (발신번호: 사전 등록된 번호만 가능)
 * 알림톡 전환 시 추가: SOLAPI_PFID, SOLAPI_TEMPLATE_SHIPPED
 */

const API = "https://api.solapi.com/messages/v4/send-many/detail";

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

function authHeader(key: string, secret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${key}, date=${date}, salt=${salt}, signature=${signature}`;
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
  if (url) lines.push(``, `배송조회`, url);
  lines.push(``, `문의: 02-467-1024`);
  return lines.join("\n");
}

/** 문자 1건 발송. 환경변수가 없으면 발송하지 않고 실패를 돌려준다. */
export async function sendShippingNotice(opts: {
  to: string;
  name: string | null;
  carrier: string | null;
  trackingNumber: string;
}): Promise<NotifyResult> {
  const key = process.env.SOLAPI_API_KEY;
  const secret = process.env.SOLAPI_API_SECRET;
  const from = process.env.SOLAPI_SENDER;
  if (!key || !secret || !from) {
    return { ok: false, channel: "lms", error: "발송 환경변수(SOLAPI_*) 미설정" };
  }

  const body = {
    messages: [
      {
        to: opts.to,
        from: from.replace(/\D/g, ""),
        type: "LMS",
        subject: "[glo] 상품 발송 안내",
        text: shippingMessage(opts),
      },
    ],
  };

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(key, secret),
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      failedMessageList?: Array<{ statusMessage?: string }>;
      messageList?: Array<{ messageId?: string }>;
      message?: string;
    };
    if (!res.ok) {
      return { ok: false, channel: "lms", error: json.message ?? `HTTP ${res.status}` };
    }
    const failed = json.failedMessageList?.[0];
    if (failed) {
      return { ok: false, channel: "lms", error: failed.statusMessage ?? "발송 실패" };
    }
    return { ok: true, channel: "lms", messageId: json.messageList?.[0]?.messageId };
  } catch (e) {
    return { ok: false, channel: "lms", error: e instanceof Error ? e.message : String(e) };
  }
}
