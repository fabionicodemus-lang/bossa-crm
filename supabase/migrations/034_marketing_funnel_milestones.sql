-- BOSSA CRM — performance de marketing e marcos históricos do funil

alter table public.meta_lead_ads_connections
  add column if not exists user_token_encrypted text,
  add column if not exists ad_account_id text;

-- Conta de anúncios da Bossa usada no Ads Manager.
update public.meta_lead_ads_connections
set ad_account_id = coalesce(ad_account_id, '6358611547493181'),
    updated_at = now()
where organization_id = 'efb563c0-42e2-403c-b86e-15b61a563757';

create table if not exists public.lead_funnel_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  qualified_at timestamptz,
  meeting_at timestamptz,
  proposal_at timestamptz,
  won_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_funnel_milestones enable row level security;

create index if not exists lead_funnel_milestones_org_idx
  on public.lead_funnel_milestones(organization_id);
create index if not exists lead_funnel_milestones_qualified_idx
  on public.lead_funnel_milestones(qualified_at);
create index if not exists lead_funnel_milestones_meeting_idx
  on public.lead_funnel_milestones(meeting_at);
create index if not exists lead_funnel_milestones_proposal_idx
  on public.lead_funnel_milestones(proposal_at);
create index if not exists lead_funnel_milestones_won_idx
  on public.lead_funnel_milestones(won_at);

create schema if not exists private;

create or replace function private.track_lead_funnel_milestones()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_at timestamptz := coalesce(new.updated_at, now());
  is_qualified boolean := new.stage in (
    'passagem_pendente',
    'humano_ativo',
    'agendado',
    'pos_reuniao',
    'proposta_negociacao',
    'fechado_ganho'
  );
  is_meeting boolean := new.stage in (
    'agendado',
    'pos_reuniao',
    'proposta_negociacao',
    'fechado_ganho'
  );
  is_proposal boolean := new.stage in (
    'proposta_negociacao',
    'fechado_ganho'
  );
  is_won boolean := new.stage = 'fechado_ganho';
begin
  if new.kind <> 'cliente' then
    return new;
  end if;

  insert into public.lead_funnel_milestones (
    organization_id,
    lead_id,
    qualified_at,
    meeting_at,
    proposal_at,
    won_at,
    created_at,
    updated_at
  ) values (
    new.organization_id,
    new.id,
    case when is_qualified then event_at end,
    case when is_meeting then event_at end,
    case when is_proposal then event_at end,
    case when is_won then event_at end,
    now(),
    now()
  )
  on conflict (lead_id) do update set
    organization_id = excluded.organization_id,
    qualified_at = coalesce(public.lead_funnel_milestones.qualified_at, excluded.qualified_at),
    meeting_at = coalesce(public.lead_funnel_milestones.meeting_at, excluded.meeting_at),
    proposal_at = coalesce(public.lead_funnel_milestones.proposal_at, excluded.proposal_at),
    won_at = coalesce(public.lead_funnel_milestones.won_at, excluded.won_at),
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.track_lead_funnel_milestones() from public, anon, authenticated;

drop trigger if exists track_lead_funnel_milestones on public.leads;
create trigger track_lead_funnel_milestones
after insert or update of stage
on public.leads
for each row
execute function private.track_lead_funnel_milestones();

-- Backfill do estado atual: preserva a informação de que o lead já chegou
-- pelo menos ao estágio em que se encontra hoje. A partir desta migration os
-- marcos passam a ser registrados na primeira vez que cada etapa é atingida.
insert into public.lead_funnel_milestones (
  organization_id,
  lead_id,
  qualified_at,
  meeting_at,
  proposal_at,
  won_at,
  created_at,
  updated_at
)
select
  organization_id,
  id,
  case when stage in ('passagem_pendente','humano_ativo','agendado','pos_reuniao','proposta_negociacao','fechado_ganho') then updated_at end,
  case when stage in ('agendado','pos_reuniao','proposta_negociacao','fechado_ganho') then updated_at end,
  case when stage in ('proposta_negociacao','fechado_ganho') then updated_at end,
  case when stage = 'fechado_ganho' then updated_at end,
  now(),
  now()
from public.leads
where kind = 'cliente'
on conflict (lead_id) do update set
  qualified_at = coalesce(public.lead_funnel_milestones.qualified_at, excluded.qualified_at),
  meeting_at = coalesce(public.lead_funnel_milestones.meeting_at, excluded.meeting_at),
  proposal_at = coalesce(public.lead_funnel_milestones.proposal_at, excluded.proposal_at),
  won_at = coalesce(public.lead_funnel_milestones.won_at, excluded.won_at),
  updated_at = now();
