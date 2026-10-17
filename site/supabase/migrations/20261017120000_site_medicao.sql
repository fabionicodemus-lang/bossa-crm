-- Bossa Site 2.0 — medição do site ligada ao CRM.
-- Só ADICIONA objetos. Não altera nenhuma tabela, coluna ou política existente.
-- Tabelas novas: site_visitors, site_sessions, site_events, lead_site_links.
-- Funções: site_registrar_evento, site_registrar_lead, site_vincular_whatsapp.
-- Visões para o dashboard: site_funil_leads, site_comportamento_por_lead.

create table if not exists public.site_visitors (
  code text primary key check (code ~ '^[A-Z2-9]{4,8}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visits integer not null default 1,
  first_page text,
  first_referrer text,
  first_utm jsonb not null default '{}'::jsonb,
  country text,
  city text,
  device text
);

create table if not exists public.site_sessions (
  id uuid primary key,
  visitor_code text not null references public.site_visitors(code) on delete cascade,
  started_at timestamptz not null default now(),
  last_event_at timestamptz not null default now(),
  visit_number integer not null default 1,
  entry_page text,
  referrer text,
  utm jsonb not null default '{}'::jsonb,
  events integer not null default 0
);
create index if not exists site_sessions_visitor_idx on public.site_sessions(visitor_code);

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  visitor_code text not null references public.site_visitors(code) on delete cascade,
  session_id uuid references public.site_sessions(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  page text,
  created_at timestamptz not null default now()
);
create index if not exists site_events_visitor_idx on public.site_events(visitor_code, created_at);
create index if not exists site_events_name_idx on public.site_events(name, created_at);
create index if not exists site_events_session_idx on public.site_events(session_id);

create table if not exists public.lead_site_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  visitor_code text not null references public.site_visitors(code) on delete cascade,
  method text not null check (method in ('whatsapp', 'formulario', 'manual', 'provavel')),
  linked_at timestamptz not null default now(),
  unique (lead_id, visitor_code)
);
create index if not exists lead_site_links_lead_idx on public.lead_site_links(lead_id);
create index if not exists lead_site_links_visitor_idx on public.lead_site_links(visitor_code);

-- Nada disso é acessível pelo navegador: RLS ligado e nenhuma política pública.
alter table public.site_visitors enable row level security;
alter table public.site_sessions enable row level security;
alter table public.site_events enable row level security;
alter table public.lead_site_links enable row level security;

-- Leitura para a equipe do CRM, com a mesma regra usada na tabela leads.
create policy lead_site_links_select_member on public.lead_site_links for select to authenticated
  using (private.is_org_member(organization_id));

-- Registra um evento, criando ou atualizando visitante e sessão.
create or replace function public.site_registrar_evento(
  p_visitante text, p_sessao uuid, p_visita integer, p_evento text, p_detalhe jsonb,
  p_pagina text, p_referencia text, p_utm jsonb, p_tela text, p_idioma text,
  p_pais text, p_cidade text, p_dispositivo text
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into site_visitors(code, first_page, first_referrer, first_utm, country, city, device, visits)
  values (p_visitante, p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), p_pais, p_cidade, p_dispositivo, greatest(p_visita, 1))
  on conflict (code) do update set last_seen_at = now(), visits = greatest(site_visitors.visits, excluded.visits),
    country = coalesce(excluded.country, site_visitors.country), city = coalesce(excluded.city, site_visitors.city),
    device = coalesce(excluded.device, site_visitors.device);

  if p_sessao is not null then
    insert into site_sessions(id, visitor_code, visit_number, entry_page, referrer, utm, events)
    values (p_sessao, p_visitante, greatest(p_visita, 1), p_pagina, p_referencia, coalesce(p_utm, '{}'::jsonb), 1)
    on conflict (id) do update set last_event_at = now(), events = site_sessions.events + 1;
  end if;

  insert into site_events(visitor_code, session_id, name, props, page)
  values (p_visitante, p_sessao, p_evento,
          coalesce(p_detalhe, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('tela', p_tela, 'idioma', p_idioma)),
          p_pagina);
end $$;

-- Cria (ou reaproveita, pelo telefone) um lead vindo de formulário e liga ao código de visita.
create or replace function public.site_registrar_lead(
  p_organizacao uuid, p_nome text, p_telefone text, p_formulario text, p_empreendimento text,
  p_interesse text, p_creci text, p_visitante text, p_utm jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lead uuid;
  v_origem text := 'Site · ' || coalesce(p_empreendimento, 'Bossa') || ' · ' || p_formulario;
begin
  select id into v_lead from leads where organization_id = p_organizacao and phone = p_telefone and archived_at is null
  order by created_at desc limit 1;

  if v_lead is null then
    insert into leads(organization_id, kind, name, phone, stage, source, enterprise, creci, metadata)
    values (p_organizacao, (case when p_formulario = 'corretor' then 'corretor' else 'cliente' end)::lead_kind,
            p_nome, p_telefone, 'novo_triagem', v_origem, p_empreendimento, p_creci,
            jsonb_build_object('site', jsonb_build_object('formulario', p_formulario, 'interesse', p_interesse,
              'visitante', p_visitante, 'utm', coalesce(p_utm, '{}'::jsonb), 'em', now())))
    returning id into v_lead;
  else
    update leads set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('site_ultimo', jsonb_build_object('formulario', p_formulario,
      'empreendimento', p_empreendimento, 'interesse', p_interesse, 'visitante', p_visitante, 'em', now())),
      updated_at = now()
    where id = v_lead;
  end if;

  if p_visitante is not null and exists (select 1 from site_visitors where code = p_visitante) then
    insert into lead_site_links(organization_id, lead_id, visitor_code, method)
    values (p_organizacao, v_lead, p_visitante, 'formulario') on conflict do nothing;
  end if;
  return v_lead;
end $$;

-- Chamada pelo processamento de mensagens do WhatsApp (CRM/Nara) quando a primeira
-- mensagem traz "(ref. XXXXXX)". Retorna true se a ligação foi feita.
create or replace function public.site_vincular_whatsapp(p_organizacao uuid, p_lead uuid, p_mensagem text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_codigo text;
begin
  v_codigo := (regexp_match(p_mensagem, '\(ref\.\s*([A-Z2-9]{4,8})\)'))[1];
  if v_codigo is null or not exists (select 1 from site_visitors where code = v_codigo) then return false; end if;
  insert into lead_site_links(organization_id, lead_id, visitor_code, method)
  values (p_organizacao, p_lead, v_codigo, 'whatsapp') on conflict do nothing;
  update leads set source = coalesce(nullif(source, ''), 'Site · WhatsApp') where id = p_lead;
  return true;
end $$;

revoke all on function public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.site_registrar_lead(uuid, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.site_vincular_whatsapp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.site_registrar_evento(text, uuid, integer, text, jsonb, text, text, jsonb, text, text, text, text, text) to service_role;
grant execute on function public.site_registrar_lead(uuid, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.site_vincular_whatsapp(uuid, uuid, text) to service_role;

-- Dashboard: cada lead ligado ao site, com seus marcos no CRM.
create or replace view public.site_funil_leads with (security_invoker = true) as
select l.id as lead_id, l.organization_id, l.created_at as lead_criado_em, l.source, l.enterprise,
       min(k.linked_at) as ligado_em, (array_agg(k.method order by k.linked_at))[1] as metodo,
       m.qualified_at, m.meeting_at, m.proposal_at, m.won_at,
       array_agg(distinct k.visitor_code) as codigos
from public.leads l
join public.lead_site_links k on k.lead_id = l.id
left join public.lead_funnel_milestones m on m.lead_id = l.id
group by l.id, m.qualified_at, m.meeting_at, m.proposal_at, m.won_at;

-- Dashboard: o que cada lead fez no site ANTES de virar lead (base do "perfil do comprador").
create or replace view public.site_comportamento_por_lead with (security_invoker = true) as
select k.lead_id,
       count(*) filter (where e.name = 'view_floorplan') as plantas_vistas,
       count(*) filter (where e.name = 'switch_floorplan') as trocas_planta,
       count(*) filter (where e.name = 'gallery_interact') as interacoes_galeria,
       bool_or(e.name = 'view_construction') as viu_obra,
       bool_or(e.name = 'view_engineering') as viu_engenharia,
       bool_or(e.name = 'view_price') as viu_preco,
       bool_or(e.name = 'simulate_payment') as simulou,
       bool_or(e.name = 'download_material') as baixou_material,
       bool_or(e.name = 'view_history') as viu_historia,
       bool_or(e.name = 'view_location') as viu_localizacao,
       max(v.visits) as visitas,
       count(distinct e.session_id) as sessoes,
       min(e.created_at) as primeira_atividade
from public.lead_site_links k
join public.site_visitors v on v.code = k.visitor_code
join public.site_events e on e.visitor_code = k.visitor_code and e.created_at <= k.linked_at
group by k.lead_id;

revoke all on public.site_funil_leads, public.site_comportamento_por_lead from anon;
