"use client";

import { useActionState } from "react";
import { wmsPushAction, wmsPullAction } from "./actions";

/**
 * 이벗WMS 수동 실행 버튼 — 서버 액션의 결과 문자열을 화면에 그대로
 * 보여준다 (환경변수 누락·IP 차단·마이그레이션 미실행 등 실패 원인이
 * 조용히 삼켜지지 않도록).
 */
export function WmsControls() {
  const [pushMsg, push, pushing] = useActionState(wmsPushAction, null);
  const [pullMsg, pull, pulling] = useActionState(wmsPullAction, null);
  const msg = pushing || pulling ? "실행 중…" : (pushMsg ?? pullMsg);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={push}>
          <button
            disabled={pushing || pulling}
            className="rounded-full bg-burg-600 px-5 py-2 text-sm font-semibold text-bg-1 transition hover:bg-burg-400 disabled:opacity-50"
          >
            {pushing ? "전송 중…" : "지금 발주 전송"}
          </button>
        </form>
        <form action={pull}>
          <button
            disabled={pushing || pulling}
            className="rounded-full border border-ink-line px-5 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {pulling ? "회수 중…" : "지금 송장 회수"}
          </button>
        </form>
      </div>
      {msg && (
        <p
          className={`max-w-[560px] text-right text-xs ${
            msg.startsWith("실패") ? "text-red-600" : "text-ink-soft"
          }`}
        >
          {msg}
        </p>
      )}
    </div>
  );
}
