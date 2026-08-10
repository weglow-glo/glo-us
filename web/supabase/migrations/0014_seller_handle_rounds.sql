-- ============================================================
-- 0014 — 셀러 영구 핸들 + 자동 차수
--
-- URL 은 셀러당 하나로 고정된다: /product/@{sellers.handle}
-- 같은 링크가 "지금 진행 중인 회차"에 자동 연결되고, 회차에는
-- 셀러별 차수(round_no: 1차, 2차…)가 승인 시 자동 부여된다.
-- 차수는 어드민·셀러 포털에만 표시(고객 화면 미노출).
-- ============================================================

alter table public.sellers add column if not exists handle text unique;
alter table public.groupbuy_rounds add column if not exists round_no integer;

-- 공개 리졸브 (/product/@handle): 활성 셀러의 식별 필드만 익명 조회 허용
-- (이름·연락처·계좌는 계속 차단 — 컬럼 권한)
grant select (id, handle, active) on public.sellers to anon, authenticated;

drop policy if exists "sellers_select_public" on public.sellers;
create policy "sellers_select_public"
  on public.sellers for select
  using (active);

-- 회차 공개 필드에 seller_id, round_no 추가 (승인된 회차만 — 기존 정책 그대로)
grant select (seller_id, round_no) on public.groupbuy_rounds to anon, authenticated;

-- 백필 1: 기존 회차 handle → 셀러 handle (셀러당 가장 최근 것)
update public.sellers s
set handle = sub.handle
from (
  select distinct on (seller_id) seller_id, handle
  from public.groupbuy_rounds
  where handle is not null
  order by seller_id, created_at desc
) sub
where sub.seller_id = s.id and s.handle is null;

-- 백필 2: 기존 승인·종료 회차에 차수 부여 (시작일 순)
with numbered as (
  select id,
         row_number() over (
           partition by seller_id
           order by coalesce(starts_at, created_at)
         ) as rn
  from public.groupbuy_rounds
  where status in ('approved', 'ended')
)
update public.groupbuy_rounds r
set round_no = n.rn
from numbered n
where n.id = r.id and r.round_no is null;
