-- ============================================================
-- glo — 이벗WMS 발주 자동화
-- Supabase Dashboard → SQL Editor에서 실행 (0010 이후)
--
-- wms_draft_id  : 오픈DB 임시주문 ID (POST /orders/draft 응답)
-- wms_pushed_at : WMS 발주 전송 시각 — null 이면 아직 미전송.
--                 push 는 paid + (preparing & 미전송) 만 집어가고,
--                 pull 은 전송된 preparing 건만 송장 조회한다.
-- ============================================================

alter table public.orders add column if not exists wms_draft_id text;
alter table public.orders add column if not exists wms_pushed_at timestamptz;

create index if not exists orders_wms_pull_idx
  on public.orders (status, wms_pushed_at)
  where tracking_number is null;
