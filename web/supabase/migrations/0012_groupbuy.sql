-- ============================================================
-- 0012 — 공동구매·협찬 캠페인 (셀러 / 회차 / 주문 귀속)
--
-- 매출 귀속은 회차(round) 단위. 정산은 회차 종료 + 21일 시점에
-- paid 주문 스냅샷 × 수수료율로 확정한다. 교환은 매출 불변이라
-- 무관, 취소·환불은 paid 에서 빠지므로 자동 차감된다.
-- ============================================================

-- 셀러 (계좌 등 민감 정보 포함 — service_role 전용)
create table if not exists public.sellers (
  id         uuid primary key default gen_random_uuid(),
  -- 카카오 로그인 계정 연결 — 이 값이 있으면 /seller 포털 접근 가능
  user_id    uuid unique references auth.users (id) on delete set null,
  name       text not null,
  phone      text,
  email      text,
  bank_info  jsonb,          -- { bank, account, holder }
  active     boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists sellers_updated_at on public.sellers;
create trigger sellers_updated_at
  before update on public.sellers
  for each row execute function public.set_updated_at();

alter table public.sellers enable row level security;
revoke all on public.sellers from anon, authenticated;

-- 회차 — 공구/협찬 한 번의 진행 단위
create table if not exists public.groupbuy_rounds (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null references public.sellers (id) on delete cascade,
  type            text not null default 'groupbuy'
                    check (type in ('groupbuy','sponsored')),
  status          text not null default 'requested'
                    check (status in ('requested','approved','rejected','canceled','ended')),
  -- URL 핸들 (/product/@{handle}) — 승인 시 발급
  handle          text unique,
  -- 셀러 페이지에 노출할 이름 (셀러 실명 대신 활동명)
  display_name    text,
  starts_at       timestamptz,
  ends_at         timestamptz,
  -- 회차 전용 옵션(전용상품): [{ key, months, label, price }]
  options         jsonb not null default '[]'::jsonb,
  -- 매출 대비 수수료율 (%) — 운영자가 회차별 지정
  commission_rate numeric(5,2),
  -- 정산 기준일 = ends_at + 21일 (승인 시 세팅)
  settle_due_at   timestamptz,
  settled_at      timestamptz,
  settled_amount  integer,
  request_note    text,   -- 셀러 신청 메모
  admin_note      text,   -- 운영자 메모 / 반려 사유
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists groupbuy_rounds_seller_idx on public.groupbuy_rounds (seller_id);
create index if not exists groupbuy_rounds_status_idx on public.groupbuy_rounds (status);

drop trigger if exists groupbuy_rounds_updated_at on public.groupbuy_rounds;
create trigger groupbuy_rounds_updated_at
  before update on public.groupbuy_rounds
  for each row execute function public.set_updated_at();

alter table public.groupbuy_rounds enable row level security;

-- 셀러 페이지(/product/@handle)는 로그인 없이 열린다 — 승인된 회차의
-- 공개 필드만 익명 조회 허용. 수수료율·정산액·메모는 컬럼 권한으로 차단.
revoke all on public.groupbuy_rounds from anon, authenticated;
grant select (id, handle, display_name, type, status, starts_at, ends_at, options)
  on public.groupbuy_rounds to anon, authenticated;

drop policy if exists "rounds_select_approved" on public.groupbuy_rounds;
create policy "rounds_select_approved"
  on public.groupbuy_rounds for select
  using (status = 'approved');

-- 주문 귀속 꼬리표 (일반 주문은 둘 다 null)
alter table public.orders
  add column if not exists round_id uuid references public.groupbuy_rounds (id) on delete set null;
alter table public.orders
  add column if not exists seller_handle text;

create index if not exists orders_round_idx on public.orders (round_id, status);
