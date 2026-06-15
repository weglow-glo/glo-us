import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CheckoutClient from "./checkout-client";

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

  return <CheckoutClient initialOption={option ?? "1m"} />;
}
