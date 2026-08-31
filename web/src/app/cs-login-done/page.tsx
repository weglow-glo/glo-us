"use client";

import { useEffect } from "react";

/**
 * CS 위젯 팝업 로그인의 착지 페이지. 위젯이 연 팝업에서 카카오 로그인을 마치면
 * 여기로 리다이렉트되고, 부모 창(위젯)에 완료를 알린 뒤 스스로 닫힌다.
 * 부모가 없거나 닫기가 막히면 안내 문구만 보여준다.
 */
export default function CsLoginDone() {
  useEffect(() => {
    try {
      window.opener?.postMessage("glo-cs-login-done", window.location.origin);
    } catch {
      // opener 접근 불가 — 안내 문구로 충분
    }
    window.close();
  }, []);

  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-bg-1 p-6">
      <p className="text-sm text-ink-mute">
        로그인이 완료되었습니다. 이 창은 닫으셔도 됩니다.
      </p>
    </main>
  );
}
