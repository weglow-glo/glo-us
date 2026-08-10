import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { groupbuyDemoMode } from "@/lib/groupbuy-demo";

export type SellerContext = {
  sellerId: string;
  name: string;
  userId: string;
};

/**
 * /seller 공통 게이트 — 로그인 안 됐으면 /login 으로,
 * 로그인은 됐지만 셀러 승격이 안 된 계정이면 null (안내 화면 렌더).
 * 조회는 service_role 로 하되 세션의 user_id 로만 필터한다.
 */
export async function getSellerContext(): Promise<SellerContext | null> {
  // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
  if (groupbuyDemoMode()) {
    return { sellerId: "demo-seller-1", name: "엘리", userId: "demo-user-1" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/seller")}`);

  const admin = createAdminClient();
  const { data } = await admin
    .from("sellers")
    .select("id, name, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || !data.active) return null;
  return { sellerId: data.id, name: data.name, userId: user.id };
}
