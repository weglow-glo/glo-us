"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRoundOptions, SETTLE_HOLD_DAYS } from "@/lib/groupbuy";

/** 폼의 date 입력(YYYY-MM-DD)을 KST 자정 기준 timestamptz 로 */
function kstDate(value: FormDataEntryValue | null, endOfDay = false): string | null {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T${endOfDay ? "23:59:59" : "00:00:00"}+09:00`;
}

function str(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

// ─────────────────────────────────────────────── 셀러

export async function createSeller(formData: FormData) {
  const name = str(formData.get("name"));
  if (!name) return;

  const bank = str(formData.get("bank"));
  const account = str(formData.get("account"));
  const holder = str(formData.get("holder"));

  const admin = createAdminClient();
  await admin.from("sellers").insert({
    name,
    phone: str(formData.get("phone")),
    email: str(formData.get("email")),
    note: str(formData.get("note")),
    bank_info: bank || account ? { bank, account, holder } : null,
  });
  revalidatePath("/admin/sellers");
}

/** 카카오 계정 연결 — /admin/members 에서 확인한 회원 UUID 를 붙인다 */
export async function linkSellerUser(formData: FormData) {
  const sellerId = str(formData.get("seller_id"));
  const userId = str(formData.get("user_id"));
  if (!sellerId) return;

  const admin = createAdminClient();
  await admin
    .from("sellers")
    .update({ user_id: userId }) // 빈 값이면 연결 해제
    .eq("id", sellerId);
  revalidatePath("/admin/sellers");
}

export async function toggleSellerActive(formData: FormData) {
  const sellerId = str(formData.get("seller_id"));
  const active = String(formData.get("active")) === "true";
  if (!sellerId) return;

  const admin = createAdminClient();
  await admin.from("sellers").update({ active }).eq("id", sellerId);
  revalidatePath("/admin/sellers");
}

// ─────────────────────────────────────────────── 회차

/** 회차 생성 — 운영자가 조건까지 채워서 바로 승인 상태로 만든다.
 *  (셀러 신청 건은 approveRound 로 처리) */
export async function createRound(formData: FormData) {
  const sellerId = str(formData.get("seller_id"));
  const handle = str(formData.get("handle"))?.toLowerCase() ?? null;
  const startsAt = kstDate(formData.get("starts_at"));
  const endsAt = kstDate(formData.get("ends_at"), true);
  const rate = Number(formData.get("commission_rate"));
  const options = parseOptionsField(formData.get("options"));

  if (!sellerId || !handle || !/^[a-z0-9-]{2,40}$/.test(handle)) return;
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
  if (!options) return;

  const admin = createAdminClient();
  await admin.from("groupbuy_rounds").insert({
    seller_id: sellerId,
    type: String(formData.get("type")) === "sponsored" ? "sponsored" : "groupbuy",
    status: "approved",
    handle,
    display_name: str(formData.get("display_name")),
    starts_at: startsAt,
    ends_at: endsAt,
    options,
    commission_rate: rate,
    settle_due_at: settleDueOf(endsAt),
    admin_note: str(formData.get("admin_note")),
  });
  revalidatePath("/admin/sellers");
}

/** 셀러 신청(requested) 승인 — 조건을 채워서 approved 로 전환 */
export async function approveRound(formData: FormData) {
  const roundId = str(formData.get("round_id"));
  const handle = str(formData.get("handle"))?.toLowerCase() ?? null;
  const startsAt = kstDate(formData.get("starts_at"));
  const endsAt = kstDate(formData.get("ends_at"), true);
  const rate = Number(formData.get("commission_rate"));
  const options = parseOptionsField(formData.get("options"));

  if (!roundId || !handle || !/^[a-z0-9-]{2,40}$/.test(handle)) return;
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
  if (!options) return;

  const admin = createAdminClient();
  await admin
    .from("groupbuy_rounds")
    .update({
      status: "approved",
      handle,
      display_name: str(formData.get("display_name")),
      starts_at: startsAt,
      ends_at: endsAt,
      options,
      commission_rate: rate,
      settle_due_at: settleDueOf(endsAt),
      admin_note: str(formData.get("admin_note")),
    })
    .eq("id", roundId)
    .eq("status", "requested");
  revalidatePath("/admin/sellers");
}

export async function rejectRound(formData: FormData) {
  const roundId = str(formData.get("round_id"));
  if (!roundId) return;

  const admin = createAdminClient();
  await admin
    .from("groupbuy_rounds")
    .update({ status: "rejected", admin_note: str(formData.get("admin_note")) })
    .eq("id", roundId)
    .eq("status", "requested");
  revalidatePath("/admin/sellers");
}

/** 정산 확정 — 확정 시점의 paid 스냅샷 × 수수료율.
 *  (settle_due_at 이전에도 버튼은 누를 수 있게 두되, 화면에 기준일을 표시한다) */
export async function settleRound(formData: FormData) {
  const roundId = str(formData.get("round_id"));
  if (!roundId) return;

  const admin = createAdminClient();

  const { data: round } = await admin
    .from("groupbuy_rounds")
    .select("id, status, commission_rate, settled_at")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || round.settled_at || round.status !== "approved") return;

  const { data: orders } = await admin
    .from("orders")
    .select("amount, status")
    .eq("round_id", roundId)
    .eq("status", "paid")
    .limit(100000);
  const sales = (orders ?? []).reduce((s, o) => s + (o.amount ?? 0), 0);
  const rate = Number(round.commission_rate ?? 0);
  const settledAmount = Math.round((sales * rate) / 100);

  await admin
    .from("groupbuy_rounds")
    .update({
      status: "ended",
      settled_at: new Date().toISOString(),
      settled_amount: settledAmount,
    })
    .eq("id", roundId);
  revalidatePath("/admin/sellers");
}

// ─────────────────────────────────────────────── helpers

function settleDueOf(endsAtIso: string): string {
  return new Date(Date.parse(endsAtIso) + SETTLE_HOLD_DAYS * 86400_000).toISOString();
}

/** textarea 의 옵션 JSON — 한 줄씩 "key | 개월 | 라벨 | 가격" 형식도 허용 */
function parseOptionsField(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  // JSON 배열이면 그대로 검증
  if (raw.startsWith("[")) {
    try {
      return parseRoundOptions(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  // 줄 단위 축약형: gb3 | 3 | 3개월 분 | 228480 | 베스트(선택)
  const rows = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [key, months, label, price, badge] = line.split("|").map((s) => s.trim());
      return {
        key,
        months: Number(months),
        label,
        price: Number(price),
        ...(badge ? { badge } : {}),
      };
    });
  return parseRoundOptions(rows);
}
