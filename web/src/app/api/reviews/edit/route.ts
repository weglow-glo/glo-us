import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 본인 리뷰 수정 — 작성 후 24시간 이내, 별점·텍스트만 (미디어 교체 불가).
 * 관리자 검수(미디어 승인·반려)가 끝난 리뷰는 기한과 무관하게 수정할 수 없다.
 * 삭제는 불가능하며 관리자만 할 수 있다 (docs/review-policy.md §5).
 */

const EDIT_WINDOW_MS = 24 * 3600 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as {
    reviewId?: string;
    rating?: number;
    body?: string;
  };
  const reviewId = String(b.reviewId ?? "");
  const rating = Number(b.rating);
  const text = String(b.body ?? "").trim();

  if (!reviewId) return NextResponse.json({ error: "리뷰 정보가 없습니다." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json({ error: "별점을 선택해주세요." }, { status: 400 });
  if (text.length < 20 || text.length > 2000)
    return NextResponse.json({ error: "후기는 20자 이상 2,000자 이내여야 합니다." }, { status: 400 });

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, user_id, created_at, media_status")
    .eq("id", reviewId)
    .maybeSingle<{
      id: string;
      user_id: string | null;
      created_at: string;
      media_status: string;
    }>();

  if (!review || review.user_id !== user.id)
    return NextResponse.json({ error: "리뷰를 찾을 수 없습니다." }, { status: 404 });
  if (review.media_status === "approved" || review.media_status === "rejected")
    return NextResponse.json(
      { error: "검수가 완료된 리뷰는 수정할 수 없습니다." },
      { status: 400 },
    );
  if (Date.now() - Date.parse(review.created_at) > EDIT_WINDOW_MS)
    return NextResponse.json(
      { error: "리뷰는 작성 후 24시간 이내에만 수정할 수 있습니다." },
      { status: 400 },
    );

  const { error } = await admin
    .from("reviews")
    .update({ rating, body: text, edited_at: new Date().toISOString() })
    .eq("id", reviewId);
  if (error) return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
