-- Sincronização do histórico/contatos do WhatsApp Business em modo Coexistência.
-- Mantemos o progresso no próprio canal e uma pequena agenda de contatos
-- sincronizados para nomear corretamente as conversas importadas.

alter table public.whatsapp_channels
  add column if not exists history_sync_requested_at timestamptz,
  add column if not exists history_sync_request_id text,
  add column if not exists history_sync_completed_at timestamptz,
  add column if not exists history_sync_progress integer not null default 0,
  add column if not exists history_sync_phase integer,
  add column if not exists history_sync_error text,
  add column if not exists contacts_sync_requested_at timestamptz,
  add column if not exists contacts_sync_request_id text,
  add column if not exists contacts_sync_completed_at timestamptz,
  add column if not exists contacts_sync_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_channels_history_sync_progress_check'
      AND conrelid = 'public.whatsapp_channels'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_channels
      ADD CONSTRAINT whatsapp_channels_history_sync_progress_check
      CHECK (history_sync_progress between 0 and 100);
  END IF;
END $$;

create table if not exists public.whatsapp_synced_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  wa_id text not null,
  full_name text,
  first_name text,
  action text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, wa_id)
);

create index if not exists whatsapp_synced_contacts_org_channel_idx
  on public.whatsapp_synced_contacts (organization_id, channel_id, updated_at desc);

alter table public.whatsapp_synced_contacts enable row level security;
