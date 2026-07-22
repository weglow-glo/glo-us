-- ============================================================
-- glo — 실구매 고객 리뷰 + 포인트
-- Supabase Dashboard → SQL Editor에서 실행 (0007 이후)
--
-- 정책 요약 (docs/review-policy.md):
--   · 배송완료 주문 보유 고객만, 주문×상품당 1회, 90일 이내 작성
--   · 텍스트: 검수 없이 즉시 게시 + 3,000P 즉시 지급
--   · 사진(≤5장)·영상(≤1개): 리뷰는 즉시 게시하되 미디어는 블러 "검수 중"
--     → 관리자 승인 시 블러 해제 + 추가 2,000P
--   · 본인 수정 48시간 이내(텍스트·별점만), 삭제는 관리자만
--   · 기존 시딩 후기는 status='approved', source='seeded'로 유지
-- ============================================================

-- 1) reviews 확장
alter table public.reviews add column if not exists user_id uuid;
alter table public.reviews add column if not exists order_id text;
alter table public.reviews add column if not exists product_code text not null default 'GL-01';
alter table public.reviews add column if not exists status text not null default 'approved'
  check (status in ('approved','hidden'));
alter table public.reviews add column if not exists source text not null default 'seeded'
  check (source in ('seeded','customer'));
alter table public.reviews add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.reviews add column if not exists videos jsonb not null default '[]'::jsonb;
-- 미디어 검수 상태: none(미디어 없음) / pending(블러 노출) / approved / rejected(미디어 숨김)
alter table public.reviews add column if not exists media_status text not null default 'none'
  check (media_status in ('none','pending','approved','rejected'));
alter table public.reviews add column if not exists edited_at timestamptz;

-- 주문 × 상품당 리뷰 1개 (SKU가 늘어도 주문 안 상품별로 각각 작성 가능)
create unique index if not exists reviews_order_product_uidx
  on public.reviews (order_id, product_code) where order_id is not null;
create index if not exists reviews_media_status_idx on public.reviews (media_status, created_at);
create index if not exists reviews_user_idx on public.reviews (user_id) where user_id is not null;

-- 공개 읽기는 게시 상태만 (숨김 처리된 리뷰 제외)
drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select using (status = 'approved');

-- 2) 포인트 장부 — 잔액은 delta 합. 적립(+)/사용(-)을 한 테이블에 기록한다.
create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  delta int not null,
  reason text not null,          -- 'review_text' | 'review_media' | 'order_use' | 'admin_adjust'
  ref_id text,                   -- review id / order id 등 근거
  created_at timestamptz not null default now()
);
create index if not exists points_user_idx on public.points (user_id, created_at desc);
-- 같은 리뷰·같은 사유로 중복 적립 방지
create unique index if not exists points_ref_reason_uidx
  on public.points (ref_id, reason) where ref_id is not null;

alter table public.points enable row level security;
drop policy if exists "points_select_own" on public.points;
create policy "points_select_own" on public.points
  for select using (auth.uid() = user_id);

-- 3) 리뷰 요청 알림 발송 기록 (배송완료 7일 후 1회)
alter table public.orders add column if not exists review_requested_at timestamptz;

-- 4) 리뷰 미디어 스토리지 버킷 (공개 읽기, 업로드는 서명 URL로만)
--    파일 한도 50MB, 이미지·영상 형식만 허용
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'review-media', 'review-media', true, 52428800,
    array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/webm','video/quicktime']
  )
  on conflict (id) do update
    set file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
