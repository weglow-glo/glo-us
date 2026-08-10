-- ============================================================
-- 0013 — 셀러 지원(심사) 신청
--
-- 카카오 로그인한 회원이 /seller 에서 직접 셀러 지원서를 낸다.
-- 운영자가 /admin/sellers 에서 승인하면 sellers 행이 생성·연결되고,
-- 결과는 문자로 안내된다. 반려 후 재지원 가능 (pending 은 1건만).
-- ============================================================

create table if not exists public.seller_applications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending'
               check (status in ('pending','approved','rejected')),
  name       text not null,          -- 활동명/이름
  phone      text not null,          -- 결과 안내 연락처
  channel    text,                   -- 인스타/유튜브 등 채널 링크
  follower   text,                   -- 팔로워/구독자 규모 (자유 기입)
  note       text,                   -- 소개·판매 계획
  admin_note text,                   -- 반려 사유
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 계정의 심사 대기 건은 동시에 1건만
create unique index if not exists seller_applications_pending_uidx
  on public.seller_applications (user_id)
  where status = 'pending';

create index if not exists seller_applications_status_idx
  on public.seller_applications (status);

drop trigger if exists seller_applications_updated_at on public.seller_applications;
create trigger seller_applications_updated_at
  before update on public.seller_applications
  for each row execute function public.set_updated_at();

alter table public.seller_applications enable row level security;
revoke all on public.seller_applications from anon, authenticated;
