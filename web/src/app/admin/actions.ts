"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

/** Mark an order shipped (sets tracking number + shipped_at). */
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

/** Move an order to 'preparing' (발주/포장 단계). */
export async function markPreparing(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status: "preparing" }).eq("id", id);

  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${id}`);
}
