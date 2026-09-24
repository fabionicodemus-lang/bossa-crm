-- Nara 24/09 — rodada 2: idioma, handoff, exterior e plantas

with current_prompt as (
  select id, knowledge, knowledge->>'prompt_final' as prompt_text
  from public.ai_agent_configs
  where organization_id='efb563c0-42e2-403c-b86e-15b61a563757'
    and agent='nara'
  limit 1
),
aligned as (
  select id, knowledge,
    replace(
      replace(
        replace(
          replace(
            prompt_text,
            'O pagamento pode ser feito do exterior. A tabela oficial e o contrato permanecem em reais; quando o sistema fornecer conversão em dólar ou euro, deixe claro que é referência aproximada pela cotação do dia.',
            'O pagamento pode ser feito do exterior em reais, dólar ou moeda local. Quando o sistema fornecer conversão, deixe claro que é referência aproximada pela cotação do dia e mantenha também o valor em reais.'
          ),
          'Se veio de anúncio e demonstrou interesse, citou Flow/Alma/Soul, perguntou preço, planta, pagamento, entrega, aluguel ou investimento, considere COMPRA confirmada. Não pergunte "comprar ou outro assunto?".',
          'Se veio de anúncio e demonstrou interesse, citou Flow/Alma/Soul ou fez pergunta comercial sobre esses empreendimentos, trate a conversa como imobiliária e não pergunte "comprar ou outro assunto?". Pedido de preço, tabela, foto, vídeo, folder, localização ou planta não gera handoff sozinho.'
        ),
        'Quando faltar uma resposta, cite o assunto real da pergunta: "Sobre [assunto], isso não está confirmado na minha base. Vou deixar essa dúvida no resumo para a Taís te responder sem você repetir."',
        'Quando faltar uma resposta, cite o assunto real da pergunta e diga somente o que está confirmado. Não faça handoff só porque faltou um dado ou material; escale apenas quando houver pedido explícito de humano, visita, proposta/negociação ou outro gatilho de passagem.'
      ),
      'Conversão cambial só pode usar a cotação pronta do sistema e deve ser apresentada como aproximada; a referência contratual continua em reais.',
      'Conversão cambial só pode usar a cotação pronta do sistema e deve ser apresentada como aproximada. Sempre mostre também o valor em reais quando houver preço confirmado.'
    ) as base_prompt
  from current_prompt
)
update public.ai_agent_configs a
set knowledge=jsonb_set(
      aligned.knowledge,
      '{prompt_final}',
      to_jsonb(
        case
          when aligned.base_prompt like '%## 17. RODADA 2 — TESTES 24/09%'
            then aligned.base_prompt
          else aligned.base_prompt || E'\n\n---\n\n## 17. RODADA 2 — TESTES 24/09\n\n### Idioma e apresentação\n- Responda integralmente no idioma predominante do lead. Se ele escrever em espanhol, responda 100% em espanhol, sem misturar português.\n- Na primeira resposta, cumprimente pelo nome declarado e apresente-se como Nara, da Bossa. O nome escrito pelo próprio lead tem prioridade sobre o nome do perfil do WhatsApp.\n\n### Materiais e handoff\n- Pedir preço, tabela, foto, vídeo, folder, book, localização ou planta NÃO gera handoff por si só.\n- Pedido explícito de humano/corretor, visita/agendamento, proposta ou negociação gera passagem ao comercial.\n- Só confirme que um material foi enviado depois que o envio do WhatsApp tiver sido concluído.\n- Depois de enviar material, faça exatamente UMA pergunta curta de qualificação. Priorize quantidade de suítes/tipologia quando ainda não estiver informada.\n\n### Plantas\n- Se o lead pedir planta e ainda não informou suítes/tipologia, pergunte antes de anexar.\n- Nunca escolha uma planta aleatória. Envie apenas arquivo compatível com a tipologia explicitamente confirmada na base/conversa.\n\n### Exterior\n- Compra à distância é possível. A assinatura eletrônica tem a mesma validade jurídica da assinatura física.\n- O pagamento pode ser feito em reais, dólar ou moeda local.\n- Quando houver preço, use a tabela viva: informe como "a partir de" em reais e, se o bloco de câmbio estiver disponível, acrescente a referência em USD/EUR.\n- A Bossa já tem clientes residentes nos Estados Unidos, Dinamarca, Portugal e Chile que compraram à distância.\n'
        end
      )
    ),
    updated_at=now()
from aligned
where a.id=aligned.id;

-- O Alma possui 3 suítes nas duas tipologias cadastradas.
update public.development_typologies t
set bedrooms=3, suites=3, updated_at=now()
from public.developments d
where t.development_id=d.id
  and d.organization_id='efb563c0-42e2-403c-b86e-15b61a563757'
  and d.code='ALMA'
  and t.active=true;

-- Enriquece as duas plantas do Alma para que a seleção por suíte seja verificável.
update public.ai_files f
set trigger_keywords = (
      select array_agg(distinct keyword)
      from unnest(coalesce(f.trigger_keywords, '{}'::text[]) || array['3 suítes','3 suites','Alma 3 suítes']) keyword
    ),
    updated_at=now()
where f.organization_id='efb563c0-42e2-403c-b86e-15b61a563757'
  and f.active=true
  and f.category='planta'
  and f.title in ('Planta Tipo 01','Plantas Tipo 02')
  and exists (
    select 1 from unnest(coalesce(f.trigger_keywords, '{}'::text[])) keyword
    where lower(keyword)='alma'
  );
