import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 본인 리뷰 수정 — 작성 후 24시간 이내 (docs/review-policy.md §5).
 * 별점·텍스트 수정 + 새 사진·영상 추가 가능 (기존 첨부는 삭제·교체 불가).
 * 새 미디어가 추가되면 검수 대기(pending, 블러)로 들어간다.
 * 관리자 검수(미디어 승인·반려)가 끝난 리뷰는 기한과 무관하게 수정할 수 없다.
 */

const EDIT_WINDOW_MS = 24 * 3600 * 1000;
const MAX_PHOTOS = 5;
const MAX_VIDEOS = 1;

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
    photos?: string[]; // 새로 추가하는 storage 경로
    videos?: string[];
  };
  const reviewId = String(b.reviewId ?? "");
  const rating = Number(b.rating);
  const text = String(b.body ?? "").trim();
  const newPhotoPaths = Array.isArray(b.photos) ? b.photos.map(String) : [];
  const newVideoPaths = Array.isArray(b.videos) ? b.videos.map(String) : [];

  if (!reviewId) return NextResponse.json({ error: "리뷰 정보가 없습니다." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json({ error: "별점을 선택해주세요." }, { status: 400 });
  if (text.length < 20 || text.length > 2000)
    return NextResponse.json({ error: "후기는 20자 이상 2,000자 이내여야 합니다." }, { status: 400 });

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, user_id, order_id, created_at, media_status, photos, videos")
    .eq("id", reviewId)
    .maybeSingle<{
      id: string;
      user_id: string | null;
      order_id: string | null;
      created_at: string;
      media_status: string;
      photos: string[];
      videos: string[];
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

  // 새 미디어 추가 — 기존 첨부 유지, 한도 내에서만, 경로 위조 방지
  const addingMedia = newPhotoPaths.length + newVideoPaths.length > 0;
  if (addingMedia) {
    if ((review.photos?.length ?? 0) + newPhotoPaths.length > MAX_PHOTOS)
      return NextResponse.json({ error: `사진은 최대 ${MAX_PHOTOS}장까지입니다.` }, { status: 400 });
    if ((review.videos?.length ?? 0) + newVideoPaths.length > MAX_VIDEOS)
      return NextResponse.json({ error: `영상은 최대 ${MAX_VIDEOS}개까지입니다.` }, { status: 400 });
    for (const p of [...newPhotoPaths, ...newVideoPaths]) {
      if (!review.order_id || !p.startsWith(`${review.order_id}/`) || p.includes(".."))
        return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
    }
  }
  const toUrl = (p: string) =>
    admin.storage.from("review-media").getPublicUrl(p).data.publicUrl;

  const update: Record<string, unknown> = {
    rating,
    body: text,
    edited_at: new Date().toISOString(),
  };
  if (addingMedia) {
    update.photos = [...(review.photos ?? []), ...newPhotoPaths.map(toUrl)];
    update.videos = [...(review.videos ?? []), ...newVideoPaths.map(toUrl)];
    update.media_status = "pending"; // 새 첨부는 검수 대기 (블러)
  }

  const { error } = await admin.from("reviews").update(update).eq("id", reviewId);
  if (error) return NextResponse.json({ error: "수정에 실패했습니다." }, { status: 500 });

  return NextResponse.json({ ok: true, pendingMedia: addingMedia });
}
