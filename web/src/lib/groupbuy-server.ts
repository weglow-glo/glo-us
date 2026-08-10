/**
 * 공동구매 회차 — 서버 전용 조회.
 * 익명(anon) 클라이언트로 조회한다: RLS(status='approved') + 컬럼 권한이
 * 공개 필드만 통과시키므로 service_role 없이도 셀러 페이지가 뜬다.
 */
import { createClient } from "@/lib/supabase/server";
import {
  GROUPBUY_STANDARD_OPTIONS,
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
};

function isDemoEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** handle 로 승인된 회차의 공개 정보를 조회. 없거나 비정상이면 null. */
export async function fetchPublicRound(
  handle: string,
): Promise<PublicRound | null> {
  if (isDemoEnabled() && handle === "demo") return DEMO_ROUND;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("groupbuy_rounds")
      .select("id, handle, display_name, type, status, starts_at, ends_at, options")
      .eq("handle", handle)
      .eq("status", "approved")
      .maybeSingle();

    if (error || !data) return null;

    const options = parseRoundOptions(data.options);
    if (!options) return null;

    return {
      id: data.id,
      handle: data.handle,
      displayName: data.display_name,
      type: (data.type as RoundType) ?? "groupbuy",
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      options,
    };
  } catch {
    // 테이블 미적용 등 — 회차 없음으로 처리 (일반 페이지로 흘려보낸다)
    return null;
  }
}
