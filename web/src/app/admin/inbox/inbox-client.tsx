"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { CS_INBOX_TOPIC, csConvTopic, type CsMessage } from "@/lib/cs";
import {
  fetchInbox,
  fetchThread,
  markThreadRead,
  sendReply,
  setConversationMode,
  setConversationStatus,
  type InboxConversation,
  type ThreadOrder,
} from "./actions";
import { CS_CATEGORY_LABEL, type CsCategory } from "@/lib/cs";

/**
 * 문의관리 인박스 — 좌측 대화 목록 + 우측 스레드.
 * 실시간은 Realtime Broadcast 구독: cs-inbox(목록 갱신) + cs-conv-<id>(선택 스레드).
 * 모바일(운영자 폰)에서는 목록/스레드를 한 화면씩 전환한다.
 */

const ORDER_STATUS_KO: Record<string, string> = {
  pending: "결제대기",
  awaiting_deposit: "입금대기",
  paid: "결제완료",
  preparing: "배송준비중",
  shipped: "배송중",
  delivered: "배송완료",
  canceled: "취소",
  refunded: "환불",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("ko-KR", {
    ...(sameDay ? {} : { month: "numeric", day: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Filter = "all" | "unread" | "closed";

export default function InboxClient({
  initialConversations,
  initialSelectedId,
}: {
  initialConversations: InboxConversation[];
  initialSelectedId: string | null;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  // 미답변이 상담원의 기본 업무 목록 — 첫 진입 시 미답변 탭
  const [filter, setFilter] = useState<Filter>("unread");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [orders, setOrders] = useState<ThreadOrder[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const refreshInbox = useCallback(async () => {
    setConversations(await fetchInbox());
  }, []);

  // 목록 실시간 갱신 + 백그라운드 탭이면 브라우저 알림 (베스트에포트)
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
    const supabase = createClient();
    const ch = supabase
      .channel(CS_INBOX_TOPIC)
      .on("broadcast", { event: "update" }, () => {
        void refreshInbox();
        if (
          document.hidden &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification("glo 문의관리", { body: "새 CS 메시지가 도착했습니다." });
          } catch {
            // 알림 미지원 환경 — 무시
          }
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [refreshInbox]);

  // 선택한 스레드 로드 + 실시간 구독
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    setMessages([]);
    setOrders([]);
    setError(null);
    void fetchThread(selectedId).then(({ messages, orders }) => {
      if (!alive) return;
      setMessages(messages);
      setOrders(orders);
      setConversations((cs) =>
        cs.map((c) => (c.id === selectedId ? { ...c, admin_unread: 0 } : c)),
      );
    });

    const supabase = createClient();
    const ch = supabase
      .channel(csConvTopic(selectedId))
      .on("broadcast", { event: "message" }, ({ payload }) => {
        const m = payload as CsMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        // 보고 있는 스레드에 온 고객 메시지는 즉시 읽음 처리
        if (m.sender === "customer") void markThreadRead(selectedId);
      })
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(ch);
    };
  }, [selectedId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // 탭 제목에 미답변 수 표시 — 다른 작업 중에도 눈에 띄게
  const totalUnread = conversations.reduce((s, c) => s + c.admin_unread, 0);
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) glo 문의관리` : "glo 문의관리";
  }, [totalUnread]);

  async function handleSend() {
    if (!selectedId || sending) return;
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setError(null);
    const r = await sendReply(selectedId, text);
    setSending(false);
    if (!r.ok || !r.message) {
      setError(r.error ?? "전송에 실패했습니다.");
      return;
    }
    const m = r.message;
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    // 서버가 답변과 함께 상담원 모드로 전환한다 — 목록 상태도 맞춘다
    setConversations((cs) =>
      cs.map((c) => (c.id === selectedId ? { ...c, mode: "human" as const } : c)),
    );
    setInput("");
  }

  async function handleStatus(status: "open" | "closed") {
    if (!selectedId) return;
    await setConversationStatus(selectedId, status);
    setConversations((cs) => cs.map((c) => (c.id === selectedId ? { ...c, status } : c)));
  }

  const visible = conversations.filter((c) =>
    filter === "unread" ? c.admin_unread > 0 : filter === "closed" ? c.status === "closed" : true,
  );

  const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "unread", label: "미답변" },
    { key: "closed", label: "완료" },
  ];

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex h-[calc(100dvh-140px)] min-h-[420px] overflow-hidden rounded-xl border border-ink-line bg-bg-1">
        {/* 대화 목록 */}
        <aside
          className={`${selectedId ? "hidden md:flex" : "flex"} w-full flex-col border-ink-line md:w-80 md:shrink-0 md:border-r`}
        >
          <div className="flex items-center gap-1 border-b border-ink-line px-3 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  filter === f.key ? "bg-ink text-cream" : "text-ink-mute hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-ink-faint">{visible.length}건</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 && (
              <p className="px-4 py-10 text-center text-sm text-ink-mute">
                {filter === "unread" ? "미답변 문의가 없습니다." : "아직 문의가 없습니다."}
              </p>
            )}
            {visible.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`block w-full border-b border-ink-line-2 px-4 py-3 text-left transition hover:bg-bg-2 ${
                  c.id === selectedId ? "bg-bg-3" : ""
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink">
                    {c.display_name ?? "비회원"}
                  </span>
                  {c.mode === "bot" && (
                    <span className="rounded-full bg-bg-3 px-1.5 py-0.5 text-[10px] font-semibold text-burg-300">
                      봇
                    </span>
                  )}
                  {c.category && (
                    <span className="text-[11px] text-ink-faint">
                      {CS_CATEGORY_LABEL[c.category as CsCategory] ?? c.category}
                    </span>
                  )}
                  {c.status === "closed" && (
                    <span className="text-[11px] text-ink-faint">완료</span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-ink-faint">
                    {fmtTime(c.last_message_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="truncate text-[13px] text-ink-mute">{c.last_preview ?? ""}</p>
                  {c.admin_unread > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-bold leading-none text-cream">
                      {c.admin_unread}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* 스레드 */}
        <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {!selected ? (
            <p className="m-auto text-sm text-ink-mute">왼쪽에서 대화를 선택하세요.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-ink-line px-4 py-3">
                <button
                  onClick={() => setSelectedId(null)}
                  className="text-sm text-ink-mute hover:text-ink md:hidden"
                  aria-label="목록으로"
                >
                  ←
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {selected.display_name ?? "비회원"}
                    {!selected.user_id && (
                      <span className="ml-2 text-xs font-normal text-ink-faint">
                        비로그인 문의
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-ink-faint">
                    시작 {fmtTime(selected.created_at)}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const next = selected.mode === "bot" ? "human" : "bot";
                    await setConversationMode(selected.id, next);
                    setConversations((cs) =>
                      cs.map((c) => (c.id === selected.id ? { ...c, mode: next } : c)),
                    );
                  }}
                  className={`ml-auto rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    selected.mode === "bot"
                      ? "border-burg-50 bg-bg-3 text-burg-300"
                      : "border-ink-line text-ink-mute hover:text-ink"
                  }`}
                  title={
                    selected.mode === "bot"
                      ? "현재 AI 봇이 응대 중 — 누르면 상담원 모드로 전환"
                      : "누르면 AI 봇 응대를 재개"
                  }
                >
                  {selected.mode === "bot" ? "봇 응대 중" : "봇 재개"}
                </button>
                <button
                  onClick={() => handleStatus(selected.status === "closed" ? "open" : "closed")}
                  className="rounded-full border border-ink-line px-3 py-1 text-xs font-semibold text-ink-mute transition hover:text-ink"
                >
                  {selected.status === "closed" ? "다시 열기" : "완료 처리"}
                </button>
              </div>

              {orders.length > 0 && (
                <div className="flex gap-2 overflow-x-auto border-b border-ink-line-2 bg-bg-2 px-4 py-2">
                  {orders.map((o) => (
                    <Link
                      key={o.id}
                      href={`/admin/orders/${o.id}`}
                      className="shrink-0 rounded-lg border border-ink-line bg-bg-1 px-3 py-1.5 text-[11px] leading-tight text-ink-mute transition hover:text-ink"
                    >
                      <span className="font-semibold text-ink">
                        {ORDER_STATUS_KO[o.status] ?? o.status}
                      </span>{" "}
                      · {o.order_id}
                      {o.tracking_number && <> · 송장 {o.tracking_number}</>}
                    </Link>
                  ))}
                </div>
              )}

              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-bg-2 p-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === "customer" ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                        m.sender === "admin"
                          ? "rounded-br-md bg-burg-600 text-cream"
                          : m.sender === "bot"
                            ? "rounded-br-md border border-burg-50 bg-bg-3 text-ink"
                            : "rounded-bl-md border border-ink-line bg-bg-1 text-ink"
                      }`}
                    >
                      {m.sender === "bot" && (
                        <span className="mb-0.5 block text-[10px] font-semibold text-burg-300">
                          AI 봇
                        </span>
                      )}
                      {m.meta?.kind === "images" ? (
                        <span className="flex flex-wrap gap-1.5 py-1">
                          {m.meta.urls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={u}
                                alt="고객 첨부 사진"
                                className="max-h-40 max-w-[180px] rounded-lg object-cover"
                              />
                            </a>
                          ))}
                        </span>
                      ) : (
                        m.body
                      )}
                      <span
                        className={`mt-1 block text-right text-[10px] ${
                          m.sender === "admin" ? "text-cream/60" : "text-ink-faint"
                        }`}
                      >
                        {fmtTime(m.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-ink-line p-3">
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
                    rows={2}
                    placeholder="답변 입력 — Enter 전송, Shift+Enter 줄바꿈"
                    className="flex-1 resize-none rounded-lg border border-ink-line bg-bg-1 px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={sending || !input.trim()}
                    className="rounded-full bg-burg-600 px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-burg-400 disabled:opacity-40"
                  >
                    전송
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
