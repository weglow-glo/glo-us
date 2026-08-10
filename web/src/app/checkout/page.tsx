import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicRound } from "@/lib/groupbuy-server";
import { isRoundLive } from "@/lib/groupbuy";
import CheckoutClient from "./checkout-client";

export const metadata = { robots: { index: false, follow: false } };

// Require login before checkout. Unauthenticated visitors go to /login and
// return to this exact URL (option preserved) after signing in.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ option?: string; round?: string }>;
}) {
  const { option, round: roundHandle } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const qs = new URLSearchParams();
    if (option) qs.set("option", option);
    if (roundHandle) qs.set("round", roundHandle);
    const next = "/checkout" + (qs.size > 0 ? `?${qs}` : "");
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // 공구·협찬 회차 — 서버에서 검증해서 통과한 회차만 클라이언트에 넘긴다.
  // 핸들이 틀렸거나 기간이 끝났으면 일반 체크아웃으로 조용히 전환.
  let round = null;
  if (roundHandle) {
    const r = await fetchPublicRound(roundHandle.toLowerCase());
    if (r && isRoundLive(r)) {
      round = {
        handle: r.handle,
        displayName: r.displayName,
        type: r.type,
        options: r.options,
      };
    }
  }

  // Prefill what Kakao actually shares: nickname + account email. Phone and
  // shipping address require extra approved consent scopes we don't request yet.
  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const defaultName =
    meta.nickname || meta.name || meta.full_name || meta.preferred_username || "";
  const defaultPhone = meta.phone_number || meta.phone || "";
  const accountEmail = user.email ?? meta.email ?? "";

  return (
    <CheckoutClient
      initialOption={option ?? "1m"}
      round={round}
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      accountEmail={accountEmail}
    />
  );
}
