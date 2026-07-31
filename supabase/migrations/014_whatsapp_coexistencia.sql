-- BOSSA CRM — WhatsApp Business App + Cloud API em Coexistência
-- Execute DEPOIS de 012_whatsapp_desenvolvedor_direto.sql.
--
-- Não destrutiva e segura para reexecução.

begin;

alter table public.whatsapp_channels
  add column if not exists connection_mode text not null default 'api_only';

alter table public.whatsapp_channels
  drop constraint if exists whatsapp_channels_connection_mode_check;

alter table public.whatsapp_channels
  add constraint whatsapp_channels_connection_mode_check
  check (connection_mode in ('coexistence', 'api_only'));

comment on column public.whatsapp_channels.connection_mode is
  'coexistence mantém o número no WhatsApp Business e na Cloud API; api_only usa somente a API.';

-- A migration 012 concedeu SELECT por coluna para proteger token e hash do PIN.
-- Acrescenta somente a nova coluna segura à permissão dos usuários autenticados.
grant select (connection_mode)
  on public.whatsapp_channels
  to authenticated;

commit;