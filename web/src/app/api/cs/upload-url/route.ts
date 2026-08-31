import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * CS 채팅 이미지 첨부용 서명 업로드 URL 발급.
 * 브라우저가 스토리지(cs-media 버킷)에 직접 올린다 — Vercel 4.5MB 제한 우회,
 * 리뷰 미디어(/api/reviews/upload-url)와 같은 패턴.
 *
 * 접근권은 대화 client_token — 토큰이 유효한 대화에만 발급하고,
 * 경로를 conversationId/uuid.ext 로 서버가 정하므로 경로 위조가 불가하다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as {
    token?: string;
    contentType?: string;
  };
  const token = typeof b.token === "string" && UUID_RE.test(b.token) ? b.token : null;
  const ext = ALLOWED[String(b.contentType ?? "")];
  if (!token) return NextResponse.json({ error: "대화 정보가 없습니다." }, { status: 400 });
  if (!ext)
    return NextResponse.json({ error: "jpg·png·webp·gif 이미지만 첨부할 수 있습니다." }, { status: 400 });

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("cs_conversations")
    .select("id")
    .eq("client_token", token)
    .maybeSingle<{ id: string }>();
  if (!conv) return NextResponse.json({ error: "대화를 찾을 수 없습니다." }, { status: 404 });

  const path = `${conv.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("cs-media").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[cs/upload-url] failed:", error?.message);
    return NextResponse.json({ error: "업로드 준비에 실패했습니다." }, { status: 500 });
  }

  const publicUrl = admin.storage.from("cs-media").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl });
}
