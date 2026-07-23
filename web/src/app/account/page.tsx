import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatKRW } from "@/lib/product";
import { statusLabel, type OrderStatus } from "@/lib/order-status";
import { getPointPolicy } from "@/lib/points";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "./sign-out-button";

type Order = {
  order_id: string;
  order_name: string;
  status: OrderStatus;
  amount: number;
  created_at: string;
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
  // Hide `pending` rows — an order is created the moment 결제하기 is pressed
  // (Toss needs an orderId up front), so abandoned/retried attempts would
  // otherwise linger here as "결제 대기" ghosts.
  const { data: orders } = await supabase
    .from("orders")
    .select("order_id, order_name, status, amount, created_at")
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .returns<Order[]>();

  const list = orders ?? [];

  // 배송완료 주문의 리뷰 작성 여부 + 포인트 잔액 + 지급 정책 — 왕복을 줄이기 위해
  // 서로 독립인 쿼리는 병렬로 실행한다 (마이페이지 TTFB에 직결).
  const orderIds = list.map((o) => o.order_id);
  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + 30 * 86400000).toISOString();
  const [reviewsRes, pointsRes, policy] = await Promise.all([
    orderIds.length
      ? supabase.from("reviews").select("order_id, status").in("order_id", orderIds)
      : Promise.resolve({ data: [] as { order_id: string; status: string }[] }),
    supabase
      .from("points")
      .select("remaining, expires_at")
      .gt("delta", 0)
      .gt("remaining", 0)
      .gt("expires_at", nowIso),
    getPointPolicy(createAdminClient()),
  ]);
  const reviewByOrder = new Map((reviewsRes.data ?? []).map((r) => [r.order_id, r.status]));
  const lots = pointsRes.data ?? [];
  const maxPoint = policy.review_text + policy.review_media;
  const pointBalance = lots.reduce((s, r) => s + (r.remaining ?? 0), 0);
  const pointExpiring = lots
    .filter((r) => r.expires_at && r.expires_at <= soonIso)
    .reduce((s, r) => s + (r.remaining ?? 0), 0);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
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
      <h1 className="mt-3 font-sans text-4xl font-light text-ink">
        <span className="text-accent">{name}</span>님, 반가워요.
      </h1>
      {email && <p className="mt-3 text-sm text-ink-soft">{email}</p>}
      <p className="mt-2 text-sm text-ink-soft">
        <Link href="/account/points" className="group">
          보유 포인트{" "}
          <b className="font-sans text-accent group-hover:underline">
            {pointBalance.toLocaleString("ko-KR")}P
          </b>
          <span className="ml-1 text-xs text-accent">내역 →</span>
        </Link>
        {pointExpiring > 0 && (
          <b className="ml-2 text-xs text-burg-400">
            {pointExpiring.toLocaleString("ko-KR")}P가 30일 내 만료 예정
          </b>
        )}
      </p>

      {/* Orders */}
      <section className="mt-10">
        <h2 className="font-sans text-2xl font-light text-ink">주문 내역</h2>

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
              const status = statusLabel(order.status);
              return (
                <li key={order.order_id}>
                  <Link
                    href={`/account/orders/${order.order_id}`}
                    className="block rounded-xl border border-ink-line bg-bg-1 p-5 transition hover:border-accent"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-sans text-lg text-ink">{order.order_name}</p>
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
                    <div className="mt-4 flex items-center justify-between border-t border-ink-line pt-3">
                      <span className="text-xs font-medium text-accent">상세 보기 →</span>
                      <span className="font-sans text-lg text-ink">
                        {formatKRW(order.amount)}
                      </span>
                    </div>
                  </Link>
                  {order.status === "delivered" && !reviewByOrder.has(order.order_id) && (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-burg-50 bg-bg-3 px-5 py-3">
                      <span className="text-xs text-ink-soft">
                        잘 받으셨나요? 후기를 남기면{" "}
                        <b className="text-accent">최대 {maxPoint.toLocaleString("ko-KR")}P</b>를
                        드려요.
                      </span>
                      <Link
                        href={`/account/review/${order.order_id}`}
                        className="shrink-0 rounded-full bg-burg-600 px-3.5 py-1.5 text-xs font-semibold text-bg-1 transition hover:bg-burg-400"
                      >
                        리뷰 쓰기
                      </Link>
                    </div>
                  )}
                  {reviewByOrder.has(order.order_id) && (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-ink-line bg-bg-2 px-5 py-3">
                      <span className="text-xs text-ink-soft">
                        이 주문의 리뷰를 작성하셨습니다. 작성 후 24시간 이내에는 수정할 수
                        있어요.
                      </span>
                      <Link
                        href={`/account/review/${order.order_id}`}
                        className="shrink-0 rounded-full border border-ink-line px-3.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-accent hover:text-accent"
                      >
                        내 리뷰 보기·수정
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
