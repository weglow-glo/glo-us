"use client";

import { useRouter } from "next/navigation";

/** 주문관리 날짜 필터 — 기본은 오늘(KST), 날짜 선택 또는 전체 누적 보기 */
export default function DateFilter({
  date,
  status,
}: {
  /** 선택된 날짜 (YYYY-MM-DD) — null 이면 전체 누적 */
  date: string | null;
  status?: string;
}) {
  const router = useRouter();
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  const nav = (d: string | null) => {
    const qs = new URLSearchParams();
    qs.set("date", d ?? "all");
    if (status) qs.set("status", status);
    router.replace(`/admin?${qs.toString()}`);
  };

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm transition ${
      active
        ? "border-accent bg-accent text-cream"
        : "border-ink-line text-ink-soft hover:border-accent"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={date ?? ""}
        max={todayKst}
        onChange={(e) => nav(e.target.value || null)}
        className="rounded-full border border-ink-line bg-bg-1 px-4 py-1.5 text-sm text-ink outline-none focus:border-accent"
      />
      <button type="button" onClick={() => nav(todayKst)} className={chip(date === todayKst)}>
        오늘
      </button>
      <button type="button" onClick={() => nav(null)} className={chip(date === null)}>
        전체 누적
      </button>
    </div>
  );
}
