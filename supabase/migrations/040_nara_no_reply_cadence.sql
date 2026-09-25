create table if not exists public.nara_followup_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  anchor_message_id uuid not null unique references public.messages(id) on delete cascade,
  first_outbound_at timestamptz not null,
  anchor_inbound_at timestamptz,
  language text not null default 'pt_BR',
  timezone text not null default 'America/Sao_Paulo',
  first_status text not null default 'pending',
  second_status text not null default 'pending',
  status text not null default 'active',
  first_sent_at timestamptz,
  second_sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nara_followup_first_status_check check (first_status in ('pending','sending','sent','skipped','failed')),
  constraint nara_followup_second_status_check check (second_status in ('pending','sending','sent','skipped','failed')),
  constraint nara_followup_status_check check (status in ('active','cancelled','escalated'))
);

create index if not exists nara_followup_sequences_active_idx on public.nara_followup_sequences(status, first_outbound_at);
create index if not exists nara_followup_sequences_lead_idx on public.nara_followup_sequences(lead_id, created_at desc);
alter table public.nara_followup_sequences enable row level security;
revoke all on public.nara_followup_sequences from anon, authenticated;
grant all on public.nara_followup_sequences to service_role;

create or replace function public.claim_nara_followup_step(p_id uuid, p_step text)
returns boolean language plpgsql security invoker as $$
begin
  if p_step = 'first' then
    update public.nara_followup_sequences set first_status = 'sending', updated_at = now()
      where id = p_id and status = 'active' and first_status = 'pending';
  elsif p_step = 'second' then
    update public.nara_followup_sequences set second_status = 'sending', updated_at = now()
      where id = p_id and status = 'active' and second_status = 'pending';
  else
    return false;
  end if;
  return found;
end;
$$;
revoke all on function public.claim_nara_followup_step(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_nara_followup_step(uuid, text) to service_role;

create table if not exists public.nara_deferred_replies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel_id uuid not null references public.whatsapp_channels(id),
  conversation_id uuid not null references public.whatsapp_conversations(id),
  source_message_id uuid not null unique references public.messages(id) on delete cascade,
  timezone text not null,
  status text not null default 'pending' check (status in ('pending','processing','sent','cancelled','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nara_deferred_replies_pending_idx on public.nara_deferred_replies(status, created_at);
alter table public.nara_deferred_replies enable row level security;
revoke all on public.nara_deferred_replies from anon, authenticated;
grant all on public.nara_deferred_replies to service_role;

create or replace function public.claim_nara_deferred_reply(p_id uuid)
returns boolean language plpgsql security invoker as $$
begin
  update public.nara_deferred_replies set status = 'processing', updated_at = now()
    where id = p_id and status = 'pending';
  return found;
end;
$$;
revoke all on function public.claim_nara_deferred_reply(uuid) from public, anon, authenticated;
grant execute on function public.claim_nara_deferred_reply(uuid) to service_role;
