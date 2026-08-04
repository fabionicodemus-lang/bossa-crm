-- BOSSA CRM — auditoria obrigatória de ofertas enviadas pela Nara
-- Execute depois de 016_nara_prompt_final.sql.

create table if not exists public.nara_offer_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  scope text not null check (scope in ('range', 'unit', 'unstructured')),
  source_call text not null,
  development_name text,
  unit_code text,
  offered_value numeric(14,2),
  entry_amount numeric(14,2),
  installment_amount numeric(14,2),
  range_min numeric(14,2),
  range_max numeric(14,2),
  range_entry_min numeric(14,2),
  quoted_amounts jsonb not null default '[]'::jsonb,
  reply_text text not null,
  source_calls jsonb not null default '[]'::jsonb,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  whatsapp_message_id text,
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists nara_offer_logs_lead_created_idx
  on public.nara_offer_logs (lead_id, created_at desc);
create index if not exists nara_offer_logs_org_created_idx
  on public.nara_offer_logs (organization_id, created_at desc);
create index if not exists nara_offer_logs_delivery_idx
  on public.nara_offer_logs (organization_id, delivery_status, created_at desc);
create index if not exists nara_offer_logs_unit_idx
  on public.nara_offer_logs (organization_id, development_name, unit_code, created_at desc)
  where unit_code is not null;

alter table public.nara_offer_logs enable row level security;

drop policy if exists nara_offer_logs_select_member on public.nara_offer_logs;
create policy nara_offer_logs_select_member
  on public.nara_offer_logs for select to authenticated
  using (private.is_org_member(organization_id));

grant select on public.nara_offer_logs to authenticated;
