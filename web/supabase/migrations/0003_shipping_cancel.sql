-- ============================================================
-- glo — shipping lifecycle (배송중 / 배송완료) + cancellation
-- Run in Supabase Dashboard → SQL Editor (after 0002).
-- ============================================================

-- New timestamps for the fulfillment / cancel lifecycle.
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists canceled_at  timestamptz;
alter table public.orders add column if not exists raw_cancel   jsonb;

-- Status model (re-defined):
--   pending    결제대기
--   paid       결제완료      ← cancellable until here
--   preparing  배송준비중    ← admin sets, no tracking yet
--   shipped    배송중        ← admin enters tracking (dispatched / in transit)
--   delivered  배송완료      ← admin confirms delivery
--   failed / canceled / refunded
--
-- NOTE: 'shipped' previously meant 배송완료; it now means 배송중. Any existing
-- 'shipped' rows will display as 배송중 — re-mark them 배송완료 if needed.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in (
    'pending','paid','preparing','shipped','delivered','failed','canceled','refunded'
  ));
