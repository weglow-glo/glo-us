-- 배송 알림 (송장 등록 시 문자/알림톡 발송)
-- 택배사와 발송 이력을 주문에 기록해, 재발송·중복발송 여부를 관리자에서 확인할 수 있게 한다.

alter table public.orders add column if not exists carrier text;
alter table public.orders add column if not exists shipping_notified_at timestamptz;

-- 발송 로그: 성공/실패를 남겨야 실패 건만 골라 재발송할 수 있다.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  kind text not null,                 -- 'shipped' 등 알림 종류
  channel text not null,              -- 'sms' | 'lms' | 'alimtalk'
  to_phone text,
  status text not null,               -- 'sent' | 'failed'
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_order_id_idx on public.notifications (order_id);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);

-- 서비스 롤(관리자 서버)만 접근한다. 고객에게 노출할 데이터가 아니다.
alter table public.notifications enable row level security;
