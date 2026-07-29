-- BOSSA CRM — Sistema híbrido Nara/Plantão + equipe humana
-- Execute depois de 004_consumo_ia_gpt56.sql.
-- Cria estados operacionais, aceite de passagem, tarefas, prazos e resgate.

begin;

-- 1) Novos campos operacionais no lead.
alter table public.leads
  add column if not exists owner_mode text not null default 'ai',
  add column if not exists backup_owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists priority_class text,
  add column if not exists next_action text,
  add column if not exists next_action_type text,
  add column if not exists next_action_due_at timestamptz,
  add column if not exists reactivation_at timestamptz,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_accepted_at timestamptz,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists last_human_activity_at timestamptz,
  add column if not exists last_ai_activity_at timestamptz,
  add column if not exists loss_reason text,
  add column if not exists opt_out boolean not null default false,
  add column if not exists automation_paused boolean not null default false;

alter table public.leads drop constraint if exists leads_owner_mode_check;
alter table public.leads add constraint leads_owner_mode_check
  check (owner_mode in ('ai', 'human', 'none'));

alter table public.leads drop constraint if exists leads_priority_class_check;
alter table public.leads add constraint leads_priority_class_check
  check (priority_class is null or priority_class in ('A1', 'A2', 'B', 'C', 'D'));

-- 2) Migra as etapas antigas para os estados do sistema híbrido.
alter table public.leads drop constraint if exists lead_stage_by_kind;

update public.leads
set stage = case
  when kind = 'cliente' and stage = 'novo' then 'novo_triagem'
  when kind = 'cliente' and stage = 'ia' then 'qualificacao_ia'
  when kind = 'cliente' and stage = 'qualificado' then 'passagem_pendente'
  when kind = 'cliente' and stage = 'agendado' then 'agendado'
  when kind = 'cliente' and stage = 'negociacao' then 'proposta_negociacao'
  when kind = 'cliente' and stage = 'fechado' then 'fechado_ganho'
  when kind = 'corretor' and stage = 'n1' then 'novo_triagem'
  when kind = 'corretor' and stage = 'n2' then 'qualificacao_ia'
  when kind = 'corretor' and stage = 'n3' then 'nutricao_ativa'
  when kind = 'corretor' and stage = 'n4' then 'proposta_negociacao'
  when kind = 'corretor' and stage = 'n5' then 'nutricao_ativa'
  else stage
end;

-- Um estágio humano sem responsável volta para passagem pendente.
update public.leads
set stage = 'passagem_pendente'
where stage in ('humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao')
  and owner_id is null;

update public.leads
set owner_mode = case
  when stage in ('fechado_ganho', 'encerrado') then 'none'
  when owner_id is not null and stage in ('humano_ativo', 'agendado', 'pos_reuniao', 'proposta_negociacao') then 'human'
  else 'ai'
end;

alter table public.leads add constraint lead_stage_by_kind check (
  (kind = 'cliente' and stage in (
    'novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente',
    'humano_ativo','agendado','pos_reuniao','proposta_negociacao',
    'futuro','fechado_ganho','encerrado'
  ))
  or
  (kind = 'corretor' and stage in (
    'novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente',
    'humano_ativo','agendado','pos_reuniao','proposta_negociacao',
    'futuro','encerrado'
  ))
);

create index if not exists leads_org_stage_due_idx
  on public.leads (organization_id, stage, next_action_due_at)
  where next_action_due_at is not null;
create index if not exists leads_owner_due_idx
  on public.leads (owner_id, next_action_due_at)
  where owner_id is not null and next_action_due_at is not null;
create index if not exists leads_reactivation_idx
  on public.leads (organization_id, reactivation_at)
  where reactivation_at is not null and stage = 'futuro';
create index if not exists leads_priority_idx
  on public.leads (organization_id, priority_class, updated_at desc);

-- 3) Tarefas por lead.
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_mode text not null default 'human' check (assigned_mode in ('ai','human','manager')),
  type text not null default 'followup',
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  status text not null default 'pending' check (status in ('pending','completed','cancelled','overdue')),
  due_at timestamptz,
  completed_at timestamptz,
  created_by_kind text not null default 'system' check (created_by_kind in ('ai','human','system')),
  created_by uuid references public.profiles(id) on delete set null,
  dedupe_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_tasks_org_status_due_idx
  on public.lead_tasks (organization_id, status, due_at);
create index if not exists lead_tasks_lead_created_idx
  on public.lead_tasks (lead_id, created_at desc);
create index if not exists lead_tasks_assigned_status_idx
  on public.lead_tasks (assigned_to, status, due_at)
  where assigned_to is not null;
create unique index if not exists lead_tasks_pending_dedupe_uidx
  on public.lead_tasks (lead_id, dedupe_key)
  where status = 'pending' and dedupe_key is not null;

-- 4) Aceite formal da passagem.
create table if not exists public.lead_handoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  requested_by text not null default 'ai' check (requested_by in ('ai','human','system')),
  offered_to uuid references public.profiles(id) on delete set null,
  backup_to uuid references public.profiles(id) on delete set null,
  accepted_by uuid references public.profiles(id) on delete set null,
  priority_class text check (priority_class is null or priority_class in ('A1','A2','B','C','D')),
  reason text,
  briefing jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','accepted','expired','cancelled')),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_handoffs_one_pending_uidx
  on public.lead_handoffs (lead_id)
  where status = 'pending';
create index if not exists lead_handoffs_org_status_expiry_idx
  on public.lead_handoffs (organization_id, status, expires_at);

-- 5) RLS.
alter table public.lead_tasks enable row level security;
alter table public.lead_handoffs enable row level security;

drop policy if exists lead_tasks_select_member on public.lead_tasks;
create policy lead_tasks_select_member on public.lead_tasks
  for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists lead_tasks_insert_editor on public.lead_tasks;
create policy lead_tasks_insert_editor on public.lead_tasks
  for insert to authenticated with check (private.can_edit_org(organization_id));
drop policy if exists lead_tasks_update_editor on public.lead_tasks;
create policy lead_tasks_update_editor on public.lead_tasks
  for update to authenticated using (private.can_edit_org(organization_id))
  with check (private.can_edit_org(organization_id));
drop policy if exists lead_tasks_delete_editor on public.lead_tasks;
create policy lead_tasks_delete_editor on public.lead_tasks
  for delete to authenticated using (private.can_edit_org(organization_id));

drop policy if exists lead_handoffs_select_member on public.lead_handoffs;
create policy lead_handoffs_select_member on public.lead_handoffs
  for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists lead_handoffs_insert_editor on public.lead_handoffs;
create policy lead_handoffs_insert_editor on public.lead_handoffs
  for insert to authenticated with check (private.can_edit_org(organization_id));
drop policy if exists lead_handoffs_update_editor on public.lead_handoffs;
create policy lead_handoffs_update_editor on public.lead_handoffs
  for update to authenticated using (private.can_edit_org(organization_id))
  with check (private.can_edit_org(organization_id));
drop policy if exists lead_handoffs_delete_admin on public.lead_handoffs;
create policy lead_handoffs_delete_admin on public.lead_handoffs
  for delete to authenticated using (private.is_org_admin(organization_id));

grant select, insert, update, delete on public.lead_tasks to authenticated;
grant select, insert, update, delete on public.lead_handoffs to authenticated;

-- 6) Atualização automática de updated_at.
drop trigger if exists lead_tasks_set_updated_at on public.lead_tasks;
create trigger lead_tasks_set_updated_at before update on public.lead_tasks
for each row execute procedure public.set_updated_at();

drop trigger if exists lead_handoffs_set_updated_at on public.lead_handoffs;
create trigger lead_handoffs_set_updated_at before update on public.lead_handoffs
for each row execute procedure public.set_updated_at();

-- 7) Regra de proteção IA x humano.
create or replace function public.enforce_lead_ai_rules()
returns trigger language plpgsql as $$
begin
  if new.opt_out = true or new.automation_paused = true then
    new.ai_enabled := false;
  end if;

  if new.owner_mode = 'human'
     or new.stage in ('humano_ativo','agendado','pos_reuniao','proposta_negociacao','fechado_ganho','encerrado') then
    new.ai_enabled := false;
  end if;

  if new.stage in ('fechado_ganho','encerrado') then
    new.owner_mode := 'none';
    new.next_action_due_at := null;
  end if;

  if new.owner_mode = 'ai' and new.stage in ('novo_triagem','qualificacao_ia','nutricao_ativa','passagem_pendente','futuro')
     and new.opt_out = false and new.automation_paused = false then
    -- Preserva pausa manual quando ai_enabled já foi definido como false.
    new.ai_enabled := coalesce(new.ai_enabled, true);
  end if;

  return new;
end; $$;

drop trigger if exists leads_enforce_ai on public.leads;
create trigger leads_enforce_ai before insert or update on public.leads
for each row execute procedure public.enforce_lead_ai_rules();

-- 8) Realtime das tarefas e passagens.
do $$ begin
  alter publication supabase_realtime add table public.lead_tasks;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.lead_handoffs;
exception when duplicate_object then null; end $$;

-- 9) Acrescenta ao treinamento salvo a oferta da unidade pronta no Soul e a regra híbrida,
-- sem sobrescrever os textos já personalizados pelo gestor.
update public.ai_agent_configs
set knowledge = knowledge
  || case when knowledge ? 'soul_unidade_pronta' then '{}'::jsonb else jsonb_build_object(
    'soul_unidade_pronta',
    'SOUL RESIDENCE — existe uma única unidade em empreendimento já entregue em Itapema, a aproximadamente 550 m do mar, com 2 suítes, pronta para morar ou alugar. O prédio possui rooftop, piscina, salão de festas e pub. Considere como alternativa quando o lead busca imóvel pronto, mudança rápida, renda de locação sem esperar obra, 2 suítes em Itapema ou demonstra receio de comprar na planta. Nunca confirme preço, disponibilidade definitiva, rentabilidade ou condição sem consultar os dados atualizados. Pedido de visita, proposta, reserva ou condição exige passagem imediata ao humano.'
  ) end
  || case when knowledge ? 'operacao_hibrida' then '{}'::jsonb else jsonb_build_object(
    'operacao_hibrida',
    'A IA é dona durante triagem, qualificação, nutrição e passagem pendente. Depois que um consultor aceita, a IA fica em silêncio para o cliente, mas continua analisando a conversa, atualizando classificação, resumo, próxima ação, notas e tarefas. Nunca IA e humano devem responder ao mesmo tempo. Pedido de humano, visita, proposta, negociação, unidade específica ou corretor com cliente ativo gera passagem imediata.'
  ) end,
    updated_at = now()
where agent in ('nara','plantao');

commit;
