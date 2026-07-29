-- BOSSA CRM — criação e acompanhamento de modelos da Meta
-- Execute depois de 009_transmissoes_whatsapp.sql.

begin;

alter table public.whatsapp_templates
  add column if not exists rejected_reason text,
  add column if not exists source text not null default 'META',
  add column if not exists submitted_at timestamptz;

comment on column public.whatsapp_templates.rejected_reason is
  'Motivo de rejeição informado pela Meta, quando disponível.';
comment on column public.whatsapp_templates.source is
  'Origem do registro: META para sincronizados e CRM para criados no Bossa CRM.';
comment on column public.whatsapp_templates.submitted_at is
  'Data em que o modelo foi enviado para análise da Meta pelo CRM.';

commit;
