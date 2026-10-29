# F1.5 — vínculo conservador de propostas e agenda

## Estado desta continuação

Implementação parcial em `feat/commercial-metrics-foundation`; nenhuma alteração de produção. O checklist continua **12/24 (50%)**, pois F1.5 inclui criação de intenções, outros produtores e revisão de mesclagens ainda pendentes. Não contar uma subentrega como macroentrega inteira.

A base `21e640b` foi confirmada aprovada em 21/10/2026, pela execução GitHub Actions `39617149820`. As alterações posteriores precisam de sua própria execução de CI; registrar o resultado por commit no PR, sem herdar aprovação da base.

## Vínculos conservadores

- Fila auditável de novos registros de propostas e compromissos comerciais, produzida na mesma transação da entidade.
- Vínculo automático **desativado por padrão**, habilitável apenas por administrador em `/gestao/vinculos`.
- Quando habilitado: novo registro com sessão humana, cliente não arquivado e exatamente uma oportunidade ativa, inclusive comprador/cônjuge documentado. Interesse em Flow e Alma não cria outra oportunidade.
- Nara/detecções da IA, integrações sem sessão humana, corretor sem comprador, ausência de oportunidade e múltiplas oportunidades permanecem para revisão explícita.
- Tela paginada de pendências e origem dos vínculos, com candidatos restritos ao contato/participantes ou ao corretor documentado. Cadastro manual de intenção continua disponível; não há criação automática neste incremento.
- Resolução em transação com bloqueio da fonte e da oportunidade, isolamento por organização, idempotência e recusa de trocar vínculo já resolvido.
- Revisão do vínculo não altera status, data, comissão, dono ou etapa. Não comprova envio retroativo. Propostas detectadas por IA já vinculadas produzem evento de envio **pendente**, excluído dos KPIs confirmados.
- Sem campanhas, mensagens WhatsApp ou alterações no prompt da Nara.

## Continuação — sessão humana na agenda

A API `/api/agenda` usava cliente administrativo mesmo para ações de uma pessoa autenticada. Isso eliminava `auth.uid()` da transação e classificava o registro como integração sem sessão humana. Agora suas leituras e gravações usam o cliente servidor vinculado aos cookies da sessão, sem fallback para service role. O autor vem do contexto autenticado, nunca de campos recebidos no corpo do pedido. A configuração automática continua desligada por padrão.

Antes de verificar disponibilidade ou sincronizar com Outlook, a API confere responsável membro da organização e contato da mesma organização. Contatos arquivados não recebem novos eventos; o cancelamento de evento existente com contato posteriormente arquivado continua permitido. Atualizações usam o `updated_at` lido como controle otimista: alteração concorrente não é sobrescrita silenciosamente.

Pela API da agenda, compromissos vinculados a oportunidade ou presentes na fila comercial não podem ser apagados nem trocar contato/tipo sem revisão específica. O cancelamento mantém o registro. A verificação acontece antes de qualquer exclusão no Outlook. Falha ao consultar o histórico interrompe a operação; não é tratada como ausência de histórico. Antes das migrações comerciais, a ausência da coluna preserva o caminho legado sem consultar uma tabela ainda inexistente.

Estas proteções são da API, não um bloqueio global de exclusões no banco. Atualizações diretas, automações, importação Outlook, exclusões/mesclagens de contatos e regras de remarcação ainda precisam da revisão transversal prevista em F1.5/F2.5. A exclusão de eventos legados não comerciais mantém a ordem anterior de sincronização; CRM e Outlook não formam transação atômica. Não afirmar integração externa completamente homologada.

## Migrações e dados

A rodada de sessão da agenda **não cria nem altera migração, política, configuração ou dado de produção**. Reutiliza as quatro migrações existentes do PR e as permissões por organização da agenda. A consulta de políticas/grants/constraints no projeto correto foi somente leitura.

A quarta migração foi ampliada na rodada anterior, ainda não implantada. Homologação deve aplicar as quatro migrações em ordem sobre cópia isolada do schema real. Banco descartável que recebeu uma versão anterior da quarta migração deve ser recriado; não editar histórico de migrações de banco com dados reais.

## Testes

- `node --experimental-strip-types --loader ./scripts/agenda/loader.mjs scripts/agenda/check-route.mjs`: 35 cenários da API, executados localmente com os adaptadores de sessão/banco/Outlook simulados; nenhuma chamada externa real. Cobrem autenticação, viewer/admin/comercial, identidade forjada, entrada inválida, contato/responsável de outra organização, arquivamento, conflito, falhas de consulta/escrita/Outlook, edição concorrente, cancelamento, exclusão protegida, compatibilidade anterior às migrações e filtros de calendário.
- `node scripts/commercial/check-agenda-session.mjs`: teste PostgreSQL isolado via PGlite, com papel `authenticated`, políticas de agenda e as quatro migrações. Verifica `actor_id` e `resolved_by` da sessão, isolamento, viewer e integração sem sessão permanecendo em revisão. Executar no CI; não substitui banco com schema integral.
- `scripts/commercial/check-linking.mjs`, teste comercial original e todas as regressões anteriores continuam no CI. Typecheck, lint e build também devem passar para cada revisão.

## Limites pendentes

1. Outros produtores sem sessão humana permanecem `system_review`. Nara continua automação, não deve impersonar Taís/Cíntia.
2. Criação automática de oportunidades por intenção comprovada, sincronização de etapas e revisão de todas as mesclagens/identidades ainda pendentes.
3. A fila captura inserções futuras e vínculos explícitos posteriores; não varre o histórico nem refaz decisões ao ativar a configuração.
4. Deduplicação global dos produtores ainda não existe: entidades legadas distintas podem gerar pendências distintas. Registro por entidade e resolução do mesmo vínculo são idempotentes.
5. Confirmação formal de envio detectado pela IA depende da evolução do fluxo de propostas; vincular não confirma envio.
6. Testes isolados não substituem login real no navegador, cópia integral do schema, múltiplas conexões concorrentes e sincronização real com Microsoft Calendar.
7. Candidatas usam vínculos atuais do comprador/cônjuge/corretor. Atribuição temporal completa permanece em F1.6.

## Reversão e implantação

Para interromper vínculos automáticos, desativar `commercial_settings.auto_link_enabled` na tela administrativa. A coleta e os vínculos já registrados permanecem. Não apagar fila, oportunidades ou eventos ao reverter a aplicação. Não publicar antes da homologação ponta a ponta.
