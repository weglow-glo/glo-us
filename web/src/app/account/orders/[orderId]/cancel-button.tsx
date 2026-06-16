"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (busy) return;
    if (!window.confirm("이 주문의 결제를 취소할까요? 취소 후에는 되돌릴 수 없습니다.")) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "결제 취소에 실패했습니다.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제 취소에 실패했습니다.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={cancel}
        disabled={busy}
        className="rounded-full border border-burg-400 px-6 py-3 text-sm font-semibold text-burg-400 transition hover:bg-burg-400 hover:text-cream disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "취소 처리 중…" : "결제 취소"}
      </button>
      {error && <p className="mt-2 text-sm text-burg-400">{error}</p>}
    </div>
  );
}
