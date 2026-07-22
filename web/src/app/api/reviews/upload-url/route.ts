import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 리뷰 미디어 직접 업로드용 서명 URL 발급.
 * 파일이 서버(Vercel)를 거치면 4.5MB 제한에 걸리므로, 브라우저가 스토리지에
 * 직접 올린다. 형식·용량은 버킷 설정(50MB, 이미지/영상 MIME)이 최종 방어선.
 */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { orderId, contentType } = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    contentType?: string;
  };
  if (!orderId) return NextResponse.json({ error: "주문 정보가 없습니다." }, { status: 400 });
  if (!contentType || (!IMAGE_TYPES.has(contentType) && !VIDEO_TYPES.has(contentType)))
    return NextResponse.json({ error: "허용되지 않는 파일 형식입니다." }, { status: 400 });

  // 본인 주문인지 확인 (RLS)
  const { data: order } = await supabase
    .from("orders")
    .select("order_id")
    .eq("order_id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });

  const path = `${orderId}/${crypto.randomUUID()}.${EXT[contentType]}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("review-media")
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[reviews/upload-url]", error?.message);
    return NextResponse.json({ error: "업로드 준비에 실패했습니다." }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("review-media").getPublicUrl(path);
  return NextResponse.json({
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: pub.publicUrl,
    kind: IMAGE_TYPES.has(contentType) ? "image" : "video",
  });
}
