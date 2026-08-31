"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  csConvTopic,
  CS_CATEGORY_LABEL,
  type CsCategory,
  type CsMessage,
  type CsMeta,
} from "@/lib/cs";

/**
 * 자체 CS 채팅 위젯 — 채널톡 자리를 대체하는 우하단 버블.
 * NEXT_PUBLIC_CS_WIDGET=1 일 때 layout.tsx가 ChannelTalk 대신 이걸 렌더한다.
 *
 * 대화 접근권은 localStorage의 client_token(비밀 uuid). 비회원도 이 토큰으로
 * 대화가 이어지고, 로그인 회원은 토큰이 없어도 서버가 세션으로 되찾아준다.
 * 실시간 수신은 Supabase Realtime Broadcast 구독 (cs-conv-<id>).
 */

const TOKEN_KEY = "glo-cs-token";
/** 로그인 유도 후 복귀했을 때 위젯을 자동으로 다시 열고 대화를 잇는 플래그 */
const RESUME_KEY = "glo-cs-resume";

/**
 * 하단 고정 바(상세페이지 모바일 .buy-float, 체크아웃 결제바 [data-glo-bottombar])가
 * 보이면 그 위로 버블을 띄운다. 마케팅 _scroll-top.tsx의 "맨 위로" 버튼은
 * 위젯이 켜져 있으면 이 버블 위(+68px)로 스택된다.
 */
function calcBottom(): number {
  let lift = 20;
  document.querySelectorAll(".buy-float, [data-glo-bottombar]").forEach((el) => {
    const cs = getComputedStyle(el);
    // (체크아웃 바는 PC에선 static으로 풀린다 — fixed일 때만 피한다)
    if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.height === 0) return;
    lift = Math.max(lift, Math.round(window.innerHeight - r.top) + 12);
  });
  return lift;
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 시크릿 모드 등 저장 불가 — 세션 동안만 state로 유지된다.
  }
}

type Conv = { id: string; token: string; status: string };

export default function CsWidget() {
  const pathname = usePathname();
  const onAdmin = pathname?.startsWith("/admin") ?? false;

  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const [bottom, setBottom] = useState(20);
  const loadedRef = useRef(false);
  const openRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(false);
  }, [open]);

  // 페이지 이동/리사이즈 때마다 하단 바를 피해 위치를 다시 잡는다.
  useEffect(() => {
    if (onAdmin) return;
    const recalc = () => setBottom(calcBottom());
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [onAdmin, pathname]);

  const load = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const token = getToken();
      const res = await fetch(`/api/cs/messages${token ? `?token=${token}` : ""}`);
      if (!res.ok) return;
      const j = (await res.json()) as { conversation: Conv | null; messages: CsMessage[] };
      if (j.conversation) {
        setConv(j.conversation);
        saveToken(j.conversation.token);
        setMessages(j.messages);
      }
    } catch {
      loadedRef.current = false; // 다음 열기에서 재시도
    }
  }, []);

  // 기존 대화가 있는 방문자만 마운트 시 복원 (신규 방문자는 열 때까지 요청 없음).
  // 답변 뱃지를 위해 위젯이 닫혀 있어도 구독은 유지한다.
  useEffect(() => {
    if (!onAdmin && getToken()) void load();
  }, [onAdmin, load]);

  // 첫 열기 — 토큰은 없지만 로그인 회원일 수 있으니 세션으로 조회해본다.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!conv?.id) return;
    const supabase = createClient();
    const ch = supabase
      .channel(csConvTopic(conv.id))
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const m = payload as CsMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        if (m.sender === "admin" && !openRef.current) setUnread(true);
      })
      .subscribe((status, err) => {
        // 구독 실패는 조용히 지나가면 답변 미수신으로 이어진다 — 콘솔에 남긴다.
        if (status !== "SUBSCRIBED") console.warn("[cs] realtime:", status, err?.message ?? "");
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [conv?.id]);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function sendMessage(text: string, meta?: CsMeta) {
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/cs/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: getToken() ?? conv?.token ?? null,
          body: text,
          meta: meta ?? null,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        conversation?: Conv;
        message?: CsMessage;
        botReply?: CsMessage | null;
      };
      if (!res.ok || !j.ok || !j.conversation || !j.message) {
        setError(j.error ?? "전송에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setConv(j.conversation);
      saveToken(j.conversation.token);
      const incoming = [j.message, ...(j.botReply ? [j.botReply] : [])];
      setMessages((prev) => [
        ...prev,
        ...incoming.filter((m) => !prev.some((x) => x.id === m.id)),
      ]);
      setInput("");
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  function handleSend() {
    void sendMessage(input.trim());
  }

  /** 로그인 유도 카드 → 로그인 페이지로 (복귀 시 위젯 자동 재개) */
  function goLogin() {
    try {
      sessionStorage.setItem(RESUME_KEY, "1");
    } catch {
      // 저장 불가 환경 — 복귀 자동 재개만 포기
    }
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }

  // 로그인 후 복귀 — 위젯을 열고 진행 중이던 퍼널 스텝을 서버에 다시 요청한다.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (onAdmin || resumedRef.current) return;
    let flagged = false;
    try {
      flagged = sessionStorage.getItem(RESUME_KEY) === "1";
      if (flagged) sessionStorage.removeItem(RESUME_KEY);
    } catch {
      flagged = false;
    }
    if (!flagged) return;
    resumedRef.current = true;
    setOpen(true);
    void (async () => {
      await load();
      await sendMessage("로그인했습니다", { kind: "resume" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAdmin]);

  if (onAdmin) return null;

  return (
    <div
      className="fixed right-5 z-[70] flex flex-col items-end"
      // transition:none — 전역 reduced-motion 오버라이드(* { transition-duration: .01ms })가
      // 위치 변경까지 트랜지션으로 만들면 렌더가 멈춘 백그라운드 탭에서 이전 위치에 고착된다.
      style={{ bottom, transition: "none" }}
    >
      {open && (
        <div
          className="flex flex-col overflow-hidden border border-ink-line bg-bg-1 shadow-2xl max-sm:fixed max-sm:inset-2 max-sm:z-[80] max-sm:rounded-2xl sm:mb-3! sm:h-(--cs-h) sm:w-[360px] sm:rounded-2xl"
          style={{ "--cs-h": `min(520px, calc(100dvh - ${bottom + 96}px))` } as React.CSSProperties}
        >
          <div className="flex items-start justify-between gap-3 bg-burg-600 px-5! py-4! text-cream">
            <div className="min-w-0">
              <p className="text-base">
                <span className="font-display">glo</span> 고객 문의
              </p>
              <p className="mt-0.5! text-xs leading-relaxed text-cream/70">
                평일 10:00–18:00 · 자리를 비운 시간에는 순차적으로 답변드립니다.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="문의창 닫기"
              className="-mr-1! mt-0.5! shrink-0 rounded-full p-1.5! text-cream/70 transition hover:bg-burg-400 hover:text-cream"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2! overflow-y-auto bg-bg-2 p-4!">
            {messages.length === 0 && (
              <>
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-ink-line bg-bg-1 px-3.5! py-2.5! text-sm leading-relaxed text-ink">
                    안녕하세요, <span className="font-display">glo</span>입니다. 어떤
                    문의로 찾아주셨나요? 아래에서 선택하시거나 바로 입력하셔도 됩니다.
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1!">
                  {(Object.keys(CS_CATEGORY_LABEL) as CsCategory[]).map((k) => (
                    <button
                      key={k}
                      disabled={sending}
                      onClick={() =>
                        void sendMessage(CS_CATEGORY_LABEL[k], { kind: "category", value: k })
                      }
                      className="rounded-full border border-burg-50 bg-bg-1 px-3.5! py-2! text-[13px] font-medium text-ink transition hover:border-accent hover:text-accent disabled:opacity-40"
                    >
                      {CS_CATEGORY_LABEL[k]}
                    </button>
                  ))}
                </div>
              </>
            )}
            {messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              const meta = m.meta ?? null;
              return (
                <div key={m.id}>
                  {m.sender !== "customer" && (
                    <p className="mb-0.5! text-[10px] text-ink-faint">
                      {m.sender === "bot" ? "AI 도우미" : "상담원"}
                    </p>
                  )}
                  <div
                    className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5! py-2! text-sm leading-relaxed ${
                        m.sender === "customer"
                          ? "rounded-br-md bg-burg-600 text-cream"
                          : "rounded-bl-md border border-ink-line bg-bg-1 text-ink"
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                  {/* 구조화 메시지의 버튼은 최신 메시지일 때만 활성 표시 */}
                  {isLast && meta?.kind === "login_prompt" && (
                    <div className="mt-2! flex justify-start">
                      <button
                        onClick={goLogin}
                        className="rounded-full bg-burg-600 px-4! py-2.5! text-[13px] font-semibold text-cream transition hover:bg-burg-400"
                      >
                        로그인하고 주문 확인하기
                      </button>
                    </div>
                  )}
                  {isLast && meta?.kind === "order_picker" && (
                    <div className="mt-2! space-y-1.5!">
                      {meta.orders.map((o) => (
                        <button
                          key={o.orderId}
                          disabled={sending}
                          onClick={() =>
                            void sendMessage(o.label, {
                              kind: "order_select",
                              orderId: o.orderId,
                            })
                          }
                          className="block w-full rounded-xl border border-ink-line bg-bg-1 px-3.5! py-2.5! text-left text-[13px] text-ink transition hover:border-accent disabled:opacity-40"
                        >
                          <span className="font-semibold">{o.label}</span>
                          <span className="ml-2! text-ink-mute">{o.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-ink-line bg-bg-1 p-3!">
            <div className="mb-1.5! flex justify-end">
              <button
                onClick={() => void sendMessage("상담원 연결을 원해요", { kind: "escalate" })}
                disabled={sending}
                className="text-[11px] text-ink-faint underline underline-offset-2 transition hover:text-accent disabled:opacity-40"
              >
                상담원 연결
              </button>
            </div>
            {error && <p className="mb-2! text-xs text-accent">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                placeholder="메시지를 입력하세요"
                aria-label="문의 메시지"
                className="max-h-24 min-w-0 flex-1 resize-none rounded-xl border border-ink-line bg-bg-2 px-3.5! py-2.5! text-sm text-ink placeholder:text-ink-faint"
              />
              <button
                onClick={() => void handleSend()}
                disabled={sending || !input.trim()}
                className="shrink-0 rounded-full bg-burg-600 px-4! py-2.5! text-sm font-semibold text-cream transition hover:bg-burg-400 disabled:opacity-40"
              >
                전송
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "문의창 닫기" : "문의하기"}
        aria-expanded={open}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-cream bg-burg-600 text-cream shadow-lg transition hover:bg-burg-400 ${
          open ? "max-sm:hidden" : ""
        }`}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.2c-.33.25-.8.01-.8-.4V6.5Z"
              fill="currentColor"
            />
          </svg>
        )}
        {unread && (
          <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-bg-1 bg-accent" />
        )}
      </button>
    </div>
  );
}
