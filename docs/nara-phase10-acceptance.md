# Fase 10 — Matriz final de aceite da Nara

Esta fase automatiza os 20 casos definidos no briefing da migração para o Prompt v3.

O teste usa o mesmo núcleo determinístico compartilhado pelo simulador e pelo fluxo real do WhatsApp: triagem, consultas comerciais, guardrails, roteamento, decisão híbrida e proteção da janela de 24 horas. Nenhuma mensagem real é enviada a clientes durante a validação.

## Grupos validados

1. Primeira mensagem e anti-repetição — casos 1 a 4.
2. Preço, disponibilidade e curadoria — casos 5 a 10.
3. Corretor, cliente atual e venda assistida — casos 11 a 13.
4. Prioridade, handoff, falha e janela do WhatsApp — casos 14 a 17.
5. Limite de palavras, perguntas e transparência sobre IA — casos 18 a 20.

## Correções consolidadas nesta fase

- “Vi um anúncio de vocês” passa a ser reconhecido como sinal suficiente para apresentar Flow e Alma sem abrir com triagem.
- Vocabulário forte de corretor, como espelho, comissão, VGV e cliente ativo, bloqueia consulta de preço e direciona o lead ao pipeline de corretores.
- “Meu corretor me indicou” é tratado como venda assistida: não muda o comprador para corretor, não consulta preço e cria passagem humana urgente preservando a parceria.
- O guardrail passa a bloquear respostas com mais de uma pergunta.
- A pergunta “você é robô?” recebe resposta determinística e oferta imediata de atendimento humano.
- Aberturas repetidas são removidas antes do envio quando o restante da resposta permite avançar a conversa.

Execute com `npm run test:nara-phase10`.
