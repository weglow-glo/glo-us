/**
 * 공동구매 회차 — 서버 전용 조회.
 *
 * URL 은 셀러당 하나(/product/@{sellers.handle})로 고정이고, 이 모듈이
 * "그 셀러의 지금 진행 중인 회차"를 찾아준다. 익명(anon) 클라이언트로
 * 조회한다: RLS(활성 셀러 + 승인된 회차) + 컬럼 권한이 공개 필드만
 * 통과시키므로 service_role 없이도 셀러 페이지가 뜬다.
 */
import { createClient } from "@/lib/supabase/server";
import {
  GROUPBUY_STANDARD_OPTIONS,
  isRoundLive,
  parseRoundOptions,
  type PublicRound,
  type RoundType,
} from "@/lib/groupbuy";

/** 로컬 개발용 데모 회차 — 프로덕션 빌드에서는 절대 활성화되지 않는다.
 *  DB 마이그레이션·시크릿 없이 /product/@demo 로 화면을 확인하기 위한 장치. */
const DEMO_ROUND: PublicRound = {
  id: "00000000-0000-0000-0000-000000000000",
  handle: "demo",
  displayName: "데모 셀러",
  type: "groupbuy",
  startsAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
  endsAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  options: GROUPBUY_STANDARD_OPTIONS,
  roundNo: 2,
};

function isDemoEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** 셀러 핸들로 "지금 진행 중인" 회차의 공개 정보를 조회.
 *  셀러가 없거나 비활성, 진행 중 회차가 없으면 null (→ 일반 페이지로). */
export async function fetchPublicRound(
  handle: string,
): Promise<PublicRound | null> {
  if (isDemoEnabled() && handle === "demo") return DEMO_ROUND;

  try {
    const supabase = await createClient();

    const { data: seller } = await supabase
      .from("sellers")
      .select("id, handle")
      .eq("handle", handle)
      .maybeSingle();
    if (!seller) return null;

    const { data: rounds } = await supabase
      .from("groupbuy_rounds")
      .select("id, display_name, type, status, starts_at, ends_at, options, round_no")
      .eq("seller_id", seller.id)
      .eq("status", "approved");

    const now = Date.now();
    const live = (rounds ?? [])
      .filter((r) => isRoundLive({ startsAt: r.starts_at, endsAt: r.ends_at }, now))
      // 겹치면 가장 늦게 시작한 회차 우선
      .sort((a, b) => Date.parse(b.starts_at ?? "") - Date.parse(a.starts_at ?? ""))[0];
    if (!live) return null;

    const options = parseRoundOptions(live.options);
    if (!options) return null;

    return {
      id: live.id,
      handle: seller.handle,
      displayName: live.display_name,
      type: (live.type as RoundType) ?? "groupbuy",
      startsAt: live.starts_at,
      endsAt: live.ends_at,
      options,
      roundNo: live.round_no ?? null,
    };
  } catch {
    // 테이블 미적용 등 — 회차 없음으로 처리 (일반 페이지로 흘려보낸다)
    return null;
  }
}
