"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchSellerNotice, sellerApprovedNotice } from "@/lib/groupbuy-notices";

/**
 * 회원관리에서 직접 셀러 권한을 부여한다.
 * 카카오로 가입한 회원 계정에 sellers 행을 연결 — 이 순간부터 그 계정으로
 * /seller (일정 신청 · 실시간 매출 · 정산 내역) 접근이 가능해진다.
 * 회원 프로필에 연락처가 있으면 승인 안내(알림톡/문자)도 자동 발송된다.
 */
export async function grantSeller(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!userId) return;

  const admin = createAdminClient();

  // 안내 발송용 연락처 — 회원 프로필에서 가져온다 (없으면 발송 생략)
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, phone")
    .eq("id", userId)
    .maybeSingle();
  const sellerName = name || profile?.full_name || "이름 미입력";
  const phone = profile?.phone ?? null;

  // 과거에 연결됐다 해제된 계정이면 다시 활성화 (이력·정산 기록 보존)
  const { data: existing } = await admin
    .from("sellers")
    .select("id, phone")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("sellers")
      .update({ active: true, ...(phone && !existing.phone ? { phone } : {}) })
      .eq("id", existing.id);
  } else {
    await admin.from("sellers").insert({
      user_id: userId,
      name: sellerName,
      phone,
      active: true,
    });
  }

  dispatchSellerNotice(phone, sellerApprovedNotice(sellerName));

  revalidatePath("/admin/members");
  revalidatePath("/admin/sellers");
}

/**
 * 셀러 권한 해제 — active=false 로 포털 접근이 즉시 차단된다.
 * 셀러 행과 회차·정산 이력은 남는다 (삭제 아님).
 */
export async function revokeSeller(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return;

  const admin = createAdminClient();
  await admin.from("sellers").update({ active: false }).eq("user_id", userId);

  revalidatePath("/admin/members");
  revalidatePath("/admin/sellers");
}
