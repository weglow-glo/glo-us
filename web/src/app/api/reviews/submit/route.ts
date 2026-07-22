import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRODUCT } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * 실구매 고객 리뷰 제출 (docs/review-policy.md).
 * 자격: 로그인 + 본인 주문 + 배송완료 + 완료 후 90일 이내 + 주문×상품당 1회.
 *
 * 텍스트는 즉시 게시(status=approved)하고 3,000P를 즉시 적립한다.
 * 사진·영상이 있으면 media_status=pending — 목록에는 블러 "검수 중"으로 노출되고,
 * 관리자 승인 시 블러 해제 + 2,000P 추가 적립된다.
 *
 * 미디어 파일은 /api/reviews/upload-url 로 받은 서명 URL로 브라우저가 스토리지에
 * 직접 올린 뒤, 여기에는 그 경로만 보낸다 (Vercel 4.5MB 제한 우회).
 */

const MAX_PHOTOS = 5;
const MAX_VIDEOS = 1;
const WINDOW_DAYS = 90;
const POINT_TEXT = 3000;

function maskName(raw: string | null | undefined): string {
  const n = String(raw ?? "").trim();
  if (!n) return "구매 고객";
  return `${n[0]} OO`;
}

/** '서울 중랑구 …' → '서울' */
function regionOf(addr: string | null | undefined): string | null {
  const t = String(addr ?? "").trim().split(/\s+/)[0] ?? "";
  return t ? t.replace(/특별시|광역시|특별자치.*/g, "") : null;
}

type Body = {
  orderId?: string;
  rating?: number;
  body?: string;
  photos?: string[]; // storage 경로 (orderId/uuid.ext)
  videos?: string[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const b = (await request.json().catch(() => ({}))) as Body;
  const orderId = String(b.orderId ?? "");
  const rating = Number(b.rating);
  const text = String(b.body ?? "").trim();
  const photoPaths = Array.isArray(b.photos) ? b.photos.map(String) : [];
  const videoPaths = Array.isArray(b.videos) ? b.videos.map(String) : [];

  if (!orderId) return NextResponse.json({ error: "주문 정보가 없습니다." }, { status: 400 });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return NextResponse.json({ error: "별점을 선택해주세요." }, { status: 400 });
  if (text.length < 20)
    return NextResponse.json({ error: "후기를 20자 이상 작성해주세요." }, { status: 400 });
  if (text.length > 2000)
    return NextResponse.json({ error: "후기는 2,000자 이내로 작성해주세요." }, { status: 400 });
  if (photoPaths.length > MAX_PHOTOS)
    return NextResponse.json({ error: `사진은 최대 ${MAX_PHOTOS}장까지입니다.` }, { status: 400 });
  if (videoPaths.length > MAX_VIDEOS)
    return NextResponse.json({ error: `영상은 최대 ${MAX_VIDEOS}개까지입니다.` }, { status: 400 });
  // 업로드 경로 위조 방지 — 본인 주문 폴더의 파일만 인정
  for (const p of [...photoPaths, ...videoPaths]) {
    if (!p.startsWith(`${orderId}/`) || p.includes(".."))
      return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
  }

  // 주문 검증 — RLS로 본인 주문만 조회된다.
  const { data: order } = await supabase
    .from("orders")
    .select("order_id, status, delivered_at, customer_name, shipping_address")
    .eq("order_id", orderId)
    .maybeSingle<{
      order_id: string;
      status: string;
      delivered_at: string | null;
      customer_name: string | null;
      shipping_address: { recipient?: string; address?: string } | null;
    }>();

  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (order.status !== "delivered")
    return NextResponse.json({ error: "배송완료된 주문만 리뷰를 작성할 수 있습니다." }, { status: 400 });
  if (order.delivered_at) {
    const age = Date.now() - Date.parse(order.delivered_at);
    if (age > WINDOW_DAYS * 86400000)
      return NextResponse.json(
        { error: `리뷰는 배송완료 후 ${WINDOW_DAYS}일 이내에만 작성할 수 있습니다.` },
        { status: 400 },
      );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("reviews")
    .select("id")
    .eq("order_id", orderId)
    .eq("product_code", PRODUCT.code)
    .maybeSingle();
  if (existing)
    return NextResponse.json({ error: "이미 이 주문의 리뷰를 작성하셨습니다." }, { status: 409 });

  const toUrl = (p: string) => admin.storage.from("review-media").getPublicUrl(p).data.publicUrl;
  const hasMedia = photoPaths.length + videoPaths.length > 0;

  const { data: inserted, error: insErr } = await admin
    .from("reviews")
    .insert({
      user_id: user.id,
      order_id: orderId,
      product_code: PRODUCT.code,
      author_name: maskName(order.shipping_address?.recipient ?? order.customer_name),
      location: regionOf(order.shipping_address?.address),
      rating,
      body: text,
      photos: photoPaths.map(toUrl),
      videos: videoPaths.map(toUrl),
      status: "approved",
      media_status: hasMedia ? "pending" : "none",
      source: "customer",
      review_date: new Date().toISOString().slice(0, 10),
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr || !inserted) {
    console.error("[reviews/submit] insert failed:", insErr?.message);
    return NextResponse.json({ error: "저장에 실패했습니다. 다시 시도해주세요." }, { status: 500 });
  }

  // 텍스트분 포인트 즉시 적립 (unique 제약이 중복을 막는다)
  const { error: ptErr } = await admin.from("points").insert({
    user_id: user.id,
    delta: POINT_TEXT,
    reason: "review_text",
    ref_id: inserted.id,
  });
  if (ptErr) console.error("[reviews/submit] point grant failed:", ptErr.message);

  return NextResponse.json({ ok: true, pendingMedia: hasMedia });
}
