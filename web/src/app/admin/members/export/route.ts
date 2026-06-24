import { createAdminClient } from "@/lib/supabase/admin";

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
const SETTLED = ["paid", "preparing", "shipped", "delivered"];

function cell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(5000)
    .returns<Profile[]>();
  if (error) {
    return new Response(`error: ${error.message}`, { status: 500 });
  }
  const members = data ?? [];

  const { data: orderRows } = await admin
    .from("orders")
    .select("user_id, amount, status")
    .not("user_id", "is", null)
    .limit(20000)
    .returns<{ user_id: string; amount: number; status: string }[]>();
  const activity = new Map<string, { count: number; spent: number }>();
  for (const o of orderRows ?? []) {
    const cur = activity.get(o.user_id) ?? { count: 0, spent: 0 };
    cur.count += 1;
    if (SETTLED.includes(o.status)) cur.spent += o.amount ?? 0;
    activity.set(o.user_id, cur);
  }

  const authMeta = new Map<string, { provider: string; lastSignIn: string | null }>();
  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 5000 });
    for (const u of list?.users ?? []) {
      authMeta.set(u.id, {
        provider: (u.app_metadata?.provider as string) ?? "email",
        lastSignIn: u.last_sign_in_at ?? null,
      });
    }
  } catch {
    // best-effort
  }

  const headers = [
    "가입일시", "이름", "이메일", "연락처", "가입경로", "최근 로그인", "주문수", "결제액(원)",
  ];
  const lines = [headers.join(",")];
  for (const m of members) {
    const act = activity.get(m.id);
    const meta = authMeta.get(m.id);
    const provider = meta?.provider ?? "email";
    lines.push(
      [
        m.created_at,
        m.full_name || "",
        m.email || "",
        m.phone || "",
        PROVIDER_LABEL[provider] ?? provider,
        meta?.lastSignIn || "",
        act?.count ?? 0,
        act?.spent ?? 0,
      ]
        .map(cell)
        .join(","),
    );
  }

  // Prepend BOM so Excel reads UTF-8 Korean correctly.
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="glo-members.csv"`,
    },
  });
}
