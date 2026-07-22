import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import { STATUS_LABEL, type OrderStatus } from "../../status";
import { markShipped, markPreparing, markDelivered } from "../../actions";
import CancelOrder from "./cancel-order";

export const dynamic = "force-dynamic";

type ShippingAddress = {
  recipient?: string;
  phone?: string;
  postcode?: string;
  address?: string;
  detail?: string;
  memo?: string;
};

type Order = {
  id: string;
  order_id: string;
  status: OrderStatus;
  amount: number;
  used_points: number | null;
  quantity: number;
  product_code: string;
  order_name: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  payment_method: string | null;
  payment_key: string | null;
  approved_at: string | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—";
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", id)
    .single<Order>();

  if (!order) notFound();

  const s = STATUS_LABEL[order.status] ?? STATUS_LABEL.pending;
  const sa = order.shipping_address ?? {};

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← 주문 목록
      </Link>

      <div className="mt-4 flex items-center justify-between">
        <h1 className="font-sans text-3xl font-light text-ink">주문 상세</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${s.className}`}>
          {s.label}
        </span>
      </div>
      <p className="mt-2 font-mono text-sm text-ink-soft">{order.order_id}</p>

      <Section title="주문">
        <Row k="상품" v={`${order.order_name} (${order.product_code} × ${order.quantity})`} />
        {(order.used_points ?? 0) > 0 ? (
          <>
            <Row k="상품 금액" v={formatKRW(order.amount + (order.used_points ?? 0))} />
            <Row k="포인트 사용" v={`-${(order.used_points ?? 0).toLocaleString("ko-KR")}P`} />
            <Row k="실결제 금액" v={formatKRW(order.amount)} />
          </>
        ) : (
          <Row k="결제금액" v={formatKRW(order.amount)} />
        )}
        <Row k="주문일시" v={fmtDate(order.created_at)} />
      </Section>

      <Section title="배송지">
        <Row k="수령인" v={sa.recipient || order.customer_name || "—"} />
        <Row k="연락처" v={sa.phone || order.customer_phone || "—"} />
        <Row k="우편번호" v={sa.postcode || "—"} />
        <Row k="주소" v={[sa.address, sa.detail].filter(Boolean).join(" ") || "—"} />
        <Row k="배송메모" v={sa.memo || "—"} />
        <Row k="이메일" v={order.customer_email || "—"} />
      </Section>

      <Section title="결제">
        <Row k="결제수단" v={order.payment_method || "—"} />
        <Row k="승인일시" v={fmtDate(order.approved_at)} />
        <Row k="paymentKey" v={order.payment_key || "—"} mono />
      </Section>

      <Section title="배송 처리">
        <Row k="현재 상태" v={s.label} />
        <Row k="송장번호" v={order.tracking_number || "—"} />
        <Row k="발송일시" v={fmtDate(order.shipped_at)} />
        <Row k="배송완료일시" v={fmtDate(order.delivered_at)} />

        <div className="mt-4 flex flex-col gap-3 border-t border-ink-line pt-4">
          {/* 1) 배송준비중 */}
          <form action={markPreparing}>
            <input type="hidden" name="id" value={order.id} />
            <button className="rounded-md border border-ink-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent">
              배송준비중으로 표시
            </button>
          </form>

          {/* 2) 송장 등록 → 배송중 */}
          <form action={markShipped} className="flex items-end gap-2">
            <input type="hidden" name="id" value={order.id} />
            <label className="flex-1">
              <span className="mb-1 block text-xs text-ink-mute">송장번호</span>
              <input
                name="tracking"
                defaultValue={order.tracking_number ?? ""}
                placeholder="택배 송장번호"
                className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <button className="rounded-md bg-burg-600 px-4 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
              송장 등록 · 배송중
            </button>
          </form>

          {/* 3) 배송완료 */}
          <form action={markDelivered}>
            <input type="hidden" name="id" value={order.id} />
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-cream transition hover:bg-burg-400">
              배송완료 처리
            </button>
          </form>
        </div>
      </Section>

      {/* 결제 취소 / 환불 — only while a live Toss payment exists. */}
      {order.payment_key &&
        order.status !== "canceled" &&
        order.status !== "refunded" &&
        order.status !== "pending" &&
        order.status !== "failed" && (
          <section className="mt-8 rounded-xl border border-burg-400/40 bg-bg-2 p-6">
            <h2 className="mb-1 font-sans text-lg text-burg-400">결제 취소</h2>
            <p className="mb-4 text-xs text-ink-mute">
              토스에서 전액 환불 처리 후 주문을 ‘결제취소’ 상태로 바꿉니다. 되돌릴 수 없습니다.
            </p>
            <CancelOrder id={order.id} />
          </section>
        )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6">
      <h2 className="mb-3 font-sans text-lg text-ink">{title}</h2>
      <dl className="space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-mute">{k}</dt>
      <dd className={`text-right text-ink ${mono ? "font-mono text-xs break-all" : ""}`}>{v}</dd>
    </div>
  );
}
