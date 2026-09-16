-- Memória isolada por contato para não perder fatos ao compactar o histórico.
create table if not exists public.whatsapp_ai_conversation_memory (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  facts jsonb not null default '{}'::jsonb,
  last_summary text not null default '',
  last_source_message_id uuid,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_ai_conversation_memory enable row level security;
revoke all on public.whatsapp_ai_conversation_memory from anon, authenticated;
create index if not exists whatsapp_ai_memory_org_idx
  on public.whatsapp_ai_conversation_memory(organization_id);
