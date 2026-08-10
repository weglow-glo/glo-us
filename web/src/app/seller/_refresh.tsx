"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** 대시보드 자동 갱신 — 30초 주기 router.refresh() + 수동 버튼 */
export default function AutoRefresh() {
  const router = useRouter();
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    setAt(new Date());
    const id = setInterval(() => {
      router.refresh();
      setAt(new Date());
    }, 30_000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="flex items-center gap-2 text-xs text-ink-mute">
      {at && (
        <span>
          {at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{" "}
          기준 · 30초마다 갱신
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setAt(new Date());
        }}
        className="rounded-full border border-ink-line px-3 py-1 font-medium text-ink-soft transition hover:border-accent hover:text-accent"
      >
        새로고침
      </button>
    </div>
  );
}
