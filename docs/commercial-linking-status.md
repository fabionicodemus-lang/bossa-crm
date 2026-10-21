# F1.5 — vínculo conservador de propostas e agenda

## Estado desta continuação

Implementação parcial em `feat/commercial-metrics-foundation`; nenhuma alteração de produção. O checklist continua **12/24 (50%)**, pois F1.5 inclui outros produtores, criação de intenções e revisão de mesclagens ainda pendentes. Não contar esta subentrega como uma macroentrega inteira.

## O que foi acrescentado

- Fila auditável de novos registros de propostas e compromissos comerciais, produzida na mesma transação da entidade.
- Vínculo automático **desativado por padrão**, habilitável apenas por administrador em `/gestao/vinculos`.
- Quando habilitado: novo registro com sessão humana, cliente não arquivado e exatamente uma oportunidade ativa, inclusive vínculo documentado de comprador/cônjuge. Interesse em Flow e Alma não cria outra oportunidade.
- Nara/detecções da IA, integrações sem sessão humana, corretor sem comprador, ausência de oportunidade e múltiplas oportunidades permanecem para revisão explícita.
- Tela paginada de pendências e origem dos vínculos, com candidatos restritos ao contato/participantes ou ao corretor documentado. Cadastro manual de intenção continua disponível; não há criação automática neste incremento.
- Resolução em transação com bloqueio da fonte e da oportunidade, isolamento por organização, idempotência e recusa de trocar vínculo já resolvido.
- Revisão do vínculo não altera status, data, comissão, dono ou etapa. Não comprova envio retroativo. Propostas detectadas por IA que chegarem já vinculadas produzem evento de envio **pendente**, excluído dos KPIs confirmados.
- Sem campanhas, mensagens WhatsApp ou alterações no prompt da Nara.

## Migração

Foi ampliada a quarta migração **ainda não implantada**, `20261021094500_commercial_development_attribution.sql`. Leitura do projeto correto em 21/10/2026 confirmou ausência das tabelas `commercial_opportunities` e `commercial_settings` em produção. As quatro migrações do PR devem ser aplicadas em ordem numa cópia isolada do schema real. Um banco descartável que já recebeu a versão anterior da quarta migração precisa ser recriado para testar o novo conjunto; não editar histórico de migrações de bancos com dados reais.

## Limites deliberados

1. Agenda manual que usa service role sem JWT humano entra como `system_review`; isso evita presumir quem realizou a ação. Propagação segura do ator será uma continuação.
2. A criação automática de oportunidades por intenção detectada, sincronização das etapas e revisão de todas as mesclagens/identidades ainda não foram implementadas.
3. A fila captura inserções futuras e vínculos explícitos posteriores. Não varre/importa o histórico nem refaz decisões automaticamente depois de ligar a configuração.
4. Não há deduplicação global dos produtores: duas entidades legadas distintas podem gerar duas pendências. O registro por entidade e a resolução do mesmo vínculo são idempotentes.
5. Confirmação formal de um envio detectado por IA ainda depende da evolução do fluxo de propostas; vincular não confirma o envio.
6. Testes de SQL isolado não substituem homologação autenticada, concorrência real com múltiplas conexões, APIs de agenda/propostas ou políticas completas de produção.
7. A lista usa vínculos atuais do comprador/cônjuge/corretor. Atribuição temporal completa permanece em F1.6.

## Verificação e reversão

O CI deve executar o teste comercial original e `scripts/commercial/check-linking.mjs`, além das regressões existentes, lint, typecheck e build. Registrar resultados por commit no PR; não presumir aprovação antes de execução.

Para interromper vínculos automáticos, desativar `commercial_settings.auto_link_enabled` pela tela administrativa. A coleta e os vínculos já registrados permanecem. Reversão da aplicação não deve apagar a fila, oportunidades ou eventos. Não publicar antes da homologação.
