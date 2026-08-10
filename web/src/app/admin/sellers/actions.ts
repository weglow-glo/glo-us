"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRoundOptions, SETTLE_HOLD_DAYS } from "@/lib/groupbuy";
import {
  dispatchSellerNotice,
  roundApprovedNotice,
  roundRejectedNotice,
  sellerApprovedNotice,
  sellerRejectedNotice,
} from "@/lib/groupbuy-notices";

/** 폼의 datetime-local(YYYY-MM-DDTHH:mm) 또는 date 입력을 KST timestamptz 로.
 *  날짜만 오면 시작은 자정, 종료는 23:59:59 로 채운다. */
function kstDate(value: FormDataEntryValue | null, endOfDay = false): string | null {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00+09:00`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return `${s}T${endOfDay ? "23:59:59" : "00:00:00"}+09:00`;
}

function str(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

// ─────────────────────────────────────────────── 셀러



/** 전용 URL 핸들 수정 — 셀러당 하나, 회차가 바뀌어도 고정.
 *  비우면 해제(다음 회차 승인 때 다시 지정). */
export async function updateSellerHandle(formData: FormData) {
  const sellerId = str(formData.get("seller_id"));
  if (!sellerId) return;

  const raw = str(formData.get("handle"))?.toLowerCase() ?? null;
  if (raw && !/^[a-z0-9-]{2,40}$/.test(raw)) return;

  const admin = createAdminClient();
  await admin.from("sellers").update({ handle: raw }).eq("id", sellerId);
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

// ─────────────────────────────────────────────── 셀러 지원 심사

/** 지원 승인 — sellers 행 생성(또는 재활성화) + 계정 연결 + 문자 안내 */
export async function approveApplication(formData: FormData) {
  const appId = str(formData.get("application_id"));
  if (!appId) return;

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("seller_applications")
    .select("id, user_id, status, name, phone, channel, follower, note")
    .eq("id", appId)
    .maybeSingle();
  if (!app || app.status !== "pending") return;

  // 과거 셀러였던 계정이면 재활성화, 아니면 새로 생성
  const { data: existing } = await admin
    .from("sellers")
    .select("id")
    .eq("user_id", app.user_id)
    .maybeSingle();
  if (existing) {
    await admin
      .from("sellers")
      .update({ active: true, name: app.name, phone: app.phone })
      .eq("id", existing.id);
  } else {
    await admin.from("sellers").insert({
      user_id: app.user_id,
      name: app.name,
      phone: app.phone,
      note: [app.channel, app.follower].filter(Boolean).join(" · ") || null,
    });
  }

  await admin
    .from("seller_applications")
    .update({ status: "approved", decided_at: new Date().toISOString() })
    .eq("id", app.id);

  dispatchSellerNotice(app.phone, sellerApprovedNotice(app.name));

  revalidatePath("/admin/sellers");
  revalidatePath("/admin/members");
}

/** 지원 반려 — 사유 기록 + 문자 안내 (재지원 가능) */
export async function rejectApplication(formData: FormData) {
  const appId = str(formData.get("application_id"));
  if (!appId) return;
  const note = str(formData.get("admin_note"));

  const admin = createAdminClient();
  const { data: app } = await admin
    .from("seller_applications")
    .select("id, status, name, phone")
    .eq("id", appId)
    .maybeSingle();
  if (!app || app.status !== "pending") return;

  await admin
    .from("seller_applications")
    .update({ status: "rejected", admin_note: note, decided_at: new Date().toISOString() })
    .eq("id", app.id);

  dispatchSellerNotice(app.phone, sellerRejectedNotice(app.name, note));

  revalidatePath("/admin/sellers");
}

// ─────────────────────────────────────────────── 회차

/** 셀러 신청(requested) 승인 — 조건을 채워서 approved 로 전환.
 *
 *  URL 핸들은 셀러당 하나로 영구 고정: 첫 회차 승인 때 폼에서 지정하고,
 *  이후 회차는 자동 재사용된다. 차수(round_no: 1차, 2차…)도 자동 부여. */
export async function approveRound(formData: FormData) {
  const roundId = str(formData.get("round_id"));
  const startsAt = kstDate(formData.get("starts_at"));
  const endsAt = kstDate(formData.get("ends_at"), true);
  const rate = Number(formData.get("commission_rate"));
  const options = parseOptionsField(formData.get("options"));

  if (!roundId) return;
  if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return;
  if (!options) return;

  const admin = createAdminClient();

  const { data: reqRound } = await admin
    .from("groupbuy_rounds")
    .select("id, status, seller_id")
    .eq("id", roundId)
    .eq("status", "requested")
    .maybeSingle();
  if (!reqRound) return;

  const { data: seller } = await admin
    .from("sellers")
    .select("id, name, phone, handle")
    .eq("id", reqRound.seller_id)
    .maybeSingle();
  if (!seller) return;

  // 핸들: 이미 있으면 재사용, 없으면(첫 회차) 폼 입력을 셀러에 저장
  let handle = seller.handle;
  if (!handle) {
    const input = str(formData.get("handle"))?.toLowerCase() ?? null;
    if (!input || !/^[a-z0-9-]{2,40}$/.test(input)) return;
    const { error: handleErr } = await admin
      .from("sellers")
      .update({ handle: input })
      .eq("id", seller.id);
    if (handleErr) return; // 중복 핸들 등 — 화면에서 다른 값으로 재시도
    handle = input;
  }

  // 차수: 이 셀러의 승인·종료 회차 수 + 1
  const { count } = await admin
    .from("groupbuy_rounds")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", seller.id)
    .in("status", ["approved", "ended"]);
  const roundNo = (count ?? 0) + 1;

  const { data: updated } = await admin
    .from("groupbuy_rounds")
    .update({
      status: "approved",
      round_no: roundNo,
      display_name: str(formData.get("display_name")),
      starts_at: startsAt,
      ends_at: endsAt,
      options,
      commission_rate: rate,
      settle_due_at: settleDueOf(endsAt),
      admin_note: str(formData.get("admin_note")),
    })
    .eq("id", roundId)
    .eq("status", "requested")
    .select("id")
    .maybeSingle();

  // 확정 안내 — 링크·기간·수수료율
  if (updated) {
    dispatchSellerNotice(
      seller.phone,
      roundApprovedNotice({
        name: seller.name ?? "셀러",
        period: `${startsAt.slice(0, 10)} ${startsAt.slice(11, 16)} ~ ${endsAt.slice(0, 10)} ${endsAt.slice(11, 16)}`,
        rate,
        handle,
      }),
    );
  }

  revalidatePath("/admin/sellers");
}

export async function rejectRound(formData: FormData) {
  const roundId = str(formData.get("round_id"));
  if (!roundId) return;
  const note = str(formData.get("admin_note"));

  const admin = createAdminClient();
  const { data: updated } = await admin
    .from("groupbuy_rounds")
    .update({ status: "rejected", admin_note: note })
    .eq("id", roundId)
    .eq("status", "requested")
    .select("seller_id")
    .maybeSingle();

  if (updated) {
    const { data: seller } = await admin
      .from("sellers")
      .select("name, phone")
      .eq("id", updated.seller_id)
      .maybeSingle();
    dispatchSellerNotice(seller?.phone, roundRejectedNotice(seller?.name ?? "셀러", note));
  }

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
    .select("id, status, commission_rate, settled_at, ends_at")
    .eq("id", roundId)
    .maybeSingle();
  if (!round || round.settled_at || round.status !== "approved") return;
  // 진행 중 회차는 확정 불가 — 종료 후에만 (UI 도 기준일부터만 노출)
  if (!round.ends_at || Date.now() < Date.parse(round.ends_at)) return;

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

/** 정산 기준일 = 회차 종료 + 3주가 지난 뒤 도래하는 첫 금요일 00:00 KST.
 *  (21일째가 금요일이면 그날) — 정산일을 금요일로 통일해 이체 업무를 모은다. */
function settleDueOf(endsAtIso: string): string {
  const base = Date.parse(endsAtIso) + SETTLE_HOLD_DAYS * 86400_000;
  // KST 기준 그날 자정과 요일
  const kst = new Date(base + 9 * 3600_000);
  const kstMidnightUtc =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000;
  const daysToFriday = (5 - kst.getUTCDay() + 7) % 7; // 0=일 … 5=금
  return new Date(kstMidnightUtc + daysToFriday * 86400_000).toISOString();
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
