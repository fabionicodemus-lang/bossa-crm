-- BOSSA CRM — Fase 9 da Nara: score 0–100 e enum real de classificação
-- Execute depois de 019_nara_prompt_versions.sql.
-- A migration guarda o prompt anterior e altera somente o bloco legado conhecido.

begin;

with current_prompts as (
  select
    id,
    organization_id,
    updated_by,
    knowledge,
    knowledge ->> 'prompt_final' as old_prompt
  from public.ai_agent_configs
  where agent = 'nara'
    and coalesce(knowledge ->> 'prompt_final', '') like '# PROMPT FINAL DA NARA%'
), rewritten as (
  select
    id,
    organization_id,
    updated_by,
    knowledge,
    old_prompt,
    replace(
      replace(
        old_prompt,
        $legacy_score$### Pontuação

USO definido **+2** · decide em até 3 meses **+3** · 3 a 12 meses **+2** · faixa cabe **+3** · faixa muito abaixo **−4** · decide sozinho ou casal alinhado **+2** · pergunta técnica (planta, vaga, condomínio) **+2** · pediu tabela espontaneamente **+2**

**9 ou mais** = quente, feche a agenda nesta conversa · **5 a 8** = nutrir · **4 ou menos** = régua longa$legacy_score$,
        $phase9_score$### Score comercial (0–100)

Calcule um número inteiro de **0 a 100**, sem mostrar a pontuação ao contato. O score mede intenção de compra, aderência ao produto, momento e engajamento. Some as evidências abaixo e limite o resultado final ao intervalo de 0 a 100:

- intenção de compra, moradia, veraneio ou investimento confirmada: **+20**
- USO definido: **+10**
- pretende decidir em até 3 meses: **+20** · de 3 a 12 meses: **+10** · acima de 12 meses: **+5**
- faixa confirmada como compatível: **+20** · compatibilidade parcial: **+10**
- decisão individual ou casal/família alinhados: **+10**
- engajamento real, pergunta técnica ou resposta com contexto: **+10**
- pediu unidade, condição de pagamento, proposta, visita, ligação ou atendimento humano: **+10**

Regras de prevalência:

- pedido isolado de faixa geral, sem intenção confirmada, fica em **score máximo 20** e classificação `frio`;
- enquanto não houver sinal confiável de possível comprador, o score não passa de 20;
- faixa claramente incompatível limita o score a **25**, até surgir alternativa compatível confirmada;
- visita, proposta, reserva, negociação, unidade específica, condição comercial ou pedido de humano são sinais de alta intenção: use **score mínimo 80**, `handoff=true` e deixe o motor operacional definir a prioridade;
- transferência para Plantão, pós-venda ou outro setor não aumenta o score comercial de compra;
- opt-out, spam ou contato sem relação com a Bossa usa score 0.

### Classificação permitida

Use **exatamente um** destes valores no campo `classification`:

- `frio`: score de 0 a 20; curiosidade, intenção ainda não confirmada ou somente pedido de faixa geral;
- `morno`: score de 21 a 59; possível comprador com interesse real, mas ainda faltam aderência, prazo ou contexto;
- `quente`: score de 60 a 100; comprador com boa aderência ou intenção concreta, sem horário de visita/ligação já combinado;
- `agendamento`: somente quando visita, ligação ou videochamada estiver claramente combinada; use score mínimo 80, `stage=agendado` e `handoff=true`;
- `sem_interesse`: somente opt-out, spam ou contato sem relação útil com a Bossa; use score 0.

Nunca escreva `nutrir`, `régua longa`, A1, A2, B, C ou D no campo `classification`. Esses termos pertencem ao tratamento operacional e à prioridade, não ao enum de classificação. Um sinal explícito de alta intenção prevalece sobre a falta de campos de qualificação.$phase9_score$
      ),
      $price_anchor$**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.$price_anchor$,
      $price_aligned$**Nunca pule para o nível 3 antes de saber o uso.** Valor de apartamento específico sem contexto é só um número grande — e número grande sozinho afasta.

### Efeito do preço no score e na classificação

- **Nível 1 — faixa geral sem intenção confirmada:** mantenha `classification=frio`, score máximo 20, sem arquivo, sem unidade e sem liberar a qualificação.
- **Nível 2 — faixa por tipologia:** só pode elevar para `morno` quando a conversa também trouxer sinais reais de possível comprador; a faixa, sozinha, não aumenta o score.
- **Nível 3 — apartamento específico:** exige USO e intenção confirmados. Pedido de unidade, disponibilidade, entrada, parcela ou condição específica é sinal de alta intenção: score mínimo 80, `classification=quente` e `handoff=true`, salvo quando já houver compromisso agendado, caso em que a classificação é `agendamento`.
- Se a consulta falhar ou não confirmar a condição vigente, não compense aumentando score nem inventando valor; escale para confirmação humana.$price_aligned$
    ) as new_prompt
  from current_prompts
), changed as (
  select *
  from rewritten
  where new_prompt is distinct from old_prompt
), archived as (
  insert into public.nara_prompt_versions (
    organization_id,
    prompt_text,
    reason,
    restored_from_id,
    created_by
  )
  select
    changed.organization_id,
    changed.old_prompt,
    'save',
    null,
    changed.updated_by
  from changed
  where not exists (
    select 1
    from public.nara_prompt_versions as version
    where version.organization_id = changed.organization_id
      and version.prompt_text = changed.old_prompt
      and version.reason = 'save'
  )
  returning id
)
update public.ai_agent_configs as config
set knowledge = jsonb_set(changed.knowledge, '{prompt_final}', to_jsonb(changed.new_prompt), true)
from changed
where config.id = changed.id;

commit;
