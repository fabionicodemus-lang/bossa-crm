-- Pós-venda para Cíntia no Canal 2; fatos comerciais confirmados pelo gestor.
alter table public.client_handoff_settings
  add column if not exists post_sale_alert_phone text;

alter table public.client_handoff_alert_jobs
  add column if not exists recipient_kind text not null default 'commercial';

update public.client_handoff_settings
set post_sale_alert_phone = '554792381206', updated_at = now()
where organization_id = 'efb563c0-42e2-403c-b86e-15b61a563757';

update public.ai_agent_configs
set knowledge = jsonb_set(
  coalesce(knowledge, '{}'::jsonb),
  '{condicoes_comerciais_confirmadas}',
  to_jsonb($facts$Condições confirmadas pela Bossa: podemos avaliar permutas de imóveis, carros e serviços por apartamentos; a aceitação e os valores dependem de avaliação, sem promessa de aprovação. O financiamento é próprio, direto com a construtora, reajustado pelo CUB. A quantidade de parcelas depende do empreendimento e da entrega da unidade: no Alma pode chegar a 100 vezes e no Flow a 60 vezes. Não informe limite de parcelas do Soul sem confirmação. Distância aproximada do mar: Soul 500 m, Flow 800 m e Alma 350 m. Valores, disponibilidade e condições exatas da unidade vêm da tabela vigente; confirme proposta específica com a equipe.$facts$::text),
  true
), updated_at = now()
where organization_id = 'efb563c0-42e2-403c-b86e-15b61a563757'
  and agent = 'nara';
