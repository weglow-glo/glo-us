"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { csConvTopic, type CsMessage } from "@/lib/cs";

/**
 * 자체 CS 채팅 위젯 — 채널톡 자리를 대체하는 우하단 버블.
 * NEXT_PUBLIC_CS_WIDGET=1 일 때 layout.tsx가 ChannelTalk 대신 이걸 렌더한다.
 *
 * 대화 접근권은 localStorage의 client_token(비밀 uuid). 비회원도 이 토큰으로
 * 대화가 이어지고, 로그인 회원은 토큰이 없어도 서버가 세션으로 되찾아준다.
 * 실시간 수신은 Supabase Realtime Broadcast 구독 (cs-conv-<id>).
 */

const TOKEN_KEY = "glo-cs-token";

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
  const loadedRef = useRef(false);
  const openRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openRef.current = open;
    if (open) setUnread(false);
  }, [open]);

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

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/cs/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: getToken() ?? conv?.token ?? null, body: text }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        conversation?: Conv;
        message?: CsMessage;
      };
      if (!res.ok || !j.ok || !j.conversation || !j.message) {
        setError(j.error ?? "전송에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setConv(j.conversation);
      saveToken(j.conversation.token);
      const m = j.message;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setInput("");
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setSending(false);
    }
  }

  if (onAdmin) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {open && (
        <div className="mb-3 flex h-[min(520px,calc(100dvh-120px))] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-2xl border border-ink-line bg-bg-1 shadow-2xl">
          <div className="bg-burg-600 px-5 py-4 text-cream">
            <p className="text-base">
              <span className="font-display">glo</span> 고객 문의
            </p>
            <p className="mt-0.5 text-xs text-cream/70">
              평일 10:00–18:00 · 자리를 비운 시간에는 순차적으로 답변드립니다.
            </p>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-bg-2 p-4">
            {messages.length === 0 && (
              <div className="rounded-xl border border-ink-line bg-bg-1 px-4 py-3 text-[13px] leading-relaxed text-ink-mute">
                무엇을 도와드릴까요? 주문·배송 문의는 로그인 상태에서 남겨주시면 더
                빠르게 확인해드릴 수 있습니다.
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === "customer" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                    m.sender === "customer"
                      ? "rounded-br-md bg-burg-600 text-cream"
                      : "rounded-bl-md border border-ink-line bg-bg-1 text-ink"
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-ink-line bg-bg-1 p-3">
            {error && <p className="mb-2 text-xs text-accent">{error}</p>}
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
                className="max-h-24 flex-1 resize-none rounded-xl border border-ink-line bg-bg-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint"
              />
              <button
                onClick={() => void handleSend()}
                disabled={sending || !input.trim()}
                className="rounded-full bg-burg-600 px-4 py-2.5 text-sm font-semibold text-cream transition hover:bg-burg-400 disabled:opacity-40"
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
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-burg-600 text-cream shadow-lg transition hover:bg-burg-400"
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
