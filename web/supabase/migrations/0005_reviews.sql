-- ============================================================
-- glo — product reviews (체험단 후기). Public read; writes via service role.
-- Run in Supabase Dashboard → SQL Editor (after 0004), then seed:
--   node web/scripts/seed-reviews.mjs
-- ============================================================

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  author_name   text not null,
  location      text,
  rating        int not null check (rating between 1 and 5),
  body          text not null,
  helpful_up    int not null default 0,
  helpful_down  int not null default 0,
  review_date   date not null,
  created_at    timestamptz not null default now()
);

create index if not exists reviews_rating_idx  on public.reviews (rating desc);
create index if not exists reviews_date_idx    on public.reviews (review_date desc);
create index if not exists reviews_helpful_idx on public.reviews (helpful_up desc);

alter table public.reviews enable row level security;

-- Anyone can read reviews (public marketing content). No insert/update/delete
-- policy → writes only through the service-role seed/admin path.
drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews
  for select using (true);
