import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import { STATUS_LABEL, type OrderStatus } from "./status";
import { bulkTracking, bulkPrepareAll } from "./actions";

export const dynamic = "force-dynamic";

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "paid", label: "결제완료" },
  { key: "preparing", label: "배송준비중" },
  { key: "shipped", label: "배송중" },
  { key: "delivered", label: "배송완료" },
  { key: "pending", label: "결제대기" },
  { key: "failed", label: "실패" },
];

type Row = {
  id: string;
  order_id: string;
  status: OrderStatus;
  amount: number;
  quantity: number;
  customer_name: string | null;
  customer_phone: string | null;
  tracking_number: string | null;
  created_at: string;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = createAdminClient();

  const base = admin
    .from("orders")
    .select(
      "id, order_id, status, amount, quantity, customer_name, customer_phone, tracking_number, created_at",
    );
  const filtered = status ? base.eq("status", status) : base;
  const { data, error } = await filtered
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<Row[]>();
  const orders = data ?? [];

  // How many orders are awaiting fulfillment (for the bulk-prepare button).
  const { count: paidCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "paid");
  const exportHref = status ? `/admin/export?status=${status}` : "/admin/export";

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-light text-ink">
          주문 관리 <span className="text-sm text-ink-mute">({orders.length})</span>
        </h1>
        <a
          href={exportHref}
          className="rounded-full bg-burg-600 px-5 py-2.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
        >
          CSV 내보내기
        </a>
      </div>

      {/* Status filter */}
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (status ?? "") === f.key;
          return (
            <Link
              key={f.key || "all"}
              href={f.key ? `/admin?status=${f.key}` : "/admin"}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                active
                  ? "border-accent bg-accent text-cream"
                  : "border-ink-line text-ink-soft hover:border-accent"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {/* Bulk: move all paid orders → 배송준비중 */}
      <form
        action={bulkPrepareAll}
        className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-line bg-bg-2 px-5 py-4"
      >
        <div className="text-sm text-ink-soft">
          결제완료 <b className="text-ink">{paidCount ?? 0}건</b>을 한 번에 배송준비중으로 전환합니다.
        </div>
        <button
          disabled={!paidCount}
          className="rounded-full bg-burg-600 px-5 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          결제완료 → 배송준비중 일괄 전환
        </button>
      </form>

      {/* Bulk tracking registration */}
      <details className="mt-4 rounded-xl border border-ink-line bg-bg-2 p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          송장번호 일괄 등록
        </summary>
        <form action={bulkTracking} className="mt-4">
          <p className="mb-2 text-xs text-ink-mute">
            한 줄에 하나씩 <code className="font-mono">주문번호 송장번호</code> 형식으로 붙여넣으세요
            (공백·쉼표·탭 구분). 매칭된 주문은 <b>배송중</b>으로 바뀝니다.
          </p>
          <textarea
            name="bulk"
            rows={5}
            placeholder={"glo_1781601216910_42053f8c 1234567890\nglo_1781601206191_71a225da 6712345678"}
            className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
          />
          <button className="mt-3 rounded-full bg-burg-600 px-5 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
            일괄 등록 (배송중 처리)
          </button>
        </form>
      </details>

      {error && (
        <p className="mt-6 rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">
          주문을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-mute">
              <th className="py-3 pr-4">주문일시</th>
              <th className="py-3 pr-4">주문번호</th>
              <th className="py-3 pr-4">수령인</th>
              <th className="py-3 pr-4">연락처</th>
              <th className="py-3 pr-4">수량</th>
              <th className="py-3 pr-4">금액</th>
              <th className="py-3 pr-4">상태</th>
              <th className="py-3 pr-4">송장</th>
              <th className="py-3" />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const s = STATUS_LABEL[o.status] ?? STATUS_LABEL.pending;
              return (
                <tr key={o.id} className="border-b border-ink-line-2">
                  <td className="py-3 pr-4 text-ink-soft">{fmtDate(o.created_at)}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink-soft">{o.order_id}</td>
                  <td className="py-3 pr-4 text-ink">{o.customer_name ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-soft">{o.customer_phone ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink">{o.quantity}</td>
                  <td className="py-3 pr-4 text-ink">{formatKRW(o.amount)}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.className}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-soft">{o.tracking_number ?? "—"}</td>
                  <td className="py-3">
                    <Link href={`/admin/orders/${o.id}`} className="text-accent hover:underline">
                      상세
                    </Link>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-ink-mute">
                  주문이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
