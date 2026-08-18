"use client";

import { useRouter } from "next/navigation";

/** 주문관리 기간 필터 — 기본은 오늘(KST) 하루, 시작·종료일 자유 지정 또는 전체 누적 */
export default function DateFilter({
  from,
  to,
  status,
}: {
  /** 기간 시작/종료 (YYYY-MM-DD) — 둘 다 null 이면 전체 누적 */
  from: string | null;
  to: string | null;
  status?: string;
}) {
  const router = useRouter();
  const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });

  const nav = (f: string | null, t: string | null) => {
    // 한쪽만 비면 같은 날로 채우고, 순서가 뒤집히면 맞춰준다
    if (f && !t) t = f;
    if (!f && t) f = t;
    if (f && t && f > t) [f, t] = [t, f];
    const qs = new URLSearchParams();
    qs.set("from", f ?? "all");
    qs.set("to", t ?? "all");
    if (status) qs.set("status", status);
    router.replace(`/admin?${qs.toString()}`);
  };

  const chip = (active: boolean) =>
    `rounded-full border px-4 py-1.5 text-sm transition ${
      active
        ? "border-accent bg-accent text-cream"
        : "border-ink-line text-ink-soft hover:border-accent"
    }`;

  const input =
    "rounded-full border border-ink-line bg-bg-1 px-4 py-1.5 text-sm text-ink outline-none focus:border-accent";

  const isToday = from === todayKst && to === todayKst;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={from ?? ""}
        max={to ?? todayKst}
        onChange={(e) => nav(e.target.value || null, to)}
        className={input}
        aria-label="시작일"
      />
      <span className="text-sm text-ink-mute">~</span>
      <input
        type="date"
        value={to ?? ""}
        min={from ?? undefined}
        max={todayKst}
        onChange={(e) => nav(from, e.target.value || null)}
        className={input}
        aria-label="종료일"
      />
      <button type="button" onClick={() => nav(todayKst, todayKst)} className={chip(isToday)}>
        오늘
      </button>
      <button type="button" onClick={() => nav(null, null)} className={chip(from === null)}>
        전체 누적
      </button>
    </div>
  );
}
