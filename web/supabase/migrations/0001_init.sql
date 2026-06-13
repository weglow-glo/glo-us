-- ============================================================
-- glo — initial schema (profiles, orders)
-- Run in Supabase Dashboard → SQL Editor, or via supabase CLI.
-- ============================================================

-- ----- updated_at helper -----------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles — one row per auth user (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- ============================================================
-- orders
-- ============================================================
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- merchant order id sent to Toss (unique, URL-safe)
  order_id          text not null unique,
  -- nullable: supports guest checkout
  user_id           uuid references auth.users (id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending','paid','failed','canceled','refunded')),
  product_code      text not null default 'GL-01',
  quantity          integer not null default 1 check (quantity > 0),
  amount            integer not null check (amount >= 0),   -- KRW, no decimals
  order_name        text not null,                          -- e.g. "glo GL-01 1개"
  -- customer / shipping
  customer_name     text,
  customer_email    text,
  customer_phone    text,
  shipping_address  jsonb,
  -- payment (filled on confirm)
  payment_key       text,
  payment_method    text,
  approved_at       timestamptz,
  raw_payment       jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_status_idx  on public.orders (status);

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

alter table public.orders enable row level security;

-- Logged-in users can read their own orders.
-- All writes (create pending order, mark paid) go through the server
-- using the service_role key, which bypasses RLS — so no insert/update
-- policy is granted to anon/authenticated by design.
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);
