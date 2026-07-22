"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * 리뷰 포인트 지급액 조정 (docs/points-policy.md).
 * 이미 지급된 포인트에는 영향이 없고, 저장 시점 이후의 지급부터 적용된다.
 */
export async function updatePointPolicy(formData: FormData) {
  const text = Math.floor(Number(formData.get("review_text")));
  const media = Math.floor(Number(formData.get("review_media")));
  if (!Number.isFinite(text) || text < 0 || text > 100000) return;
  if (!Number.isFinite(media) || media < 0 || media > 100000) return;

  const admin = createAdminClient();
  await admin.from("app_settings").upsert({
    key: "point_policy",
    value: { review_text: text, review_media: media },
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin/points");
}
