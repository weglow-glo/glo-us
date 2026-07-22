import { createAdminClient } from "@/lib/supabase/admin";
import { getPointPolicy, POINT_REASON_LABEL } from "@/lib/points";
import { updatePointPolicy } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_id: string;
  delta: number;
  remaining: number;
  reason: string;
  ref_id: string | null;
  created_at: string;
  expires_at: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** 포인트 운영 — 지급 정책(동적 조정) + 전체 내역 모니터링 */
export default async function AdminPointsPage() {
  const admin = createAdminClient();
  const policy = await getPointPolicy(admin);

  // 전체 현황
  const nowIso = new Date().toISOString();
  const { data: lotRows } = await admin
    .from("points")
    .select("remaining")
    .gt("delta", 0)
    .gt("remaining", 0)
    .gt("expires_at", nowIso)
    .limit(10000);
  const outstanding = (lotRows ?? []).reduce((s, r) => s + (r.remaining ?? 0), 0);

  const { data: allRows } = await admin
    .from("points")
    .select("delta")
    .limit(10000)
    .returns<{ delta: number }[]>();
  const granted = (allRows ?? []).filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0);
  const spent = (allRows ?? []).filter((r) => r.delta < 0).reduce((s, r) => s - r.delta, 0);

  // 최근 내역 + 회원 이메일 매핑 (고유 user만 조회)
  const { data } = await admin
    .from("points")
    .select("id, user_id, delta, remaining, reason, ref_id, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Row[]>();
  const rows = data ?? [];
  const emails = new Map<string, string>();
  await Promise.all(
    [...new Set(rows.map((r) => r.user_id))].map(async (uid) => {
      try {
        const { data: u } = await admin.auth.admin.getUserById(uid);
        const meta = (u.user?.user_metadata ?? {}) as Record<string, string | undefined>;
        emails.set(uid, u.user?.email ?? meta.nickname ?? meta.name ?? uid.slice(0, 8));
      } catch {
        emails.set(uid, uid.slice(0, 8));
      }
    }),
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-sans text-3xl font-light text-ink">포인트 관리</h1>

      {/* 현황 */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink-line bg-bg-2 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            유효 잔액 (부채)
          </div>
          <div className="mt-1 font-sans text-2xl font-light text-ink">
            {outstanding.toLocaleString("ko-KR")}P
          </div>
        </div>
        <div className="rounded-xl border border-ink-line bg-bg-2 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            누적 지급
          </div>
          <div className="mt-1 font-sans text-2xl font-light text-ink">
            {granted.toLocaleString("ko-KR")}P
          </div>
        </div>
        <div className="rounded-xl border border-ink-line bg-bg-2 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-mute">
            누적 사용·회수
          </div>
          <div className="mt-1 font-sans text-2xl font-light text-ink">
            {spent.toLocaleString("ko-KR")}P
          </div>
        </div>
      </div>

      {/* 지급 정책 */}
      <section className="mt-8 rounded-xl border border-ink-line bg-bg-2 p-6">
        <h2 className="text-lg font-semibold text-ink">리뷰 포인트 지급 정책</h2>
        <p className="mt-1 text-xs text-ink-mute">
          저장 즉시 이후 지급분부터 적용됩니다. 이미 지급된 포인트는 변하지 않습니다. 사이트의
          안내 문구(리뷰 작성 페이지·문자)도 이 값으로 표시됩니다.
        </p>
        <form action={updatePointPolicy} className="mt-4 flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">
              텍스트 리뷰 (게시 즉시)
            </span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                name="review_text"
                defaultValue={policy.review_text}
                min={0}
                max={100000}
                step={100}
                className="w-32 rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-right text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-ink-mute">P</span>
            </span>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-soft">
              사진·영상 추가 (검수 승인 시)
            </span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                name="review_media"
                defaultValue={policy.review_media}
                min={0}
                max={100000}
                step={100}
                className="w-32 rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-right text-sm text-ink outline-none focus:border-accent"
              />
              <span className="text-sm text-ink-mute">P</span>
            </span>
          </label>
          <div className="text-xs text-ink-faint">
            합계(포토 리뷰 총액):{" "}
            <b className="text-ink">
              {(policy.review_text + policy.review_media).toLocaleString("ko-KR")}P
            </b>
          </div>
          <button className="rounded-full bg-burg-600 px-6 py-2.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400">
            저장
          </button>
        </form>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
          ⚠ 알림톡 템플릿 본문에 적힌 금액은 자동으로 바뀌지 않습니다. 금액 변경 시 템플릿을
          수정해 재검수 받아야 합니다.
        </p>
      </section>

      {/* 최근 내역 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">최근 내역 (50건)</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-mute">
                <th className="py-3 pr-4">일시</th>
                <th className="py-3 pr-4">회원</th>
                <th className="py-3 pr-4">구분</th>
                <th className="py-3 pr-4 text-right">변동</th>
                <th className="py-3 pr-4 text-right">잔여/만료</th>
                <th className="py-3">근거</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink-line-2">
                  <td className="py-3 pr-4 text-ink-soft">{fmtDate(r.created_at)}</td>
                  <td className="py-3 pr-4 text-ink">{emails.get(r.user_id)}</td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {POINT_REASON_LABEL[r.reason] ?? r.reason}
                  </td>
                  <td
                    className={`py-3 pr-4 text-right font-sans ${
                      r.delta > 0 ? "text-accent" : "text-ink"
                    }`}
                  >
                    {r.delta > 0 ? "+" : ""}
                    {r.delta.toLocaleString("ko-KR")}P
                  </td>
                  <td className="py-3 pr-4 text-right text-xs text-ink-faint">
                    {r.delta > 0
                      ? `${r.remaining.toLocaleString("ko-KR")}P · ${
                          r.expires_at
                            ? new Date(r.expires_at).toLocaleDateString("ko-KR", {
                                timeZone: "Asia/Seoul",
                              })
                            : "—"
                        }`
                      : "—"}
                  </td>
                  <td className="py-3 font-mono text-xs text-ink-faint">{r.ref_id ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ink-mute">
                    포인트 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
