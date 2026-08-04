-- BOSSA CRM — Prompt final da Nara em chave própria
-- Migra configurações salvas pelo PR #40 sem alterar o schema da tabela.

begin;

with legacy as (
  select
    id,
    knowledge,
    btrim(knowledge ->> 'triagem_pergunta_inicial') as prompt_text
  from public.ai_agent_configs
  where agent = 'nara'
    and btrim(coalesce(knowledge ->> 'triagem_pergunta_inicial', '')) like '# PROMPT FINAL DA NARA%'
), normalized as (
  select
    id,
    knowledge,
    prompt_text,
    case
      when position('<PERGUNTA_TRIAGEM>' in prompt_text) > 0
       and position('</PERGUNTA_TRIAGEM>' in prompt_text) > position('<PERGUNTA_TRIAGEM>' in prompt_text)
      then btrim(split_part(split_part(prompt_text, '<PERGUNTA_TRIAGEM>', 2), '</PERGUNTA_TRIAGEM>', 1))
      else 'Para eu te direcionar certinho, você está buscando um imóvel para comprar ou precisa falar com a Bossa sobre outro assunto?'
    end as triage_question
  from legacy
)
update public.ai_agent_configs as config
set knowledge = (normalized.knowledge - 'triagem_pergunta_inicial' - 'prompt_final')
  || jsonb_build_object(
    'prompt_final', normalized.prompt_text,
    'triagem_pergunta_inicial', normalized.triage_question
  )
from normalized
where config.id = normalized.id;

commit;
