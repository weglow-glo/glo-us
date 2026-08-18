import { formatKRW } from "@/lib/product";
import { ROUND_REVENUE_STATUSES } from "@/lib/groupbuy";

/**
 * 기간 매출 분석 — 공구/자사몰 분리 아코디언(옵션별 수량·매출) + 일자별
 * 스택 막대 차트. 서버 렌더링(클라이언트 JS 없음, 아코디언은 <details>).
 *
 * 색은 dataviz 검증 통과 팔레트: 공구 #a04a55 · 자사몰 #d0885f
 * (CVD ΔE 17.9 · 라이트 바의 대비 부족은 아코디언 수치 표 + 툴팁으로 보완)
 */

export type AnalyticsOrder = {
  created_at: string;
  amount: number;
  status: string;
  round_id: string | null;
  order_name: string;
};

const GB_COLOR = "#a04a55";
const DIRECT_COLOR = "#d0885f";
const MAX_DAYS = 120;

function kstDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function shortDay(d: string): string {
  const [, m, dd] = d.split("-");
  return `${Number(m)}/${Number(dd)}`;
}

function optionBreakdown(list: AnalyticsOrder[]) {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const o of list) {
    const label = o.order_name.replace(/^glo GL-01\s*/, "") || o.order_name;
    const cur = map.get(label) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += o.amount;
    map.set(label, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
}

export default function RevenueAnalytics({
  rows,
  fromDate,
  toDate,
  note,
}: {
  rows: AnalyticsOrder[];
  /** 차트 구간 (YYYY-MM-DD, KST) */
  fromDate: string;
  toDate: string;
  /** 구간 설명 (예: "최근 30일") — 전체 누적일 때만 */
  note?: string;
}) {
  const settled = rows.filter((r) => ROUND_REVENUE_STATUSES.includes(r.status));
  const gb = settled.filter((r) => r.round_id != null);
  const direct = settled.filter((r) => r.round_id == null);
  const gbSum = gb.reduce((s, r) => s + r.amount, 0);
  const directSum = direct.reduce((s, r) => s + r.amount, 0);
  const total = gbSum + directSum;

  // 일자 나열 (KST) — 과도한 구간은 뒤에서부터 MAX_DAYS 로 자른다
  const days: string[] = [];
  let t = Date.parse(`${fromDate}T00:00:00+09:00`);
  const end = Date.parse(`${toDate}T00:00:00+09:00`);
  while (t <= end && days.length < 400) {
    days.push(new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }));
    t += 86400_000;
  }
  const clipped = days.length > MAX_DAYS;
  const chartDays = clipped ? days.slice(-MAX_DAYS) : days;

  const perDay = new Map<string, { gb: number; direct: number }>();
  for (const d of chartDays) perDay.set(d, { gb: 0, direct: 0 });
  for (const o of settled) {
    const d = perDay.get(kstDay(o.created_at));
    if (!d) continue;
    if (o.round_id != null) d.gb += o.amount;
    else d.direct += o.amount;
  }
  const maxTotal = Math.max(1, ...chartDays.map((d) => perDay.get(d)!.gb + perDay.get(d)!.direct));
  const avg = chartDays.length > 0 ? Math.round(total / chartDays.length) : 0;

  // x축 라벨 — 처음·끝 + 균등 간격 (최대 8개)
  const labelEvery = Math.max(1, Math.ceil(chartDays.length / 8));

  return (
    <section className="mt-6 rounded-xl border border-ink-line bg-bg-2 p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-ink">매출 분석</h2>
        <span className="text-xs text-ink-mute">
          {note ?? `${shortDay(fromDate)} ~ ${shortDay(toDate)}`} · 일평균 {formatKRW(avg)}
        </span>
      </div>

      {/* 채널 아코디언 — 펼치면 옵션별 수량·매출 */}
      <div className="mt-4 grid gap-2">
        <ChannelAccordion
          label="공구"
          color={GB_COLOR}
          sum={gbSum}
          count={gb.length}
          total={total}
          breakdown={optionBreakdown(gb)}
        />
        <ChannelAccordion
          label="자사몰"
          color={DIRECT_COLOR}
          sum={directSum}
          count={direct.length}
          total={total}
          breakdown={optionBreakdown(direct)}
        />
      </div>

      {/* 일자별 스택 막대 — 공구(아래) + 자사몰(위) */}
      {clipped && (
        <p className="mt-4 text-[11px] text-ink-mute">
          구간이 길어 최근 {MAX_DAYS}일만 차트에 표시합니다.
        </p>
      )}
      <div className="mt-4">
        <div className="flex h-40 items-end gap-[2px] border-b border-ink-line">
          {chartDays.map((d) => {
            const v = perDay.get(d)!;
            const gbH = (v.gb / maxTotal) * 100;
            const directH = (v.direct / maxTotal) * 100;
            const title = `${shortDay(d)} · 공구 ${formatKRW(v.gb)} · 자사몰 ${formatKRW(v.direct)} · 합 ${formatKRW(v.gb + v.direct)}`;
            return (
              <div
                key={d}
                title={title}
                className="flex h-full min-w-[3px] flex-1 flex-col justify-end"
              >
                {v.direct > 0 && (
                  <div
                    style={{ height: `${directH}%`, background: DIRECT_COLOR }}
                    className="rounded-t-[4px]"
                  />
                )}
                {v.gb > 0 && (
                  <div
                    style={{ height: `${gbH}%`, background: GB_COLOR }}
                    className={v.direct > 0 ? "mt-[2px]" : "rounded-t-[4px]"}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-[2px]">
          {chartDays.map((d, i) => (
            <div key={d} className="min-w-[3px] flex-1 text-center text-[10px] text-ink-mute">
              {i % labelEvery === 0 || i === chartDays.length - 1 ? shortDay(d) : ""}
            </div>
          ))}
        </div>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex items-center gap-4 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: GB_COLOR }} />
          공구
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: DIRECT_COLOR }}
          />
          자사몰
        </span>
        <span className="ml-auto text-[11px] text-ink-mute">
          결제완료·배송 단계 합산, 취소·환불 제외 · 막대에 마우스를 올리면 일자별 금액
        </span>
      </div>
    </section>
  );
}

function ChannelAccordion({
  label,
  color,
  sum,
  count,
  total,
  breakdown,
}: {
  label: string;
  color: string;
  sum: number;
  count: number;
  total: number;
  breakdown: Array<[string, { count: number; revenue: number }]>;
}) {
  const share = total > 0 ? Math.round((sum / total) * 100) : 0;
  return (
    <details className="rounded-lg border border-ink-line bg-bg-1">
      <summary className="flex cursor-pointer select-none flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
        <span className="font-sans text-lg text-ink">{formatKRW(sum)}</span>
        <span className="text-xs text-ink-mute">
          결제 {count}건 · 비중 {share}%
        </span>
        <span className="ml-auto text-xs text-ink-mute">옵션별 보기 ▾</span>
      </summary>
      <div className="border-t border-ink-line px-4 py-3">
        {breakdown.length === 0 ? (
          <p className="text-xs text-ink-mute">해당 기간 주문이 없습니다.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-mute">
                <th className="py-1.5 pr-4 font-medium">옵션</th>
                <th className="py-1.5 pr-4 text-right font-medium">수량</th>
                <th className="py-1.5 pr-4 text-right font-medium">매출</th>
                <th className="py-1.5 text-right font-medium">비중</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map(([opt, v]) => (
                <tr key={opt} className="border-t border-ink-line">
                  <td className="py-2 pr-4 text-ink">{opt}</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right text-ink">{v.count}건</td>
                  <td className="whitespace-nowrap py-2 pr-4 text-right text-ink">
                    {formatKRW(v.revenue)}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right text-ink-soft">
                    {sum > 0 ? Math.round((v.revenue / sum) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
