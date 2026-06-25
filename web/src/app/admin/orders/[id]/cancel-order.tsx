"use client";

import { useActionState } from "react";
import { cancelOrder } from "../../actions";

type State = { ok: boolean; error?: string; message?: string };
const initial: State = { ok: false };

export default function CancelOrder({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelOrder, initial);
  const done = state.ok && !!state.message;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="mb-1 block text-xs text-ink-mute">취소 사유 (선택)</span>
        <input
          name="reason"
          placeholder="관리자 취소"
          disabled={pending || done}
          className="w-full rounded-md border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink outline-none focus:border-accent disabled:opacity-50"
        />
      </label>
      <button
        disabled={pending || done}
        onClick={(e) => {
          if (!window.confirm("이 주문의 결제를 취소(전액 환불)합니다. 되돌릴 수 없습니다. 진행할까요?"))
            e.preventDefault();
        }}
        className="self-start rounded-md border border-burg-400 px-4 py-2 text-sm font-semibold text-burg-400 transition hover:bg-burg-400 hover:text-cream disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "취소 처리 중…" : "결제 취소 (전액 환불)"}
      </button>
      {state.error && <p className="text-sm font-medium text-burg-400">⚠ {state.error}</p>}
      {done && <p className="text-sm font-medium text-accent">✓ {state.message}</p>}
    </form>
  );
}
