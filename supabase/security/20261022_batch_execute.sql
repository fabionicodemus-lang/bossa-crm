-- Independent permission correction; this does NOT approve or schedule a batch merge.
-- This routine may exist only in an existing baseline. Missing signature fails closed.
-- Preserve its body/defaults/result pending separate review of legacy batch semantics.
begin;
revoke execute on function public.merge_duplicate_leads_batch(integer) from public,anon,authenticated;
grant execute on function public.merge_duplicate_leads_batch(integer) to service_role;
alter function public.merge_duplicate_leads_batch(integer) set search_path=pg_catalog,public,pg_temp;
commit;
