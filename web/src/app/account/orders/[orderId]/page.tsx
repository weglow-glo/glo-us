import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatKRW } from "@/lib/product";
import { statusLabel, isCancelable, type OrderStatus } from "@/lib/order-status";
import CancelButton from "./cancel-button";

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
  order_id: string;
  order_name: string;
  product_code: string;
  quantity: number;
  status: OrderStatus;
  amount: number;
  payment_method: string | null;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/account/orders/${orderId}`);
  }

  // RLS (orders_select_own) ensures the user can only read their own order.
  const { data: order } = await supabase
    .from("orders")
    .select(
      "order_id, order_name, product_code, quantity, status, amount, payment_method, customer_phone, shipping_address, tracking_number, shipped_at, delivered_at, created_at",
    )
    .eq("order_id", orderId)
    .single<Order>();

  if (!order) notFound();

  const s = statusLabel(order.status);
  const sa = order.shipping_address ?? {};
  const cancelable = isCancelable(order.status);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link href="/" className="font-display text-3xl font-light tracking-tight text-ink">
          glo<span className="italic text-accent">.</span>
        </Link>
        <Link
          href="/account"
          className="rounded-full border border-ink-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
        >
          ← 주문 내역
        </Link>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-light text-ink">주문 상세</h1>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${s.className}`}>
          {s.label}
        </span>
      </div>
      <p className="mt-2 font-mono text-xs text-ink-faint">{order.order_id}</p>

      {/* Shipping progress */}
      <Progress status={order.status} />

      <Section title="주문 정보">
        <Row k="상품" v={`${order.order_name} (${order.product_code} × ${order.quantity})`} />
        <Row k="결제금액" v={formatKRW(order.amount)} />
        <Row k="결제수단" v={order.payment_method || "—"} />
        <Row k="주문일시" v={fmtDate(order.created_at)} />
      </Section>

      <Section title="배송 정보">
        <Row k="수령인" v={sa.recipient || "—"} />
        <Row k="연락처" v={sa.phone || order.customer_phone || "—"} />
        <Row
          k="주소"
          v={
            [sa.postcode ? `(${sa.postcode})` : "", sa.address, sa.detail]
              .filter(Boolean)
              .join(" ") || "—"
          }
        />
        {sa.memo ? <Row k="배송메모" v={sa.memo} /> : null}
        <Row k="송장번호" v={order.tracking_number || "아직 등록 전이에요"} />
        <Row k="발송일시" v={fmtDate(order.shipped_at)} />
        {order.delivered_at ? <Row k="배송완료" v={fmtDate(order.delivered_at)} /> : null}
      </Section>

      {/* Cancel — only while still cancelable (paid, before 배송준비중) */}
      {order.status === "canceled" ? (
        <p className="mt-6 rounded-xl border border-ink-line bg-bg-3 px-5 py-4 text-sm text-ink-soft">
          이 주문은 결제 취소되었습니다.
        </p>
      ) : cancelable ? (
        <div className="mt-8 border-t border-ink-line pt-6">
          <CancelButton orderId={order.order_id} />
          <p className="mt-2 text-xs text-ink-faint">
            배송 준비가 시작되기 전까지만 직접 취소할 수 있어요. 이후에는 고객센터로 문의해주세요.
          </p>
        </div>
      ) : (
        <p className="mt-8 border-t border-ink-line pt-6 text-xs text-ink-faint">
          배송 준비가 시작되어 직접 취소가 불가능합니다. 취소·환불이 필요하면 고객센터로 문의해주세요.
        </p>
      )}
    </main>
  );
}

/** Three-step shipping progress: 배송준비중 → 배송중 → 배송완료. */
function Progress({ status }: { status: OrderStatus }) {
  // Canceled/failed orders don't show the shipping rail.
  if (status === "canceled" || status === "failed" || status === "refunded") return null;
  const steps = [
    { key: "preparing", label: "배송준비중" },
    { key: "shipped", label: "배송중" },
    { key: "delivered", label: "배송완료" },
  ];
  const order = ["paid", "preparing", "shipped", "delivered"];
  const reached = order.indexOf(status); // paid=0 → no step active yet
  return (
    <div className="mt-6 flex items-center gap-2">
      {steps.map((step, i) => {
        const active = reached >= i + 1;
        return (
          <div key={step.key} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`h-2.5 w-2.5 rounded-full ${active ? "bg-accent" : "bg-burg-50"}`}
              />
            </div>
            <span className={`text-xs ${active ? "font-semibold text-ink" : "text-ink-faint"}`}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <span className={`h-px flex-1 ${active ? "bg-accent" : "bg-ink-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-xl border border-ink-line bg-bg-2 p-6">
      <h2 className="mb-3 font-display text-lg text-ink">{title}</h2>
      <dl className="space-y-2.5 text-sm">{children}</dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="shrink-0 text-ink-mute">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}
