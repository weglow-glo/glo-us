import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import { ROUND_TYPE_LABEL, type RoundType } from "@/lib/groupbuy";
import { redirect } from "next/navigation";
import { getSellerContext } from "../_lib";
import { DEMO_ORDERS, DEMO_ROUNDS, groupbuyDemoMode } from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type RoundRow = {
  id: string;
  type: RoundType;
  status: string;
  handle: string | null;
  round_no: number | null;
  starts_at: string | null;
  ends_at: string | null;
  commission_rate: number | null;
  settle_due_at: string | null;
  settled_at: string | null;
  settled_amount: number | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 정산 내역 — 회차별 매출·차감·수수료율·정산액 */
export default async function SellerSettlementsPage() {
  const ctx = await getSellerContext();
  if (!ctx) redirect("/seller");

  const demo = groupbuyDemoMode();
  let rounds: RoundRow[] = [];
  let orderRows: Array<{ round_id: string | null; status: string; amount: number }> = [];

  if (demo) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    rounds = DEMO_ROUNDS.filter(
      (r) => r.seller_id === ctx.sellerId && ["approved", "ended"].includes(r.status),
    );
    const ids = new Set(rounds.map((r) => r.id));
    orderRows = DEMO_ORDERS.filter((o) => ids.has(o.round_id));
  } else {
    const admin = createAdminClient();
    const { data: roundRowsData } = await admin
      .from("groupbuy_rounds")
      .select(
        "id, type, status, handle, round_no, starts_at, ends_at, commission_rate, settle_due_at, settled_at, settled_amount",
      )
      .eq("seller_id", ctx.sellerId)
      .in("status", ["approved", "ended"])
      .order("ends_at", { ascending: false })
      .returns<RoundRow[]>();
    rounds = roundRowsData ?? [];

    const roundIds = rounds.map((r) => r.id);
    if (roundIds.length > 0) {
      const { data } = await admin
        .from("orders")
        .select("round_id, status, amount")
        .in("round_id", roundIds)
        .limit(100000);
      orderRows = data ?? [];
    }
  }

  const paidByRound = new Map<string, { sum: number; count: number }>();
  const lostByRound = new Map<string, { sum: number; count: number }>();
  {
    for (const o of orderRows) {
      if (!o.round_id) continue;
      if (o.status === "paid") {
        const a = paidByRound.get(o.round_id) ?? { sum: 0, count: 0 };
        a.sum += o.amount ?? 0;
        a.count += 1;
        paidByRound.set(o.round_id, a);
      } else if (o.status === "canceled" || o.status === "refunded") {
        const a = lostByRound.get(o.round_id) ?? { sum: 0, count: 0 };
        a.sum += o.amount ?? 0;
        a.count += 1;
        lostByRound.set(o.round_id, a);
      }
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-sans text-2xl font-light text-ink">정산 내역</h1>
      <p className="mt-1 text-sm text-ink-mute">
        정산액은 회차 종료 21일 후, 그 시점의 결제완료 주문 × 수수료율로 확정됩니다.
        확정 전 금액은 예상치이며 취소·환불에 따라 달라질 수 있습니다.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-line bg-bg-2 text-left text-xs text-ink-mute">
              <th className="px-4 py-3">회차</th>
              <th className="px-4 py-3">기간</th>
              <th className="px-4 py-3 text-right">매출 (paid)</th>
              <th className="px-4 py-3 text-right">취소·환불 차감</th>
              <th className="px-4 py-3 text-right">수수료율</th>
              <th className="px-4 py-3 text-right">정산액</th>
              <th className="px-4 py-3 text-right">상태</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => {
              const paid = paidByRound.get(r.id) ?? { sum: 0, count: 0 };
              const lost = lostByRound.get(r.id) ?? { sum: 0, count: 0 };
              const rate = Number(r.commission_rate ?? 0);
              const est = Math.round((paid.sum * rate) / 100);
              return (
                <tr key={r.id} className="border-b border-ink-line last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{ROUND_TYPE_LABEL[r.type]}</p>
                    {r.round_no != null && (
                      <p className="text-xs font-semibold text-accent">{r.round_no}차</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {fmtDate(r.starts_at)} ~ {fmtDate(r.ends_at)}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">
                    {formatKRW(paid.sum)}
                    <p className="text-[11px] text-ink-mute">{paid.count}건</p>
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft">
                    {lost.count > 0 ? `−${formatKRW(lost.sum)} · ${lost.count}건` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-soft">{rate}%</td>
                  <td className="px-4 py-3 text-right">
                    {r.settled_at ? (
                      <span className="font-semibold text-ink">
                        {formatKRW(r.settled_amount ?? 0)}
                      </span>
                    ) : (
                      <span className="text-ink-soft">예상 {formatKRW(est)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    {r.settled_at ? (
                      <span className="font-medium text-accent">
                        확정 {fmtDate(r.settled_at)}
                      </span>
                    ) : (
                      <span className="text-ink-mute">기준일 {fmtDate(r.settle_due_at)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rounds.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-mute">
                  아직 정산 대상 회차가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
