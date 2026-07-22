import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { POINT_REASON_LABEL } from "@/lib/points";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "포인트 내역 — glo",
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  delta: number;
  remaining: number;
  reason: string;
  created_at: string;
  expires_at: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** 내 포인트 적립·사용·회수 내역. RLS(points_select_own)로 본인 것만 조회된다. */
export default async function PointsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/points");

  const { data } = await supabase
    .from("points")
    .select("id, delta, remaining, reason, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<Row[]>();
  const rows = data ?? [];

  const now = Date.now();
  const soon = now + 30 * 86400000;
  const lots = rows.filter(
    (r) => r.delta > 0 && r.remaining > 0 && r.expires_at && Date.parse(r.expires_at) > now,
  );
  const balance = lots.reduce((s, r) => s + r.remaining, 0);
  const expiring = lots
    .filter((r) => Date.parse(r.expires_at!) <= soon)
    .reduce((s, r) => s + r.remaining, 0);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-12">
      <Link href="/account" className="text-sm text-ink-mute hover:text-ink">
        ← 마이페이지
      </Link>
      <h1 className="mt-4 font-sans text-2xl font-light text-ink">포인트 내역</h1>

      <div className="mt-6 rounded-2xl border border-ink-line bg-bg-2 p-6">
        <div className="text-sm text-ink-mute">사용 가능 포인트</div>
        <div className="mt-1 font-sans text-3xl font-light text-ink">
          {balance.toLocaleString("ko-KR")}
          <span className="ml-1 text-xl text-accent">P</span>
        </div>
        {expiring > 0 && (
          <p className="mt-2 text-xs text-burg-400">
            {expiring.toLocaleString("ko-KR")}P가 30일 내 만료 예정입니다.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          1P = 1원 · 적립일로부터 6개월 사용 가능 · 결제 시 전액까지 사용할 수 있습니다.
        </p>
      </div>

      <ul className="mt-6 divide-y divide-ink-line rounded-2xl border border-ink-line bg-bg-1">
        {rows.map((r) => {
          const isEarn = r.delta > 0;
          const expired =
            isEarn && r.expires_at ? Date.parse(r.expires_at) <= now : false;
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div>
                <div className="text-sm font-medium text-ink">
                  {POINT_REASON_LABEL[r.reason] ?? r.reason}
                </div>
                <div className="mt-0.5 text-xs text-ink-faint">
                  {fmtDate(r.created_at)}
                  {isEarn && r.expires_at && (
                    <>
                      {" · "}
                      {expired ? (
                        <span className="text-burg-400">만료됨</span>
                      ) : (
                        `${fmtDate(r.expires_at)}까지`
                      )}
                      {!expired && r.remaining !== r.delta && (
                        <> · 잔여 {r.remaining.toLocaleString("ko-KR")}P</>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div
                className={`shrink-0 font-sans text-base ${
                  isEarn ? (expired ? "text-ink-faint line-through" : "text-accent") : "text-ink"
                }`}
              >
                {isEarn ? "+" : ""}
                {r.delta.toLocaleString("ko-KR")}P
              </div>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="px-5 py-12 text-center text-sm text-ink-mute">
            아직 포인트 내역이 없습니다. 구매 후 리뷰를 남기면 포인트가 적립됩니다.
          </li>
        )}
      </ul>
    </main>
  );
}
