-- ============================================================
-- glo — 포인트 사용·만료·회수 (docs/points-policy.md)
-- Supabase Dashboard → SQL Editor에서 실행 (0008 이후)
--
--   · 유효기간: 지급일로부터 6개월, 먼저 만료되는 적립분부터 사용(FIFO)
--   · 사용: 제한 없음, 결제 승인 시점에 원자적으로 차감
--   · 환불: 사용 포인트 복원(+6개월), 해당 주문 리뷰 적립분은 잔액 내 회수
-- ============================================================

-- 1) 적립 로트 관리 컬럼
--    delta > 0 인 행이 '적립 로트' — remaining이 남은 양, expires_at이 만료일.
--    delta < 0 인 행은 사용/회수 이력 (remaining = 0).
alter table public.points add column if not exists remaining int not null default 0;
alter table public.points add column if not exists expires_at timestamptz;
alter table public.points add column if not exists expiry_notified_at timestamptz;

-- 기존 적립 행 백필 (있다면)
update public.points
  set remaining = delta,
      expires_at = created_at + interval '6 months'
  where delta > 0 and remaining = 0 and expires_at is null;

create index if not exists points_lots_idx
  on public.points (user_id, expires_at)
  where delta > 0 and remaining > 0;

-- 2) 주문에 사용 포인트 기록
alter table public.orders add column if not exists used_points int not null default 0;

-- 3) 원자적 차감 (FIFO — 먼저 만료되는 로트부터). 잔액 부족 시 예외 → 전체 롤백.
--    서비스 롤(서버)에서만 호출한다.
create or replace function public.use_points(
  p_user uuid,
  p_amount int,
  p_ref text,
  p_reason text default 'order_use'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lot record;
  need int := p_amount;
  take int;
begin
  if p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  for lot in
    select id, remaining from public.points
    where user_id = p_user and delta > 0 and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, created_at asc
    for update
  loop
    exit when need <= 0;
    take := least(lot.remaining, need);
    update public.points set remaining = remaining - take where id = lot.id;
    need := need - take;
  end loop;

  if need > 0 then
    raise exception 'insufficient_points';
  end if;

  insert into public.points (user_id, delta, reason, ref_id, remaining)
    values (p_user, -p_amount, p_reason, p_ref, 0);
end $$;

revoke all on function public.use_points(uuid, int, text, text) from public, anon, authenticated;
