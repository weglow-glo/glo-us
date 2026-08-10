"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/notify";

/**
 * 셀러 지원 — 로그인한 회원이 심사 신청서를 낸다.
 * pending 은 계정당 1건 (DB unique index) — 중복 제출은 조용히 무시된다.
 */
export async function applyForSeller(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/seller")}`);

  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const channel = String(formData.get("channel") ?? "").trim().slice(0, 300);
  if (!name || !phone || !channel) return;

  const admin = createAdminClient();

  // 이미 셀러인 계정이면 지원서가 아니라 대시보드로
  const { data: seller } = await admin
    .from("sellers")
    .select("id, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (seller?.active) redirect("/seller");

  await admin.from("seller_applications").insert({
    user_id: user.id,
    name,
    phone,
    channel,
    follower: String(formData.get("follower") ?? "").trim().slice(0, 100) || null,
    note: String(formData.get("note") ?? "").trim().slice(0, 1000) || null,
  });
  // pending 중복(unique 위반)은 무시 — 어차피 심사 중 화면으로 간다

  revalidatePath("/seller");
  redirect("/seller");
}

/**
 * 셀러 일정 신청 — 서버 액션은 세션에서 셀러를 다시 확인한다
 * (클라이언트가 보낸 seller_id 는 절대 신뢰하지 않는다).
 */
export async function requestRound(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fseller%2Fapply");

  const admin = createAdminClient();
  const { data: seller } = await admin
    .from("sellers")
    .select("id, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!seller || !seller.active) return;

  const starts = String(formData.get("starts_at") ?? "").trim();
  const ends = String(formData.get("ends_at") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(starts) || !/^\d{4}-\d{2}-\d{2}$/.test(ends)) return;
  const startsAt = `${starts}T00:00:00+09:00`;
  const endsAt = `${ends}T23:59:59+09:00`;
  if (Date.parse(endsAt) <= Date.parse(startsAt)) return;
  if (Date.parse(startsAt) < Date.now() - 86400_000) return; // 과거 시작일 방지

  const note = String(formData.get("request_note") ?? "").trim().slice(0, 500);

  await admin.from("groupbuy_rounds").insert({
    seller_id: seller.id,
    type: "groupbuy",
    status: "requested",
    starts_at: startsAt,
    ends_at: endsAt,
    request_note: note || null,
  });

  revalidatePath("/seller");
  redirect("/seller");
}
