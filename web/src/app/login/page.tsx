"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? "로그인에 실패했어요. 잠시 후 다시 시도해주세요." : null,
  );

  async function signInWithKakao() {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const next = params.get("next") ?? "/";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: "account_email",
      },
    });
    if (error) {
      console.error("[login] Kakao OAuth failed:", error);
      setError("로그인에 실패했어요. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
    // On success the browser redirects to Kakao; nothing runs after this.
  }

  return (
    <main
      id="main"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-1 px-6 py-32"
    >
      {/* Soft atmospheric glows */}
      <div className="pointer-events-none absolute -left-24 -top-32 h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(212,181,181,0.4),transparent_65%)]" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(184,135,135,0.28),transparent_70%)]" />

      <div className="relative z-10 w-full max-w-md rounded-[18px] border border-burg-50/40 bg-[rgba(255,250,250,0.78)] p-12 shadow-[0_24px_60px_rgba(58,26,34,0.1)] backdrop-blur-xl">
        <div className="flex justify-center">
          <Link href="/" className="font-display text-4xl font-light tracking-tight text-ink">
            glo<span className="italic text-accent">.</span>
          </Link>
        </div>

        <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-[1.8px] text-ink-mute">
          <span className="mr-2 inline-block h-px w-6 bg-accent align-middle" />
          Sign in
        </p>
        <h1 className="mt-3 text-center font-sans text-4xl font-light text-accent">
          반가워요.
        </h1>
        <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
          카카오 계정으로 1초 만에 로그인하세요.
          <br />
          별도의 회원가입 절차가 없습니다.
        </p>

        <button
          onClick={signInWithKakao}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#FEE500] px-5 py-4 text-[15.5px] font-semibold text-black/85 transition hover:bg-[#FDDC00] disabled:cursor-wait disabled:opacity-70"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#191919"
              d="M9 0.5C4.0294 0.5 0 3.694 0 7.625c0 2.5443 1.6731 4.7775 4.1719 6.029-.1813.6797-.661 2.474-.7563 2.864-.119.4856.1781.4794.375.349.1545-.1025 2.4575-1.668 3.453-2.346.5719.0848 1.1656.13 1.7563.13 4.9706 0 9-3.194 9-7.125S13.9706 0.5 9 0.5z"
            />
          </svg>
          <span>{loading ? "카카오로 이동 중…" : "카카오로 시작하기"}</span>
        </button>

        {error && (
          <p className="mt-4 rounded-xl border border-burg-50/45 bg-bg-3/55 px-4 py-3 text-center text-sm text-burg-400">
            {error}
          </p>
        )}

        <p className="mt-7 text-center text-xs leading-relaxed text-ink-mute">
          로그인 시{" "}
          <Link href="/terms" className="border-b border-ink-line hover:border-accent hover:text-accent">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="border-b border-ink-line hover:border-accent hover:text-accent">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
