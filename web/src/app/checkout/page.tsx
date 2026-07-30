import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CheckoutClient from "./checkout-client";

export const metadata = { robots: { index: false, follow: false } };

// Require login before checkout. Unauthenticated visitors go to /login and
// return to this exact URL (option preserved) after signing in.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ option?: string }>;
}) {
  const { option } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = "/checkout" + (option ? `?option=${option}` : "");
    redirect(`/login?next=${encodeURIComponent(next)}`);
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
      defaultName={defaultName}
      defaultPhone={defaultPhone}
      accountEmail={accountEmail}
    />
  );
}
