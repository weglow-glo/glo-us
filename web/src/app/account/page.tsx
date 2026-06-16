import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatKRW } from "@/lib/product";
import { SignOutButton } from "./sign-out-button";

type OrderStatus = "pending" | "paid" | "failed" | "canceled" | "refunded";

type Order = {
  order_id: string;
  order_name: string;
  status: OrderStatus;
  amount: number;
  created_at: string;
};

const STATUS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "결제 대기", className: "bg-bg-3 text-ink-mute" },
  paid: { label: "결제 완료", className: "bg-burg-600 text-cream" },
  failed: { label: "결제 실패", className: "bg-bg-3 text-burg-400" },
  canceled: { label: "취소됨", className: "bg-bg-3 text-ink-mute" },
  refunded: { label: "환불됨", className: "bg-bg-3 text-ink-mute" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/account");
  }

  const meta = (user.user_metadata ?? {}) as Record<string, string | undefined>;
  const name =
    meta.nickname || meta.name || meta.full_name || meta.preferred_username || "회원";
  const email = user.email ?? meta.email ?? null;

  // RLS (orders_select_own) restricts this to the current user's orders.
  const { data: orders } = await supabase
    .from("orders")
    .select("order_id, order_name, status, amount, created_at")
    .order("created_at", { ascending: false })
    .returns<Order[]>();

  const list = orders ?? [];

  return (
    <main id="main" className="mx-auto max-w-none px-4 py-12 lg:max-w-3xl lg:px-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-display text-3xl font-light tracking-tight text-ink">
          glo<span className="italic text-accent">.</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-ink-line px-4 py-2 text-sm font-medium text-ink-soft transition hover:border-accent hover:text-accent"
          >
            ← 홈으로
          </Link>
          <SignOutButton />
        </div>
      </div>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[1.8px] text-ink-mute">
        <span className="mr-2 inline-block h-px w-6 bg-accent align-middle" />
        My page
      </p>
      <h1 className="mt-3 font-display text-4xl font-light text-ink">
        <span className="text-accent">{name}</span>님, 반가워요.
      </h1>
      {email && <p className="mt-3 text-sm text-ink-soft">{email}</p>}

      {/* Orders */}
      <section className="mt-10">
        <h2 className="font-display text-2xl font-light text-ink">주문 내역</h2>

        {list.length === 0 ? (
          <div className="mt-6 rounded-xl border border-ink-line bg-bg-2 p-10 text-center">
            <p className="text-sm text-ink-mute">아직 주문 내역이 없습니다.</p>
            <Link
              href="/checkout"
              className="mt-6 inline-block rounded-full bg-burg-600 px-6 py-3 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
            >
              GL-01 구매하기
            </Link>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {list.map((order) => {
              const status = STATUS[order.status] ?? STATUS.pending;
              return (
                <li
                  key={order.order_id}
                  className="rounded-xl border border-ink-line bg-bg-1 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-display text-lg text-ink">{order.order_name}</p>
                      <p className="mt-1 text-xs text-ink-faint">
                        {formatDate(order.created_at)} · {order.order_id}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-4 border-t border-ink-line pt-3 text-right">
                    <span className="font-display text-lg text-ink">
                      {formatKRW(order.amount)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
