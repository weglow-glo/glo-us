import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";
import { grantSeller, revokeSeller } from "./actions";
import { DEMO_MEMBERS, DEMO_SELLERS, groupbuyDemoMode } from "@/lib/groupbuy-demo";

export const dynamic = "force-dynamic";

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
};

const PROVIDER_LABEL: Record<string, string> = {
  kakao: "카카오",
  google: "구글",
  email: "이메일",
};

// Settled = paid through any fulfillment stage (matches the orders dashboard).
const SETTLED = ["paid", "preparing", "shipped", "delivered"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default async function MembersPage() {
  const demo = groupbuyDemoMode();

  let members: Profile[] = [];
  let error: { message: string } | null = null;
  const activity = new Map<string, { count: number; spent: number }>();
  const authMeta = new Map<string, { provider: string; lastSignIn: string | null }>();
  // 셀러 권한 — user_id 가 연결된 셀러 계정 (active 만 권한 있음으로 표시)
  const sellerByUser = new Map<string, { id: string; name: string; active: boolean }>();

  if (demo) {
    // 로컬 데모 — 서버 키 없이 화면 확인용 (프로덕션에서는 도달 불가)
    members = DEMO_MEMBERS;
    for (const m of DEMO_MEMBERS) {
      authMeta.set(m.id, { provider: "kakao", lastSignIn: m.created_at });
    }
    activity.set("demo-user-3", { count: 1, spent: 228480 });
    for (const s of DEMO_SELLERS) {
      if (s.user_id) sellerByUser.set(s.user_id, { id: s.id, name: s.name, active: s.active });
    }
  } else {
    const admin = createAdminClient();

    const { data, error: err } = await admin
      .from("profiles")
      .select("id, email, full_name, phone, created_at")
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<Profile[]>();
    members = data ?? [];
    error = err;

    // Order activity per signed-in user (guest orders have null user_id).
    const { data: orderRows } = await admin
      .from("orders")
      .select("user_id, amount, status")
      .not("user_id", "is", null)
      .limit(10000)
      .returns<{ user_id: string; amount: number; status: string }[]>();
    for (const o of orderRows ?? []) {
      const cur = activity.get(o.user_id) ?? { count: 0, spent: 0 };
      cur.count += 1;
      if (SETTLED.includes(o.status)) cur.spent += o.amount ?? 0;
      activity.set(o.user_id, cur);
    }

    // Auth metadata (signup provider + last sign-in) — best-effort.
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of list?.users ?? []) {
        authMeta.set(u.id, {
          provider: (u.app_metadata?.provider as string) ?? "email",
          lastSignIn: u.last_sign_in_at ?? null,
        });
      }
    } catch {
      // listUsers unavailable — fall back to profiles-only view.
    }

    const { data: sellerRows } = await admin
      .from("sellers")
      .select("id, user_id, name, active")
      .not("user_id", "is", null)
      .returns<{ id: string; user_id: string; name: string; active: boolean }[]>();
    for (const s of sellerRows ?? []) {
      sellerByUser.set(s.user_id, { id: s.id, name: s.name, active: s.active });
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-3xl font-light text-ink">
          회원 관리 <span className="text-sm text-ink-mute">({members.length})</span>
        </h1>
        <a
          href="/admin/members/export"
          className="rounded-full bg-burg-600 px-5 py-2.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
        >
          CSV 내보내기
        </a>
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-bg-3 px-4 py-3 text-sm text-burg-400">
          회원을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-line text-left text-xs uppercase tracking-wide text-ink-mute">
              <th className="py-3 pr-4">가입일시</th>
              <th className="py-3 pr-4">이름</th>
              <th className="py-3 pr-4">이메일</th>
              <th className="py-3 pr-4">연락처</th>
              <th className="py-3 pr-4">가입경로</th>
              <th className="py-3 pr-4">최근 로그인</th>
              <th className="py-3 pr-4">주문</th>
              <th className="py-3 pr-4">결제액</th>
              <th className="py-3 pr-4">셀러 권한</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const act = activity.get(m.id);
              const meta = authMeta.get(m.id);
              const provider = meta?.provider ?? "email";
              const seller = sellerByUser.get(m.id);
              return (
                <tr key={m.id} className="border-b border-ink-line-2">
                  <td className="py-3 pr-4 text-ink-soft">{fmtDate(m.created_at)}</td>
                  <td className="py-3 pr-4 text-ink">{m.full_name ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-soft">{m.email ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-soft">{m.phone ?? "—"}</td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {PROVIDER_LABEL[provider] ?? provider}
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">{fmtDate(meta?.lastSignIn ?? null)}</td>
                  <td className="py-3 pr-4 text-ink">{act?.count ?? 0}</td>
                  <td className="py-3 pr-4 text-ink">{formatKRW(act?.spent ?? 0)}</td>
                  <td className="py-3 pr-4">
                    {seller?.active ? (
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-cream">
                          셀러
                        </span>
                        <form action={revokeSeller}>
                          <input type="hidden" name="userId" value={m.id} />
                          <button
                            type="submit"
                            className="text-xs font-medium text-ink-mute underline-offset-2 hover:text-burg-400 hover:underline"
                          >
                            해제
                          </button>
                        </form>
                      </span>
                    ) : (
                      <form action={grantSeller}>
                        <input type="hidden" name="userId" value={m.id} />
                        <input type="hidden" name="name" value={m.full_name ?? m.email ?? ""} />
                        <button
                          type="submit"
                          className="rounded-full border border-ink-line px-3 py-1 text-xs font-medium text-ink-soft transition hover:border-accent hover:text-accent"
                        >
                          {seller ? "권한 복구" : "셀러 권한 부여"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-ink-mute">
                  가입한 회원이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
