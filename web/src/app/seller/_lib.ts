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

export type SellerApplication = {
  id: string;
  status: "pending" | "approved" | "rejected";
  name: string;
  admin_note: string | null;
  created_at: string;
};

export type SellerGate =
  | { kind: "seller"; ctx: SellerContext }
  | {
      kind: "guest";
      userId: string;
      /** 지원 폼 프리필용 — 카카오 계정에서 가져온 이름/연락처 */
      defaultName: string;
      defaultPhone: string;
      /** 가장 최근 지원서 (없으면 null) */
      application: SellerApplication | null;
    };

/**
 * 대시보드용 게이트 — 셀러면 컨텍스트를, 아니면 지원서 상태를 돌려준다.
 * (셀러 지원 → 심사 중 → 승인/반려 흐름을 /seller 첫 화면에서 처리)
 */
export async function getSellerGate(): Promise<SellerGate> {
  // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
  if (groupbuyDemoMode()) {
    return {
      kind: "seller",
      ctx: { sellerId: "demo-seller-1", name: "엘리", userId: "demo-user-1" },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/seller")}`);

  const admin = createAdminClient();
  const { data: seller } = await admin
    .from("sellers")
    .select("id, name, active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (seller?.active) {
    return {
      kind: "seller",
      ctx: { sellerId: seller.id, name: seller.name, userId: user.id },
    };
  }

  const { data: app } = await admin
    .from("seller_applications")
    .select("id, status, name, admin_note, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SellerApplication>();

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  return {
    kind: "guest",
    userId: user.id,
    defaultName: meta.nickname || meta.name || meta.full_name || "",
    defaultPhone: meta.phone_number || meta.phone || "",
    application: app ?? null,
  };
}
