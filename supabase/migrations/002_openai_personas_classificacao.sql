-- BOSSA CRM — OpenAI, personas Nara/Plantão e classificação automática
-- Execute depois de 001_bossa_crm.sql.

alter table public.leads
  add column if not exists ai_classification text,
  add column if not exists ai_summary text,
  add column if not exists ai_next_action text,
  add column if not exists ai_last_classified_at timestamptz;

-- A Nara atende somente clientes na etapa IA Atendendo.
-- O Plantão atende corretores em N1, N2 e N3; N4/N5 ficam com o comercial humano.
create or replace function public.enforce_lead_ai_rules()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'cliente' and new.stage = 'fechado' then
    new.ai_enabled := false;
  end if;

  if new.kind = 'cliente' and new.ai_enabled = true and new.stage <> 'ia' then
    new.ai_enabled := false;
  end if;

  if new.kind = 'corretor' and new.stage in ('n4', 'n5') then
    new.ai_enabled := false;
  end if;

  return new;
end;
$$;

-- Como o WhatsApp ainda será conectado agora, habilita o Plantão para a base existente
-- de corretores nos níveis iniciais. Ele só responderá quando o corretor enviar mensagem.
update public.leads
set ai_enabled = true
where kind = 'corretor'
  and stage in ('n1', 'n2', 'n3');

-- Garante a Nara ativa para registros que já estejam na etapa própria de atendimento.
update public.leads
set ai_enabled = true
where kind = 'cliente'
  and stage = 'ia';

create index if not exists leads_ai_classification_idx
  on public.leads (organization_id, kind, ai_classification, ai_last_classified_at desc);
