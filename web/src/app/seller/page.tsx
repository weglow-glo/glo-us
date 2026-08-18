import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import {
  isRoundLive,
  isRoundRevenue,
  maskName,
  parseRoundOptions,
  ROUND_TYPE_LABEL,
  type RoundType,
} from "@/lib/groupbuy";
import { getSellerGate } from "./_lib";
import NotSeller from "./_not-seller";
import AutoRefresh from "./_refresh";
import { DEMO_ORDERS, DEMO_ROUNDS, groupbuyDemoMode } from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type RoundRow = {
  id: string;
  type: RoundType;
  status: string;
  handle: string | null;
  round_no: number | null;
  display_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  options: unknown;
  commission_rate: number | null;
  settle_due_at: string | null;
  settled_at: string | null;
  request_note: string | null;
  admin_note: string | null;
};

type OrderRow = {
  round_id: string;
  status: string;
  amount: number;
  quantity: number;
  customer_name: string | null;
  order_name: string;
  approved_at: string | null;
  created_at: string;
};

function fmtDT(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 오늘 0시(KST) 이후인지 */
function isTodayKST(iso: string | null): boolean {
  if (!iso) return false;
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const midnightKst =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) -
    9 * 3600_000;
  return Date.parse(iso) >= midnightKst;
}

/** 셀러 대시보드 — 진행 중 회차의 실시간 매출과 예상 정산액 */
export default async function SellerDashboard() {
  const gate = await getSellerGate();
  if (gate.kind === "guest") {
    return (
      <NotSeller
        application={gate.application}
        defaultName={gate.defaultName}
        defaultPhone={gate.defaultPhone}
      />
    );
  }
  const ctx = gate.ctx;

  const demo = groupbuyDemoMode();
  let rounds: RoundRow[] = [];
  let orders: OrderRow[] = [];

  if (demo) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    rounds = DEMO_ROUNDS.filter((r) => r.seller_id === ctx.sellerId);
    const ids = new Set(rounds.map((r) => r.id));
    orders = DEMO_ORDERS.filter((o) => ids.has(o.round_id)).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  } else {
    const admin = createAdminClient();
    const { data: roundRows } = await admin
      .from("groupbuy_rounds")
      .select(
        "id, type, status, handle, round_no, display_name, starts_at, ends_at, options, commission_rate, settle_due_at, settled_at, request_note, admin_note",
      )
      .eq("seller_id", ctx.sellerId)
      .order("created_at", { ascending: false })
      .returns<RoundRow[]>();
    rounds = roundRows ?? [];

    const roundIds = rounds.map((r) => r.id);
    if (roundIds.length > 0) {
      const { data } = await admin
        .from("orders")
        .select("round_id, status, amount, quantity, customer_name, order_name, approved_at, created_at")
        .in("round_id", roundIds)
        .order("created_at", { ascending: false })
        .limit(2000)
        .returns<OrderRow[]>();
      orders = data ?? [];
    }
  }

  const live = rounds.filter(
    (r) =>
      r.status === "approved" &&
      isRoundLive({ startsAt: r.starts_at, endsAt: r.ends_at }),
  );
  const upcoming = rounds.filter(
    (r) =>
      r.status === "approved" &&
      r.starts_at &&
      Date.now() < Date.parse(r.starts_at),
  );
  const requested = rounds.filter((r) => r.status === "requested");

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl font-light text-ink">
            {ctx.name}님의 대시보드
          </h1>
          <p className="mt-1 text-sm text-ink-mute">
            매출은 결제완료(배송 단계 포함) 기준이며, 취소·환불은 자동 차감 표시됩니다.
          </p>
        </div>
        <AutoRefresh />
      </div>
      {demo && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          로컬 데모 데이터입니다 — 화면 확인용이며 실제 매출이 아닙니다. 프로덕션에서는
          나타나지 않습니다.
        </p>
      )}

      {live.length === 0 && upcoming.length === 0 && requested.length === 0 && (
        <div className="mt-10 rounded-xl border border-dashed border-ink-line p-10 text-center">
          <p className="text-sm text-ink-soft">진행 중인 회차가 없습니다.</p>
          <a
            href="/seller/apply"
            className="mt-4 inline-block rounded-full bg-burg-600 px-6 py-2.5 text-sm font-semibold text-bg-1 hover:bg-burg-400"
          >
            공동구매 일정 신청하기
          </a>
        </div>
      )}

      {requested.length > 0 && (
        <section className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-5">
          <h2 className="text-sm font-semibold text-ink">승인 대기 중인 신청</h2>
          {requested.map((r) => (
            <p key={r.id} className="mt-2 text-sm text-ink-soft">
              {fmtDT(r.starts_at)} ~ {fmtDT(r.ends_at)}
              {r.request_note ? ` · ${r.request_note}` : ""} —{" "}
              <span className="text-accent">운영팀 확인 중</span>
            </p>
          ))}
        </section>
      )}

      {[...live, ...upcoming].map((r) => {
        const ro = orders.filter((o) => o.round_id === r.id);
        const paid = ro.filter((o) => isRoundRevenue(o.status));
        const lost = ro.filter((o) => o.status === "canceled" || o.status === "refunded");
        const paidSum = paid.reduce((s, o) => s + o.amount, 0);
        const lostSum = lost.reduce((s, o) => s + o.amount, 0);
        const sachets = paid.reduce((s, o) => s + o.quantity * 30, 0);
        const todaySum = paid
          .filter((o) => isTodayKST(o.approved_at ?? o.created_at))
          .reduce((s, o) => s + o.amount, 0);
        const rate = Number(r.commission_rate ?? 0);
        const est = Math.round((paidSum * rate) / 100);
        const isLive = live.includes(r);
        const opts = parseRoundOptions(r.options) ?? [];
        const recent = ro.slice(0, 15);

        return (
          <section key={r.id} className="mt-8 rounded-xl border border-ink-line p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {ROUND_TYPE_LABEL[r.type]}{r.round_no != null ? ` ${r.round_no}차` : ""} · {fmtDT(r.starts_at)} ~ {fmtDT(r.ends_at)}{" "}
                  {isLive ? (
                    <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-cream">
                      LIVE
                    </span>
                  ) : (
                    <span className="ml-1 text-xs text-ink-mute">시작 전</span>
                  )}
                </p>
                {ctx.handle && (
                  <p className="mt-1 font-mono text-xs text-accent">
                    glo-us.com/product/@{ctx.handle}
                  </p>
                )}
              </div>
              <p className="text-xs text-ink-mute">
                정산 기준일 {fmtDate(r.settle_due_at)} · 수수료율 {rate}%
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="오늘 매출" value={formatKRW(todaySum)} />
              <Stat label="누적 매출" value={formatKRW(paidSum)} sub={`${paid.length}건 · ${sachets}포`} />
              <Stat
                label="취소·환불"
                value={lost.length > 0 ? `−${formatKRW(lostSum)}` : "0원"}
                sub={lost.length > 0 ? `${lost.length}건` : undefined}
              />
              <Stat label="예상 정산액" value={formatKRW(est)} sub="확정은 정산 기준일에" accent />
            </div>

            {opts.length > 0 && (
              <p className="mt-4 text-xs text-ink-mute">
                구성: {opts.map((o) => `${o.label} ${formatKRW(o.price)}`).join(" · ")}
              </p>
            )}

            {recent.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-lg border border-ink-line">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-line bg-bg-2 text-left text-xs text-ink-mute">
                      <th className="px-3 py-2">시각</th>
                      <th className="px-3 py-2">주문자</th>
                      <th className="px-3 py-2">구성</th>
                      <th className="px-3 py-2 text-right">금액</th>
                      <th className="px-3 py-2 text-right">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((o, i) => (
                      <tr key={i} className="border-b border-ink-line last:border-0">
                        <td className="px-3 py-2 text-xs text-ink-mute">
                          {new Date(o.approved_at ?? o.created_at).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-3 py-2 text-ink">{maskName(o.customer_name)}</td>
                        <td className="px-3 py-2 text-ink-soft">
                          {o.order_name.replace(/^glo GL-01\s*/, "")}
                        </td>
                        <td className="px-3 py-2 text-right text-ink">{formatKRW(o.amount)}</td>
                        <td className="px-3 py-2 text-right">
                          <OrderStatus status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg p-4 ${accent ? "bg-bg-3" : "bg-bg-2"}`}>
      <p className="text-xs font-medium text-ink-mute">{label}</p>
      <p className={`mt-1 font-sans text-lg ${accent ? "text-accent" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-mute">{sub}</p>}
    </div>
  );
}

function OrderStatus({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    paid: ["결제완료", "text-ink"],
    pending: ["대기", "text-ink-mute"],
    awaiting_deposit: ["입금대기", "text-ink-mute"],
    canceled: ["취소", "text-burg-400"],
    refunded: ["환불", "text-burg-400"],
    failed: ["실패", "text-ink-mute"],
  };
  const [label, cls] = map[status] ?? [status, "text-ink-mute"];
  return <span className={`text-xs font-medium ${cls}`}>{label}</span>;
}
