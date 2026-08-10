/**
 * 셀러 관련 안내 발송 — 문구와 알림톡 템플릿 매핑의 단일 소스.
 *
 * /admin/sellers (지원 심사·일정 승인)와 /admin/members (셀러 승격)가
 * 같은 문구로 발송하도록 여기에 모은다. 발송 채널은 sendPlainNotice 가
 * 결정한다: 템플릿 env 가 차 있으면 알림톡(실패 시 문자 대체), 아니면 문자.
 */
import { normalizePhone, sendPlainNotice } from "@/lib/notify";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://glo-us.com";

export type SellerNotice = {
  subject: string;
  text: string;
  templateEnvKey: string;
  variables: Record<string, string>;
};

export function sellerApprovedNotice(name: string): SellerNotice {
  const link = `${SITE}/seller`;
  return {
    subject: "[glo] 셀러 심사 완료",
    templateEnvKey: "SOLAPI_TEMPLATE_SELLER_APPROVED",
    variables: { "#{이름}": name, "#{셀러센터}": link },
    text: [
      `[glo] 셀러 심사 완료`,
      ``,
      `${name}님, glo 셀러 심사가 완료되었습니다.`,
      `등록된 카카오 계정으로 셀러 센터에 로그인해 공동구매 일정을 신청하실 수 있습니다.`,
      ``,
      `셀러 센터`,
      link,
    ].join("\n"),
  };
}

export function sellerRejectedNotice(name: string, note?: string | null): SellerNotice {
  return {
    subject: "[glo] 셀러 심사 결과 안내",
    templateEnvKey: "SOLAPI_TEMPLATE_SELLER_REJECTED",
    variables: { "#{이름}": name, "#{사유}": note ?? "-" },
    text: [
      `[glo] 셀러 심사 결과 안내`,
      ``,
      `${name}님, 지원해주셔서 감사합니다.`,
      `아쉽지만 이번에는 함께하지 못하게 되었습니다.`,
      ...(note ? [``, `사유: ${note}`] : []),
      ``,
      `내용을 보완해 다시 지원하실 수 있습니다.`,
      `문의: official@weglow.biz`,
    ].join("\n"),
  };
}

export function roundApprovedNotice(opts: {
  name: string;
  period: string;
  rate: number;
  handle: string;
}): SellerNotice {
  const link = `${SITE}/product/@${opts.handle}`;
  return {
    subject: "[glo] 공동구매 일정 확정",
    templateEnvKey: "SOLAPI_TEMPLATE_ROUND_APPROVED",
    variables: {
      "#{이름}": opts.name,
      "#{기간}": opts.period,
      "#{수수료율}": `${opts.rate}%`,
      "#{링크}": link,
      "#{셀러센터}": `${SITE}/seller`,
    },
    text: [
      `[glo] 공동구매 일정 확정`,
      ``,
      `${opts.name}님, 신청하신 일정이 확정되었습니다.`,
      ``,
      `· 기간: ${opts.period}`,
      `· 수수료율: ${opts.rate}%`,
      `· 전용 링크: ${link}`,
      ``,
      `링크는 시작일부터 열립니다. 실시간 매출과 정산은 셀러 센터에서 확인하세요.`,
      `${SITE}/seller`,
    ].join("\n"),
  };
}

export function roundRejectedNotice(name: string, note?: string | null): SellerNotice {
  return {
    subject: "[glo] 일정 신청 결과 안내",
    templateEnvKey: "SOLAPI_TEMPLATE_ROUND_REJECTED",
    variables: { "#{이름}": name, "#{사유}": note ?? "-" },
    text: [
      `[glo] 일정 신청 결과 안내`,
      ``,
      `${name}님, 신청하신 일정은 이번에 진행이 어렵게 되었습니다.`,
      ...(note ? [``, `사유: ${note}`] : []),
      ``,
      `다른 기간으로 다시 신청하실 수 있습니다.`,
      `${SITE}/seller/apply`,
    ].join("\n"),
  };
}

/** 발송 (베스트 에포트) — 연락처가 없거나 실패해도 처리 자체는 막지 않는다. */
export function dispatchSellerNotice(
  phone: string | null | undefined,
  notice: SellerNotice,
): void {
  const to = normalizePhone(phone);
  if (!to) {
    console.warn(`[sellers] 연락처 없음 — 발송 생략 (${notice.subject})`);
    return;
  }
  void sendPlainNotice({ to, ...notice }).then((r) => {
    if (!r.ok) console.error(`[sellers] 발송 실패 (${notice.subject}, ${r.channel}):`, r.error);
  });
}
