-- ============================================================
-- glo — CS AI 봇 (퍼널 + Claude 상담). Run in Supabase Dashboard → SQL Editor (after 0015).
--
-- mode: 'bot' = AI/규칙 기반 자동 응대, 'human' = 상담원 모드(슬랙 통지 대상).
-- 새 대화는 bot으로 시작하고, 고객의 상담원 연결 요청·봇의 escalate 판단·
-- 상담원의 직접 답변 시 human으로 전환된다.
-- ============================================================

alter table public.cs_conversations
  add column if not exists category text
    check (category in ('order', 'shipping', 'product', 'refund', 'etc')),
  add column if not exists mode text not null default 'bot'
    check (mode in ('bot', 'human')),
  add column if not exists order_id text;   -- 퍼널에서 고객이 선택한 주문 (orders.order_id)

-- 기존 대화는 전부 상담원이 응대하던 건 — 봇이 끼어들지 않게 human으로.
update public.cs_conversations set mode = 'human' where mode = 'bot';

-- sender에 'bot' 추가 + 구조화 메시지(칩·로그인 카드·주문 선택 카드)용 meta
alter table public.cs_messages drop constraint if exists cs_messages_sender_check;
alter table public.cs_messages
  add constraint cs_messages_sender_check check (sender in ('customer', 'admin', 'bot'));
alter table public.cs_messages add column if not exists meta jsonb;
