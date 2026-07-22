-- ============================================================
-- glo — 운영 설정 저장소 (포인트 지급액 등 동적 조정용)
-- Supabase Dashboard → SQL Editor에서 실행 (0009 이후)
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- 서비스 롤(서버)만 접근. 클라이언트 노출 없음.
alter table public.app_settings enable row level security;

-- 리뷰 포인트 지급 정책 초기값 (관리자 → 포인트관리에서 조정)
insert into public.app_settings (key, value)
  values ('point_policy', '{"review_text": 3000, "review_media": 2000}'::jsonb)
  on conflict (key) do nothing;
