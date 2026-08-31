-- ============================================================
-- glo — 자체 CS 채팅 (채널톡 대체). Run in Supabase Dashboard → SQL Editor (after 0011).
--
-- 모든 읽기/쓰기는 API route / 서버 액션(service role) 경유 — RLS는 켜되
-- 정책을 만들지 않는다 (reviews와 동일한 잠금 패턴).
-- 실시간은 postgres_changes가 아니라 Realtime Broadcast(HTTP 발행)로 쏜다:
-- 비회원은 JWT가 없어 RLS 기반 postgres_changes 구독이 불가하기 때문.
-- ============================================================

create table if not exists public.cs_conversations (
  id             uuid primary key default gen_random_uuid(),
  -- 위젯 접근 토큰. 브라우저 localStorage에 저장되는 비밀값 — 이 토큰을 아는
  -- 클라이언트만 대화를 읽고 쓸 수 있다 (비회원 식별 겸용).
  client_token   uuid not null unique default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  display_name   text,                                -- 회원 이름 (비회원이면 null)
  status         text not null default 'open' check (status in ('open', 'closed')),
  last_preview   text,                                -- 관리자 목록용 마지막 메시지 미리보기
  last_message_at          timestamptz not null default now(),
  last_customer_message_at timestamptz,
  admin_unread    int not null default 0,             -- 관리자가 안 읽은 고객 메시지 수
  customer_unread int not null default 0,             -- 고객이 안 읽은 답변 수
  created_at     timestamptz not null default now()
);

create index if not exists cs_conversations_last_idx on public.cs_conversations (last_message_at desc);
create index if not exists cs_conversations_user_idx on public.cs_conversations (user_id);

create table if not exists public.cs_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.cs_conversations (id) on delete cascade,
  sender          text not null check (sender in ('customer', 'admin')),
  body            text not null,
  created_at      timestamptz not null default now()
);

create index if not exists cs_messages_conv_idx on public.cs_messages (conversation_id, created_at);

alter table public.cs_conversations enable row level security;
alter table public.cs_messages enable row level security;
-- 정책 없음 → anon/authenticated 직접 접근 차단, service role만 통과.
