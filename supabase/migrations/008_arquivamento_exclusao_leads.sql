-- BOSSA CRM — arquivamento de leads e exclusão permanente somente por administradores
-- Execute depois de 007_empreendimentos_estoque_propostas.sql.

begin;

alter table public.leads
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles(id) on delete set null,
  add column if not exists archived_reason text;

create index if not exists leads_org_archived_idx
  on public.leads (organization_id, archived_at desc)
  where archived_at is not null;

create index if not exists leads_org_active_kind_stage_idx
  on public.leads (organization_id, kind, stage, updated_at desc)
  where archived_at is null;

-- A política anterior permitia exclusão também ao perfil comercial.
drop policy if exists leads_delete_editor on public.leads;
drop policy if exists leads_delete_admin on public.leads;
create policy leads_delete_admin
  on public.leads
  for delete
  to authenticated
  using (private.is_org_admin(organization_id));

grant select, insert, update, delete on public.leads to authenticated;

commit;
