"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-full border border-ink-line px-5 py-2.5 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
    >
      로그아웃
    </button>
  );
}
