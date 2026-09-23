-- BOSSA CRM — múltiplos canais de WhatsApp por papel
-- Permite um segundo número comercial de corretores sem substituir o Plantão.
-- O Canal 2 permanece misto; canais adicionais podem rotear direto ao pipeline.

begin;

alter table public.whatsapp_channels
  add column if not exists routing_mode text not null default 'direct_role';

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_routing_mode_check;

alter table public.whatsapp_channels
  add constraint whatsapp_channels_routing_mode_check
  check (routing_mode in ('direct_role', 'mixed_plantao'));

update public.whatsapp_channels
set routing_mode = case
  when role = 'corretor' and legacy_connection_id is not null then 'mixed_plantao'
  else 'direct_role'
end;

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_org_role_key;

create index if not exists whatsapp_channels_org_role_status_created_idx
  on public.whatsapp_channels (organization_id, role, status, created_at);

grant select (routing_mode)
  on public.whatsapp_channels
  to authenticated;

comment on column public.whatsapp_channels.routing_mode is
  'mixed_plantao faz triagem cliente/corretor; direct_role cria/usa diretamente o pipeline definido em role.';

commit;
