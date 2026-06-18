-- ============================================================
-- glo — saved shipping addresses (address book)
-- Run in Supabase Dashboard → SQL Editor (after 0003).
-- ============================================================

create table if not exists public.shipping_addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  recipient   text not null,
  phone       text not null,
  postcode    text,
  address     text,
  detail      text,
  memo        text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shipping_addresses_user_idx
  on public.shipping_addresses (user_id);

-- At most one default address per user.
create unique index if not exists shipping_addresses_one_default
  on public.shipping_addresses (user_id) where is_default;

drop trigger if exists shipping_addresses_updated_at on public.shipping_addresses;
create trigger shipping_addresses_updated_at
  before update on public.shipping_addresses
  for each row execute function public.set_updated_at();

alter table public.shipping_addresses enable row level security;

-- Owners can read/write their own addresses (the storefront uses the
-- cookie-based user client; the confirm route uses service_role and bypasses RLS).
drop policy if exists "sa_select_own" on public.shipping_addresses;
create policy "sa_select_own" on public.shipping_addresses
  for select using (auth.uid() = user_id);

drop policy if exists "sa_insert_own" on public.shipping_addresses;
create policy "sa_insert_own" on public.shipping_addresses
  for insert with check (auth.uid() = user_id);

drop policy if exists "sa_update_own" on public.shipping_addresses;
create policy "sa_update_own" on public.shipping_addresses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "sa_delete_own" on public.shipping_addresses;
create policy "sa_delete_own" on public.shipping_addresses
  for delete using (auth.uid() = user_id);
