-- ============================================================
-- glo — public "도움됐나요?" helpful votes for reviews.
-- Atomic, abuse-bounded (±1) via a SECURITY DEFINER function so the public
-- (anon) can adjust counts without an RLS update policy on the table.
-- Run in Supabase Dashboard → SQL Editor (after 0005_reviews.sql).
-- ============================================================

create or replace function public.vote_review_helpful(rid uuid, dir text, add boolean)
returns table(helpful_up int, helpful_down int)
language plpgsql
security definer
set search_path = public
as $$
declare d int := case when add then 1 else -1 end;
begin
  if dir = 'up' then
    update public.reviews set helpful_up = greatest(0, helpful_up + d) where id = rid;
  elsif dir = 'down' then
    update public.reviews set helpful_down = greatest(0, helpful_down + d) where id = rid;
  else
    raise exception 'invalid dir: %', dir;
  end if;
  return query
    select r.helpful_up, r.helpful_down from public.reviews r where r.id = rid;
end;
$$;

revoke all on function public.vote_review_helpful(uuid, text, boolean) from public;
grant execute on function public.vote_review_helpful(uuid, text, boolean) to anon, authenticated;
