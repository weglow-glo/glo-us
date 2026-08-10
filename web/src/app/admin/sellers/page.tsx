import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import {
  GROUPBUY_STANDARD_OPTIONS,
  ROUND_TYPE_LABEL,
  parseRoundOptions,
  type RoundType,
} from "@/lib/groupbuy";

/** 회차 옵션 입력 기본값 — 표준 공구 단가표 */
const OPTIONS_TEMPLATE = GROUPBUY_STANDARD_OPTIONS.map(
  (o) => `${o.key} | ${o.months} | ${o.label} | ${o.price}${o.badge ? ` | ${o.badge}` : ""}`,
).join("\n");
import {
  approveApplication,
  approveRound,
  linkSellerUser,
  rejectApplication,
  rejectRound,
  settleRound,
  toggleSellerActive,
  updateSellerHandle,
} from "./actions";
import {
  DEMO_APPLICATIONS,
  DEMO_ORDERS,
  DEMO_ROUNDS,
  DEMO_SELLERS,
  groupbuyDemoMode,
} from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type SellerRow = {
  id: string;
  user_id: string | null;
  handle: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  bank_info: { bank?: string; account?: string; holder?: string } | null;
  active: boolean;
  note: string | null;
};

type RoundRow = {
  id: string;
  seller_id: string;
  round_no: number | null;
  type: RoundType;
  status: string;
  handle: string | null;
  display_name: string | null;
  starts_at: string | null;
  ends_at: string | null;
  options: unknown;
  commission_rate: number | null;
  settle_due_at: string | null;
  settled_at: string | null;
  settled_amount: number | null;
  request_note: string | null;
  admin_note: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

/** datetime-local 프리필용 — KST 기준 YYYY-MM-DDTHH:mm (UTC slice 하면 밀린다) */
function kstDateTimeInput(iso: string | null): string | undefined {
  if (!iso) return undefined;
  return new Date(iso)
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul" })
    .slice(0, 16)
    .replace(" ", "T");
}

/** 기간 표시 — 날짜 + 시각 (KST) */
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

type ApplicationRow = {
  id: string;
  user_id: string;
  status: string;
  name: string;
  phone: string;
  channel: string | null;
  follower: string | null;
  note: string | null;
  created_at: string;
};

const ROUND_STATUS_LABEL: Record<string, string> = {
  requested: "신청",
  approved: "승인",
  rejected: "반려",
  canceled: "취소",
  ended: "종료",
};

/** 셀러·회차 관리 — 공동구매/협찬 매출 분리 집계와 정산 */
export default async function AdminSellersPage() {
  const now = Date.now();
  const demo = groupbuyDemoMode();

  let sellers: SellerRow[];
  let rounds: RoundRow[];
  let orderRows: Array<{ round_id: string | null; status: string; amount: number }>;
  let applications: ApplicationRow[];

  if (demo) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    sellers = DEMO_SELLERS;
    rounds = DEMO_ROUNDS;
    orderRows = DEMO_ORDERS;
    applications = DEMO_APPLICATIONS;
  } else {
    const admin = createAdminClient();
    const [{ data: sellerRows }, { data: roundRowsData }] = await Promise.all([
      admin
        .from("sellers")
        .select("id, user_id, handle, name, phone, email, bank_info, active, note")
        .order("created_at", { ascending: true })
        .returns<SellerRow[]>(),
      admin
        .from("groupbuy_rounds")
        .select(
          "id, seller_id, round_no, type, status, handle, display_name, starts_at, ends_at, options, commission_rate, settle_due_at, settled_at, settled_amount, request_note, admin_note",
        )
        .order("created_at", { ascending: false })
        .returns<RoundRow[]>(),
    ]);
    sellers = sellerRows ?? [];
    rounds = roundRowsData ?? [];

    const { data: appRows } = await admin
      .from("seller_applications")
      .select("id, user_id, status, name, phone, channel, follower, note, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .returns<ApplicationRow[]>();
    applications = appRows ?? [];

    const roundIds = rounds.map((r) => r.id);
    if (roundIds.length > 0) {
      const { data } = await admin
        .from("orders")
        .select("round_id, status, amount")
        .in("round_id", roundIds)
        .limit(100000);
      orderRows = data ?? [];
    } else {
      orderRows = [];
    }
  }

  const sellerName = new Map(sellers.map((s) => [s.id, s.name]));
  const sellerHandle = new Map(sellers.map((s) => [s.id, s.handle]));

  // 회차별 매출 집계 — paid 만 매출, canceled/refunded 는 참고 표기
  const agg = new Map<string, { paid: number; paidCount: number; lost: number; lostCount: number }>();
  for (const o of orderRows) {
    if (!o.round_id) continue;
    const a = agg.get(o.round_id) ?? { paid: 0, paidCount: 0, lost: 0, lostCount: 0 };
    if (o.status === "paid") {
      a.paid += o.amount ?? 0;
      a.paidCount += 1;
    } else if (o.status === "canceled" || o.status === "refunded") {
      a.lost += o.amount ?? 0;
      a.lostCount += 1;
    }
    agg.set(o.round_id, a);
  }

  const requested = rounds.filter((r) => r.status === "requested");
  const activeRounds = rounds.filter((r) => r.status === "approved");
  const doneRounds = rounds.filter((r) => ["ended", "rejected", "canceled"].includes(r.status));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="font-sans text-2xl font-light text-ink">셀러 · 공동구매 관리</h1>
      <p className="mt-1 text-sm text-ink-mute">
        전용 링크는 <code className="rounded bg-bg-3 px-1.5 py-0.5">glo-us.com/product/@핸들</code> ·
        정산 기준일은 회차 종료 3주 뒤 금요일 (paid 스냅샷 × 수수료율)
      </p>
      {demo && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          로컬 데모 데이터입니다 — 서버 키(.env) 없이 화면 확인용. 실제 DB 가 아니며
          버튼(등록·승인·정산)은 동작하지 않습니다. 프로덕션에서는 나타나지 않습니다.
        </p>
      )}

      {/* ── 셀러 지원 심사 ─────────────────────────── */}
      {applications.length > 0 && (
        <section className="mt-8">
          <h2 className="font-sans text-lg text-ink">
            셀러 지원 심사 <span className="text-accent">{applications.length}</span>
          </h2>
          <div className="mt-3 space-y-4">
            {applications.map((a) => (
              <div key={a.id} className="rounded-xl border border-accent/40 bg-bg-2 p-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-ink">{a.name}</p>
                  <p className="text-xs text-ink-soft">{a.phone}</p>
                  {a.follower && <p className="text-xs text-ink-soft">{a.follower}</p>}
                  <p className="text-[11px] text-ink-mute">지원 {fmtDate(a.created_at)}</p>
                </div>
                {a.channel && (
                  <a
                    href={a.channel.startsWith("http") ? a.channel : `https://${a.channel}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block break-all font-mono text-xs text-accent hover:underline"
                  >
                    {a.channel}
                  </a>
                )}
                {a.note && <p className="mt-2 text-sm text-ink-soft">{a.note}</p>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={approveApplication}>
                    <input type="hidden" name="application_id" value={a.id} />
                    <button className="rounded-full bg-burg-600 px-5 py-2 text-xs font-semibold text-bg-1 hover:bg-burg-400">
                      승인 · 문자 안내
                    </button>
                  </form>
                  <form action={rejectApplication} className="flex items-center gap-2">
                    <input type="hidden" name="application_id" value={a.id} />
                    <input
                      name="admin_note"
                      placeholder="반려 사유 (문자에 포함)"
                      className="w-56 rounded-md border border-ink-line bg-bg-1 px-3 py-1.5 text-xs text-ink"
                    />
                    <button className="rounded-full border border-ink-line px-4 py-1.5 text-xs font-medium text-burg-400 hover:border-burg-400">
                      반려
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 일정 신청 인박스 ─────────────────────────── */}
      {requested.length > 0 && (
        <section className="mt-8">
          <h2 className="font-sans text-lg text-ink">
            일정 신청 <span className="text-accent">{requested.length}</span>
          </h2>
          <div className="mt-3 space-y-4">
            {requested.map((r) => (
              <div key={r.id} className="rounded-xl border border-accent/40 bg-bg-2 p-5">
                <p className="text-sm font-semibold text-ink">
                  {sellerName.get(r.seller_id) ?? "?"} · {ROUND_TYPE_LABEL[r.type]} ·{" "}
                  희망 {fmtDT(r.starts_at)} ~ {fmtDT(r.ends_at)}
                </p>
                {r.request_note && (
                  <p className="mt-1 text-sm text-ink-soft">요청: {r.request_note}</p>
                )}
                <form action={approveRound} className="mt-4 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="round_id" value={r.id} />
                  {sellerHandle.get(r.seller_id) ? (
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-ink-soft">전용 URL — 고정</span>
                      <p className="rounded-md border border-ink-line bg-bg-3 px-3 py-2 font-mono text-xs text-ink">
                        /product/@{sellerHandle.get(r.seller_id)}
                      </p>
                    </label>
                  ) : (
                    <Input name="handle" label="전용 URL 핸들 — 최초 1회 지정, 이후 고정" placeholder="ellie" required />
                  )}
                  <Input name="display_name" label="표시 이름" placeholder="엘리" />
                  <Input name="starts_at" label="시작 일시" type="datetime-local" required defaultValue={kstDateTimeInput(r.starts_at)} />
                  <Input name="ends_at" label="종료 일시" type="datetime-local" required defaultValue={kstDateTimeInput(r.ends_at)} />
                  <Input name="commission_rate" label="수수료율 (%)" type="number" step="0.5" required />
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-xs font-medium text-ink-soft">
                      전용 옵션 — 한 줄에 하나: <code>키 | 개월 | 라벨 | 가격 | 배지(선택)</code> ·
                      기본값은 표준 공구 단가표
                    </span>
                    <textarea
                      name="options"
                      rows={7}
                      required
                      defaultValue={OPTIONS_TEMPLATE}
                      className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 font-mono text-xs text-ink"
                    />
                  </label>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <button className="rounded-full bg-burg-600 px-5 py-2 text-xs font-semibold text-bg-1 hover:bg-burg-400">
                      승인 · 링크 발급
                    </button>
                  </div>
                </form>
                <form action={rejectRound} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="round_id" value={r.id} />
                  <input
                    name="admin_note"
                    placeholder="반려 사유"
                    className="w-64 rounded-md border border-ink-line bg-bg-1 px-3 py-1.5 text-xs text-ink"
                  />
                  <button className="rounded-full border border-ink-line px-4 py-1.5 text-xs font-medium text-burg-400 hover:border-burg-400">
                    반려
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 진행·예정 회차 ─────────────────────────── */}
      <section className="mt-8">
        <h2 className="font-sans text-lg text-ink">진행 · 예정 회차</h2>
        <RoundTable rounds={activeRounds} sellerName={sellerName} sellerHandle={sellerHandle} agg={agg} now={now} showSettle />
      </section>

      {/* ── 종료된 회차 ─────────────────────────── */}
      {doneRounds.length > 0 && (
        <section className="mt-8">
          <h2 className="font-sans text-lg text-ink">종료 · 반려</h2>
          <RoundTable rounds={doneRounds} sellerName={sellerName} sellerHandle={sellerHandle} agg={agg} now={now} />
        </section>
      )}

      {/* ── 셀러 ─────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-sans text-lg text-ink">셀러</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-ink-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ink-line bg-bg-2 text-left text-xs text-ink-mute">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">전용 URL</th>
                <th className="px-4 py-3">셀러 정보</th>
                <th className="px-4 py-3">포털 계정</th>
                <th className="px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.id} className="border-b border-ink-line last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{s.name}</td>
                  <td className="px-4 py-3">
                    <form action={updateSellerHandle} className="flex items-center gap-1.5">
                      <input type="hidden" name="seller_id" value={s.id} />
                      <span className="text-xs text-ink-mute">@</span>
                      <input
                        name="handle"
                        defaultValue={s.handle ?? ""}
                        placeholder="첫 회차 승인 때 지정"
                        className="w-36 rounded-md border border-ink-line bg-bg-1 px-2 py-1 font-mono text-[11px] text-ink"
                      />
                      <button className="rounded-full border border-ink-line px-3 py-1 text-[11px] font-medium text-ink-soft hover:border-accent hover:text-accent">
                        저장
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer select-none rounded-full border border-ink-line px-3 py-1 text-[11px] font-medium text-ink-soft hover:border-accent hover:text-accent [&::-webkit-details-marker]:hidden">
                        셀러 정보 보기
                      </summary>
                      <dl className="mt-2 space-y-1 rounded-md bg-bg-2 px-3 py-2 text-xs text-ink-soft">
                        <div className="flex gap-2">
                          <dt className="w-14 shrink-0 text-ink-mute">연락처</dt>
                          <dd>{s.phone ?? "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-14 shrink-0 text-ink-mute">이메일</dt>
                          <dd>{s.email ?? "—"}</dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="w-14 shrink-0 text-ink-mute">정산 계좌</dt>
                          <dd>
                            {s.bank_info
                              ? [s.bank_info.bank, s.bank_info.account, s.bank_info.holder]
                                  .filter(Boolean)
                                  .join(" ")
                              : "미입력 — 셀러가 내 정보에서 입력"}
                          </dd>
                        </div>
                        {s.note && (
                          <div className="flex gap-2">
                            <dt className="w-14 shrink-0 text-ink-mute">메모</dt>
                            <dd>{s.note}</dd>
                          </div>
                        )}
                      </dl>
                    </details>
                  </td>
                  <td className="px-4 py-3">
                    <form action={linkSellerUser} className="flex items-center gap-1.5">
                      <input type="hidden" name="seller_id" value={s.id} />
                      <input
                        name="user_id"
                        defaultValue={s.user_id ?? ""}
                        placeholder="회원 UUID (/admin/members)"
                        className="w-56 rounded-md border border-ink-line bg-bg-1 px-2 py-1 font-mono text-[11px] text-ink"
                      />
                      <button className="rounded-full border border-ink-line px-3 py-1 text-[11px] font-medium text-ink-soft hover:border-accent hover:text-accent">
                        저장
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <form action={toggleSellerActive}>
                      <input type="hidden" name="seller_id" value={s.id} />
                      <input type="hidden" name="active" value={String(!s.active)} />
                      <button
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                          s.active
                            ? "bg-bg-3 text-burg-400"
                            : "border border-ink-line text-ink-mute"
                        }`}
                      >
                        {s.active ? "활성" : "비활성"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {sellers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-mute">
                    등록된 셀러가 없습니다.
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

function RoundTable({
  rounds,
  sellerName,
  sellerHandle,
  agg,
  now,
  showSettle = false,
}: {
  rounds: RoundRow[];
  sellerName: Map<string, string>;
  sellerHandle: Map<string, string | null>;
  agg: Map<string, { paid: number; paidCount: number; lost: number; lostCount: number }>;
  now: number;
  showSettle?: boolean;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-ink-line">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-ink-line bg-bg-2 text-left text-xs text-ink-mute">
            <th className="px-4 py-3">셀러 / 링크</th>
            <th className="px-4 py-3">유형</th>
            <th className="px-4 py-3">기간</th>
            <th className="px-4 py-3">구성</th>
            <th className="px-4 py-3 text-right">매출 (paid)</th>
            <th className="px-4 py-3 text-right">취소·환불</th>
            <th className="px-4 py-3 text-right">수수료율</th>
            <th className="px-4 py-3 text-right">정산</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const a = agg.get(r.id) ?? { paid: 0, paidCount: 0, lost: 0, lostCount: 0 };
            const rate = Number(r.commission_rate ?? 0);
            const est = Math.round((a.paid * rate) / 100);
            const live =
              r.status === "approved" &&
              r.starts_at &&
              r.ends_at &&
              now >= Date.parse(r.starts_at) &&
              now < Date.parse(r.ends_at);
            const dueReached = r.settle_due_at ? now >= Date.parse(r.settle_due_at) : false;
            const opts = parseRoundOptions(r.options) ?? [];
            return (
              <tr key={r.id} className="border-b border-ink-line align-top last:border-0">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink">
                    {sellerName.get(r.seller_id) ?? "?"}
                    {r.display_name ? ` (${r.display_name})` : ""}
                    {r.round_no != null && (
                      <span className="ml-1.5 rounded-full bg-bg-3 px-2 py-0.5 text-[11px] font-bold text-accent">
                        {r.round_no}차
                      </span>
                    )}
                  </p>
                  {sellerHandle.get(r.seller_id) && (
                    <a
                      href={`/product/@${sellerHandle.get(r.seller_id)}`}
                      target="_blank"
                      className="font-mono text-xs text-accent hover:underline"
                    >
                      /product/@{sellerHandle.get(r.seller_id)}
                    </a>
                  )}
                  <p className="mt-0.5 text-[11px]">
                    {live ? (
                      <span className="font-semibold text-accent">LIVE</span>
                    ) : (
                      <span className="text-ink-mute">{ROUND_STATUS_LABEL[r.status] ?? r.status}</span>
                    )}
                  </p>
                </td>
                <td className="px-4 py-3 text-ink-soft">{ROUND_TYPE_LABEL[r.type]}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {fmtDT(r.starts_at)} ~ {fmtDT(r.ends_at)}
                  {r.settle_due_at && (
                    <p className="text-[11px] text-ink-mute">정산 기준 {fmtDate(r.settle_due_at)}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-soft">
                  {opts.map((o) => (
                    <p key={o.key}>
                      {o.label} · {formatKRW(o.price)}
                    </p>
                  ))}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-medium text-ink">{formatKRW(a.paid)}</p>
                  <p className="text-[11px] text-ink-mute">{a.paidCount}건</p>
                </td>
                <td className="px-4 py-3 text-right text-ink-soft">
                  {a.lostCount > 0 ? `${formatKRW(a.lost)} · ${a.lostCount}건` : "—"}
                </td>
                <td className="px-4 py-3 text-right text-ink-soft">
                  {r.commission_rate != null ? `${rate}%` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.settled_at ? (
                    <>
                      <p className="font-medium text-ink">{formatKRW(r.settled_amount ?? 0)}</p>
                      <p className="text-[11px] text-ink-mute">확정 {fmtDate(r.settled_at)}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-ink-soft">예상 {formatKRW(est)}</p>
                      {showSettle && (
                        <form action={settleRound} className="mt-1">
                          <input type="hidden" name="round_id" value={r.id} />
                          <button
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                              dueReached
                                ? "bg-burg-600 text-bg-1 hover:bg-burg-400"
                                : "border border-ink-line text-ink-mute"
                            }`}
                            title={dueReached ? "정산 확정" : "정산 기준일 전입니다 — 확정 시 현재 스냅샷으로 계산됩니다"}
                          >
                            정산 확정
                          </button>
                        </form>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {rounds.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-ink-mute">
                회차가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Input({
  name,
  label,
  type = "text",
  placeholder,
  required = false,
  step,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        step={step}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}
