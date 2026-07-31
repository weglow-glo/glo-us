import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 300;

/**
 * 베스트 리뷰 — 제품 상세 단가표 바로 아래 섹션에 노출할 리뷰.
 * 선정은 app_settings.best_review_ids (uuid 배열, 노출 순서 그대로).
 * 체험단 8주 기록을 리뷰로 승격하며 도입 (2026-07-31).
 */
export async function GET() {
  const admin = createAdminClient();

  const { data: setting } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "best_review_ids")
    .maybeSingle<{ value: string[] }>();
  const ids = Array.isArray(setting?.value) ? setting.value : [];
  if (ids.length === 0) return NextResponse.json({ reviews: [] });

  const { data, error } = await admin
    .from("reviews")
    .select(
      "id, author_name, location, rating, body, helpful_up, helpful_down, review_date, photos, videos, media_status",
    )
    .in("id", ids)
    .eq("status", "approved");
  if (error) return NextResponse.json({ reviews: [] }, { status: 500 });

  // app_settings 배열 순서 = 노출 순서
  const byId = new Map((data ?? []).map((r) => [r.id, r]));
  const reviews = ids.map((id) => byId.get(id)).filter(Boolean);
  return NextResponse.json({ reviews });
}
