"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/** Enter a tracking number → 배송중 (dispatched / in transit). */
export async function markShipped(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const tracking = String(formData.get("tracking") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({
      status: "shipped",
      tracking_number: tracking || null,
      shipped_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Move an order to 'preparing' (배송준비중 — 발주/포장 단계, 송장 전). */
export async function markPreparing(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status: "preparing" }).eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/** Confirm delivery → 배송완료. */
export async function markDelivered(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}

/**
 * Bulk tracking registration. Paste one order per line:
 *   "glo_1781... 1234567890"  (order_id and tracking separated by space/comma/tab)
 * Each matched order is moved to 배송중 with its tracking number.
 */
export async function bulkTracking(formData: FormData) {
  const raw = String(formData.get("bulk") ?? "");
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const rows = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[\s,\t]+/))
    .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
    .map(([orderId, tracking]) => ({ orderId, tracking }));

  for (const { orderId, tracking } of rows) {
    await admin
      .from("orders")
      .update({ status: "shipped", tracking_number: tracking, shipped_at: now })
      .eq("order_id", orderId);
  }

  revalidatePath("/admin");
}
