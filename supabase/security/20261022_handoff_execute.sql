-- Independent security candidate. Not authorized for production execution.
-- Preserve the existing implementation, argument defaults and return type.
-- The ordinary server caller uses service_role without a human session.
begin;
revoke execute on function public.next_client_handoff_owner(uuid,uuid) from public,anon,authenticated;
grant execute on function public.next_client_handoff_owner(uuid,uuid) to service_role;
alter function public.next_client_handoff_owner(uuid,uuid) set search_path=pg_catalog,public,pg_temp;
commit;
