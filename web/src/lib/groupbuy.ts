/**
 * 공동구매·협찬 캠페인 — 클라이언트에서도 안전한 타입/헬퍼.
 * (서버 전용 조회는 lib/groupbuy-server.ts)
 *
 * 규칙 요약:
 *  - 매출 귀속은 회차(round) 단위. 셀러 페이지에서 시작한 체크아웃만 귀속.
 *  - 회차 주문은 포인트 적립·사용 모두 불가 (리뷰 포인트는 별도 경로라 그대로).
 *  - 정산 = 회차 종료 + 21일 시점의 paid 스냅샷 × 수수료율.
 */
import { PRODUCT } from "@/lib/product";

/** 회차 전용 옵션(전용상품) — groupbuy_rounds.options jsonb 의 원소 */
export type RoundOption = {
  key: string;
  months: number;
  label: string;
  /** 회차 확정가(KRW, 번들 전체) — 런칭 이벤트 등 일반가 로직의 영향을 받지 않는다 */
  price: number;
  /** 옵션 옆 강조 표기 (예: "베스트") */
  badge?: string;
};

/** 표준 공구 단가표 (2026-08-10 대표 확정) — 회차 생성 시 기본값.
 *  회차별로 수정 가능하며, 저장된 회차의 options 가 항상 우선한다. */
export const GROUPBUY_STANDARD_OPTIONS: RoundOption[] = [
  { key: "gb1", months: 1, label: "1개월 분", price: 83300 },
  { key: "gb2", months: 2, label: "2개월 분", price: 159460 },
  { key: "gb3", months: 3, label: "3개월 분", price: 228480, badge: "베스트" },
  { key: "gb5", months: 5, label: "5개월 분", price: 357000 },
  { key: "gb8", months: 8, label: "8개월 분", price: 523600 },
  { key: "gb10", months: 10, label: "10개월 분", price: 595000 },
  { key: "gb12", months: 12, label: "12개월 분", price: 642600 },
];

export type RoundType = "groupbuy" | "sponsored";

/** 익명 조회가 허용된 공개 필드만 (수수료율·정산 정보 없음) */
export type PublicRound = {
  id: string;
  handle: string;
  displayName: string | null;
  type: RoundType;
  startsAt: string | null;
  endsAt: string | null;
  options: RoundOption[];
};

export const ROUND_TYPE_LABEL: Record<RoundType, string> = {
  groupbuy: "공동구매",
  sponsored: "협찬",
};

/** 정산 유보 기간 — 회차 종료 후 취소·교환·환불이 잦아드는 기간 */
export const SETTLE_HOLD_DAYS = 21;

/** live 판정은 상태 컬럼이 아니라 시간으로 — 크론 없이 접속 시점에 결정 */
export function isRoundLive(
  round: { startsAt: string | null; endsAt: string | null },
  now: number = Date.now(),
): boolean {
  if (!round.startsAt || !round.endsAt) return false;
  return now >= Date.parse(round.startsAt) && now < Date.parse(round.endsAt);
}

/** options jsonb 검증 — 관리자 입력/DB 값 모두 이 게이트를 통과시킨다 */
export function parseRoundOptions(value: unknown): RoundOption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: RoundOption[] = [];
  for (const v of value) {
    const o = v as Partial<RoundOption>;
    if (
      typeof o?.key !== "string" ||
      !o.key ||
      typeof o?.months !== "number" ||
      o.months <= 0 ||
      typeof o?.label !== "string" ||
      !o.label ||
      typeof o?.price !== "number" ||
      !Number.isInteger(o.price) ||
      o.price < 100 // 토스 최소 결제금액
    ) {
      return null;
    }
    out.push({
      key: o.key,
      months: o.months,
      label: o.label,
      price: o.price,
      ...(typeof o.badge === "string" && o.badge ? { badge: o.badge } : {}),
    });
  }
  return out;
}

/** 정가(월 119,000원 기준) — 할인율 표기용 */
export function roundRegularOf(o: RoundOption): number {
  return o.months * PRODUCT.regularPrice;
}

export function roundDiscountOf(o: RoundOption): number {
  return Math.round((1 - o.price / roundRegularOf(o)) * 1000) / 10;
}

/** 셀러 화면용 이름 마스킹 — "김준호" → "김*호", "이엘" → "이*" */
export function maskName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (n.length <= 1) return n || "고객";
  if (n.length === 2) return `${n[0]}*`;
  return `${n[0]}${"*".repeat(n.length - 2)}${n[n.length - 1]}`;
}
