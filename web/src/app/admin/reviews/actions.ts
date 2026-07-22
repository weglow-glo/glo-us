"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/** 미디어 검수 승인 시 추가 지급 포인트 (텍스트 3,000P는 제출 시 이미 지급됨) */
const POINT_MEDIA = 2000;

/** 사진·영상 검수 승인 → 블러 해제 + 2,000P 추가 지급 */
export async function approveMedia(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, user_id, media_status")
    .eq("id", id)
    .maybeSingle<{ id: string; user_id: string | null; media_status: string }>();
  if (!review || review.media_status !== "pending") return;

  const { error } = await admin
    .from("reviews")
    .update({ media_status: "approved" })
    .eq("id", id);
  if (error) return;

  // points_ref_reason_uidx가 중복 지급을 막는다.
  if (review.user_id) {
    await admin.from("points").insert({
      user_id: review.user_id,
      delta: POINT_MEDIA,
      reason: "review_media",
      ref_id: id,
    });
  }

  revalidatePath("/admin/reviews");
}

/** 미디어 반려 — 미디어만 숨기고 텍스트 리뷰는 유지. 추가 포인트 없음. */
export async function rejectMedia(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("reviews")
    .update({ media_status: "rejected" })
    .eq("id", id)
    .eq("media_status", "pending");

  revalidatePath("/admin/reviews");
}

/** 리뷰 숨김/복구 — 금지 표현·비방 등 정책 사유로만 사용할 것. */
export async function toggleHidden(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!id || !["approved", "hidden"].includes(to)) return;

  const admin = createAdminClient();
  await admin.from("reviews").update({ status: to }).eq("id", id);
  revalidatePath("/admin/reviews");
}

/** 리뷰 삭제 (관리자 전용 — 고객은 삭제 불가). 지급된 포인트는 회수하지 않는다. */
export async function deleteReview(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("reviews").delete().eq("id", id).eq("source", "customer");
  revalidatePath("/admin/reviews");
}
