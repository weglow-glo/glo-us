"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantPoints } from "@/lib/points";

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

/**
 * 포인트 수기 지급/차감 — 보상·CS 보정용 (docs/points-policy.md §4 관리자 조정).
 *
 * 이메일로 회원을 찾아 grantPoints 로 적립 로트를 만든다. ref_id 는
 * 타임스탬프 기반이라 같은 사람에게 여러 번 지급할 수 있고, 중복 클릭은
 * (ref_id, reason) 유니크 인덱스가 막는다. 차감(음수)은 로트를 만들지
 * 않고 이력 행만 남긴다 — 잔액 차감은 FIFO 함수가 담당하기 때문.
 */
export async function grantPointsManual(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const amount = Math.floor(Number(formData.get("amount")));
  const memo = String(formData.get("memo") ?? "").trim().slice(0, 200);

  if (!email || !Number.isFinite(amount) || amount === 0) {
    redirect("/admin/points?grant=invalid");
  }
  if (Math.abs(amount) > 1000000) redirect("/admin/points?grant=toobig");

  const admin = createAdminClient();

  // 이메일 → 회원. profiles 에 없으면 auth 쪽에서 한 번 더 찾는다.
  let userId: string | null = null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  userId = profile?.id ?? null;

  if (!userId) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
  }
  if (!userId) redirect(`/admin/points?grant=notfound&email=${encodeURIComponent(email)}`);

  const refId = `manual_${Date.now()}`;
  if (amount > 0) {
    const r = await grantPoints(admin, {
      userId,
      delta: amount,
      reason: "admin_adjust",
      refId,
    });
    if (!r.ok) redirect(`/admin/points?grant=fail`);
  } else {
    // 차감은 이력 행만 (잔액은 만료·사용 로트로 관리)
    const { error } = await admin.from("points").insert({
      user_id: userId,
      delta: amount,
      remaining: 0,
      reason: "admin_adjust",
      ref_id: refId,
    });
    if (error) redirect(`/admin/points?grant=fail`);
  }

  if (memo) {
    console.info(`[points] 수기 조정 ${email} ${amount}P — ${memo} (${refId})`);
  }

  revalidatePath("/admin/points");
  redirect(`/admin/points?grant=ok&amount=${amount}&email=${encodeURIComponent(email)}`);
}
