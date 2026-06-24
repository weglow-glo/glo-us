import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKRW } from "@/lib/product";

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
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<Profile[]>();
  const members = data ?? [];

  // Order activity per signed-in user (guest orders have null user_id).
  const { data: orderRows } = await admin
    .from("orders")
    .select("user_id, amount, status")
    .not("user_id", "is", null)
    .limit(10000)
    .returns<{ user_id: string; amount: number; status: string }[]>();
  const activity = new Map<string, { count: number; spent: number }>();
  for (const o of orderRows ?? []) {
    const cur = activity.get(o.user_id) ?? { count: 0, spent: 0 };
    cur.count += 1;
    if (SETTLED.includes(o.status)) cur.spent += o.amount ?? 0;
    activity.set(o.user_id, cur);
  }

  // Auth metadata (signup provider + last sign-in) — best-effort.
  const authMeta = new Map<string, { provider: string; lastSignIn: string | null }>();
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

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-sans text-3xl font-light text-ink">
          회원 관리 <span className="text-sm text-ink-mute">({members.length})</span>
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-ink-soft hover:text-accent">
            ← 주문 관리
          </Link>
          <a
            href="/admin/members/export"
            className="rounded-full bg-burg-600 px-5 py-2.5 text-sm font-semibold text-bg-1 transition hover:bg-burg-400"
          >
            CSV 내보내기
          </a>
        </div>
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
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const act = activity.get(m.id);
              const meta = authMeta.get(m.id);
              const provider = meta?.provider ?? "email";
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
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-ink-mute">
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
