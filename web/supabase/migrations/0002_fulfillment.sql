-- ============================================================
-- glo — fulfillment fields (shipping / tracking)
-- Run in Supabase Dashboard → SQL Editor (after 0001).
-- ============================================================

alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists shipped_at timestamptz;

-- Allow the 'preparing' and 'shipped' states.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'pending', 'paid', 'preparing', 'shipped', 'failed', 'canceled', 'refunded'
  ));

-- shipping_address jsonb already exists (0001); shape used by the app:
--   { recipient, phone, postcode, address, detail, memo }
