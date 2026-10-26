# Evolução comercial — estado verificável

## Progresso
- [x] Inspeção inicial do repositório, autenticação, dashboard, extração de eventos e estrutura do banco.
- [ ] Fase 1: modelo contato/oportunidade, eventos, migração e camada completa de métricas. Apenas primitivas de cálculo iniciadas.
- [ ] Fase 2: painel inicial, funil, agenda, propostas e corretores.
- [ ] Fase 3: Nara, transferências, site e campanhas. Somente correções preventivas no bloco legado de marketing.
- [ ] Fase 4: metas, custos, coortes, qualidade e validação integrada.

## Evidências da inspeção
Repositório Next.js 16/React 19/TypeScript, Supabase. Já há autenticação por membership, pipelines separados, agenda_events, proposals, lead_handoffs, lead_funnel_milestones, broker_business_events e rastreamento do site. As estruturas verificadas vinculam propostas, agenda e marcos a lead_id. Não existe modelo explícito de oportunidade nas tabelas públicas inspecionadas.
O dashboard lê até 5.000 contatos/10.000 mensagens para algumas métricas. Isso ainda precisa ser substituído por agregações no servidor. Há custos baseados em marcos de lead que não comprovam visitas realizadas ou contratos. Não migrar esses marcos automaticamente para fatos confirmados.
O banco expõe RLS nas tabelas inspecionadas, mas as políticas por carteira ainda precisam de auditoria e teste; RLS habilitada não prova isolamento suficiente.
O extrator de eventos de corretores pode marcar fatos como confirmed pela confiança da IA, sem revisão humana explícita. Isso deve ser separado da confirmação comercial na implementação completa.

## Alterações desta branch
- src/lib/commercial-metrics.ts: primitivas para custo, variação, taxa ponderada, validação de datas IANA America/Sao_Paulo e corte temporal de marcos.
- src/app/(crm)/dashboard/page.tsx: bloco de marketing usa sessão/RLS na leitura de leads e marcos, escopo explícito de organização; custos consolidados limitados ao administrador; falha ou truncamento da consulta impede cálculo; falta de histórico impede custos por etapa; data de corte e natureza legada dos marcos visíveis.
- scripts/check-commercial-metrics.mjs: regressão de referência zero, indisponibilidade, datas inválidas, limites históricos de horário de verão e corte de eventos.
- package.json: teste incluído no build.

## Limitações explícitas
Esta branch NÃO entrega as quatro fases. Ainda não separa oportunidades, não cria contratos/recebimentos, não reconstrói o histórico, não muda o ranking e não implementa novas automações. As demais métricas do dashboard continuam legadas.
O custo legado usa investimento de conta Meta e contatos identificados por source Meta; ainda não há conciliação completa de canal/campanha nem custo de aquisição definitivo.
Não há migração nem alteração de banco nesta entrega parcial.
Ambiente local de execução indisponível nesta sessão: build, navegador e testes integrados não puderam ser executados localmente. Verificar os resultados do CI no PR.

## Validação necessária antes de integrar
npm ci
npm run test:commercial-metrics
npm run typecheck
npm run lint
npm run build
Homologar /dashboard como administrador e comercial, incluindo erro de consulta e histórico ausente. Criar ambiente de teste isolado antes de desenvolver as migrações e executar a matriz completa solicitada.

## Reversão
Antes do merge: fechar o PR mantém a produção inalterada.
Após integração: reverter o commit desta branch e publicar o estado anterior. Não há reversão de dados ou de migrações necessária.
