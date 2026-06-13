"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function FailInner() {
  const params = useSearchParams();
  const message = params.get("message") ?? "결제가 취소되었거나 실패했습니다.";
  const code = params.get("code");

  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-bg-2 px-6 text-center"
    >
      <h1 className="font-display text-4xl font-light text-burg-400">결제 실패</h1>
      <p className="mt-4 max-w-sm text-sm text-ink-soft">{message}</p>
      {code && <p className="mt-1 text-xs text-ink-faint">오류 코드: {code}</p>}
      <Link
        href="/checkout"
        className="mt-10 inline-block rounded-full bg-burg-600 px-8 py-4 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
      >
        다시 시도하기
      </Link>
    </main>
  );
}

export default function FailPage() {
  return (
    <Suspense fallback={null}>
      <FailInner />
    </Suspense>
  );
}
