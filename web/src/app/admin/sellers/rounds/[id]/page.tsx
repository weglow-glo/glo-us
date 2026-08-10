import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import { ROUND_TYPE_LABEL, type RoundType } from "@/lib/groupbuy";
import { statusLabel } from "@/lib/order-status";
import {
  DEMO_ORDERS,
  DEMO_ROUNDS,
  DEMO_SELLERS,
  groupbuyDemoMode,
} from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type Round = {
  id: string;
  seller_id: string;
  round_no: number | null;
  type: RoundType;
  status: string;
  display_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  commission_rate: number | null;
  settle_due_at: string | null;
  settled_at: string | null;
  settled_amount: number | null;
};

type OrderRow = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  quantity: number;
  order_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  created_at: string;
};

function fmtDT(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 회차 상세 — 이 셀러 링크로 주문한 사람들만 모아서 (어드민 전용, 마스킹 없음) */
export default async function AdminRoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const demo = groupbuyDemoMode();

  let round: Round | null = null;
  let sellerName = "";
  let orders: OrderRow[] = [];

  if (demo) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    const r = DEMO_ROUNDS.find((d) => d.id === id);
    if (!r) notFound();
    round = r;
    sellerName = DEMO_SELLERS.find((s) => s.id === r.seller_id)?.name ?? "?";
    orders = DEMO_ORDERS.filter((o) => o.round_id === id)
      .map((o, i) => ({
        id: `demo-${i}`,
        order_id: `glo_demo_${String(i).padStart(4, "0")}`,
        status: o.status,
        amount: o.amount,
        quantity: o.quantity,
        order_name: o.order_name,
        customer_name: o.customer_name,
        customer_phone: "01000000000",
        customer_email: "demo@example.com",
        created_at: o.created_at,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    const admin = createAdminClient();
    const { data: r } = await admin
      .from("groupbuy_rounds")
      .select(
        "id, seller_id, round_no, type, status, display_name, starts_at, ends_at, commission_rate, settle_due_at, settled_at, settled_amount",
      )
      .eq("id", id)
      .maybeSingle<Round>();
    if (!r) notFound();
    round = r;

    const { data: seller } = await admin
      .from("sellers")
      .select("name")
      .eq("id", r.seller_id)
      .maybeSingle();
    sellerName = seller?.name ?? "?";

    const { data: orderRows } = await admin
      .from("orders")
      .select(
        "id, order_id, status, amount, quantity, order_name, customer_name, customer_phone, customer_email, created_at",
      )
      .eq("round_id", id)
      .order("created_at", { ascending: false })
      .limit(5000)
      .returns<OrderRow[]>();
    orders = orderRows ?? [];
  }

  const paid = orders.filter((o) => o.status === "paid");
  const lost = orders.filter((o) => ["canceled", "refunded"].includes(o.status));
  const paidSum = paid.reduce((s, o) => s + o.amount, 0);
  const lostSum = lost.reduce((s, o) => s + o.amount, 0);
  const rate = Number(round.commission_rate ?? 0);
  const buyers = new Set(paid.map((o) => o.customer_phone ?? o.customer_email ?? o.id)).size;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/admin/sellers" className="text-sm text-accent hover:underline">
        ← 셀러 · 공동구매 관리
      </Link>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-sans text-2xl font-light text-ink">
          {sellerName}
          {round.display_name && round.display_name !== sellerName
            ? ` (${round.display_name})`
            : ""}
        </h1>
        {round.round_no != null && (
          <span className="rounded-full bg-bg-3 px-2.5 py-0.5 text-xs font-bold text-accent">
            {round.round_no}차
          </span>
        )}
        <span className="text-sm text-ink-mute">{ROUND_TYPE_LABEL[round.type]}</span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {fmtDT(round.starts_at)} ~ {fmtDT(round.ends_at)} · 수수료율 {rate}% · 정산 기준{" "}
        {round.settle_due_at
          ? new Date(round.settle_due_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
          : "—"}
      </p>
      {demo && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          로컬 데모 데이터입니다 — 프로덕션에서는 나타나지 않습니다.
        </p>
      )}

      {/* 집계 */}
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="매출 (결제완료)" value={formatKRW(paidSum)} sub={`${paid.length}건 · 구매자 ${buyers}명`} />
        <Stat label="취소·환불" value={lost.length > 0 ? `−${formatKRW(lostSum)}` : "—"} sub={lost.length > 0 ? `${lost.length}건` : ""} />
        <Stat label="수수료율" value={`${rate}%`} sub="" />
        <Stat
          label={round.settled_at ? "확정 정산액" : "예상 정산액"}
          value={formatKRW(round.settled_at ? (round.settled_amount ?? 0) : Math.round((paidSum * rate) / 100))}
          sub={round.settled_at ? `확정 ${fmtDT(round.settled_at)}` : "확정은 정산 기준일에"}
          highlight
        />
      </div>

      {/* 이 링크로 주문한 사람들 */}
      <h2 className="mt-8 font-sans text-lg text-ink">
        주문 회원 <span className="text-sm text-ink-mute">({orders.length}건)</span>
      </h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-line">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-ink-line bg-bg-2 text-left text-xs text-ink-mute">
              <th className="px-4 py-3">주문일시</th>
              <th className="px-4 py-3">주문자</th>
              <th className="px-4 py-3">연락처</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">구성</th>
              <th className="px-4 py-3 text-right">금액</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const s = statusLabel(o.status);
              return (
                <tr key={o.id} className="border-b border-ink-line last:border-0">
                  <td className="px-4 py-3 text-ink-soft">{fmtDT(o.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{o.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{o.customer_phone ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">{o.customer_email ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    {o.order_name.replace(/^glo GL-01\s*/, "")}
                  </td>
                  <td className="px-4 py-3 text-right text-ink">{formatKRW(o.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${s.className}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!demo && (
                      <Link href={`/admin/orders/${o.id}`} className="text-accent hover:underline">
                        상세
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-mute">
                  아직 이 링크로 들어온 주문이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-transparent bg-bg-3" : "border-ink-line bg-bg-2"}`}>
      <p className="text-xs font-medium text-ink-mute">{label}</p>
      <p className={`mt-1 font-sans text-xl ${highlight ? "text-burg-400" : "text-ink"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-mute">{sub}</p>}
    </div>
  );
}
