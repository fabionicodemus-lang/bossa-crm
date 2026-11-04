# F1.5 — comandos de propostas e agenda sem repetição

Implementação parcial no PR #128, branch feat/commercial-metrics-foundation. Não publicada.
Checklist fixo: 12/24 macroentregas, 50%. Este incremento não encerra F1.5.

## Diagnóstico comprovado

O formulário de propostas gravava proposta, apagava/recriava parcelas, inseria atividade e movia contato em requisições separadas. Falha depois da criação mantinha o formulário como uma nova proposta. A agenda criava nova linha em toda tentativa e verificava conflito antes de recuperar eventual gravação anterior. O envio ao Graph usava transactionId apenas em videochamadas.

## Entregue no código

- RPC de proposta autenticada/security invoker: proposta, parcelas, atividade e registro imutável da requisição na mesma transação. Mantém os gatilhos existentes de vínculo, versões e eventos. Falha em parcelas/atividade desfaz o conjunto.
- Edição exige a revisão updated_at observada; duas edições concorrentes não sobrescrevem silenciosamente a primeira. Repetir a mesma edição não acrescenta versão.
- Requisição identificada por organização + usuário da sessão + UUID. Mesmo pedido recupera o registro atual; conteúdo/entidade diferente com a mesma chave gera conflito. Valores ou comprador iguais, por si só, não significam o mesmo pedido.
- Registro de requisições gerado somente por gatilho de origem, protegido por RLS, imutável e sem FK para o registro mutável. Uma exclusão não permite reutilizar a chave para recriar o registro.
- API de criação humana da agenda exige Idempotency-Key e recupera a gravação antes de consultar disponibilidade ou chamar Outlook. Uma corrida recuperada dentro da RPC também não repete o efeito externo. Cancelamento/edição posterior é preservado.
- Formulários usam chave estável durante a tentativa, bloqueio síncrono de cliques e não mudam silenciosamente o pedido quando a resposta é incerta. Erro definitivo permite corrigir; falha de rede mantém a chave.
- Proposta confirmada é refletida na tela antes de trabalho opcional de etapa/PDF. Falha de etapa não é apresentada como falha de salvamento e replay não repete esse efeito legado.
- Avisos de sincronização da agenda são apresentados. transactionId do Graph agora é estável em todas as criações, inclusive presenciais; PATCH não cria uma nova identidade.

## Migração

Oitava, após as sete migrações anteriores: `20261021172930_commercial_source_idempotency.sql`.
Nome gerado pelo Supabase CLI 2.121.0 no Actions #39644177200 em diretório descartável. Nenhuma migração anterior modificada. Não há backfill, execução de mesclagens, envio externo ou ativação de configuração nesta migração. Nenhuma consulta ao projeto de produção foi necessária.

Novos campos `commercial_request` em proposals/agenda_events; tabela commercial_source_requests com RLS; funções públicas invoker com EXECUTE somente authenticated. Sem permissões de escrita novas em tabelas legadas, sem fallback com service_role.

## Verificação

- `check-source-requests.mjs`: 25 cenários em PGlite usando as oito migrações e a estrutura real de parcelas da migração legada. Transação, replay, edição obsoleta, chaves conflitantes, tombstone, rollback, RLS/ator e vínculo comercial.
- `check-source-request-client.mjs`: 9 verificações de helper, opções do Graph e estrutura das telas. Não são testes de navegador.
- `scripts/agenda/check-route.mjs`: 43 cenários, incluindo 8 novos. Adaptadores de banco/Outlook simulados; a lógica SQL é testada separadamente.
- `check-source-request-concurrency.mjs`: cinco disputas em PostgreSQL real com conexões independentes e barreira de bloqueio observável. Execução registrada no CI antes de considerar aprovação técnica.
- Validação principal e integridade anterior devem permanecer verdes na revisão final.

## Limites importantes

A chave do formulário é mantida durante a instância aberta, não é uma fila durável offline entre recarregamentos/abas/dispositivos. Depois de fechar/recarregar, conferir o histórico antes de iniciar outra criação. Não há deduplicação por semelhança de cliente/valor/data.

O formulário principal de propostas e a criação humana da agenda usam esses recibos. A troca rápida de status de proposta foi incorporada depois pela migração `20261021203000_commercial_proposal_status_once.sql`, sem regravar parcelas ou valores: versão observada, status, atividade e recibo ficam na mesma transação. O comando usa a mesma preparação e recuperação durável de propostas. A escolha de “Enviada” deixa qualquer evento `proposal_sent` pendente, sem provar envio ou mover a oportunidade. Produtores IA, importações, demais integrações e revisão de eventos detectados ainda precisam ser migrados/revistos. PATCH/remarcação da agenda mantém seu controle anterior, não ganhou recibo idempotente de comando. Novos callers de POST /api/agenda precisam enviar a chave; não há fallback ao caminho inseguro.

Outlook continua fora da transação PostgreSQL. Uma resposta recuperada NÃO comprova sincronização/convite remoto. O identificador do Graph é uma proteção adicional, não prova de entrega exatamente uma vez; falhas exigem conferir/sincronizar. Nenhum envio real foi testado.

A marcação legada da etapa do contato não foi convertida para uma operação transacional nesta rodada. Não certifica negociação, envio, leitura ou assinatura. Avanço automático das novas oportunidades continua opt-in conforme migração anterior.

Não é reconciliação de duplicatas comerciais já existentes. Não há mesclagem com perda de referências. Testes usam fixtures reduzidas, não uma restauração integral: faltam homologação autenticada, advisors no schema integral, carga, integridade completa dos produtores e publicação autorizada. Changelog e documentação oficial consultados; não foi feita atualização de dependências.

## Reversão

Reverter primeiro os callers por implantação controlada; preservar recibos, históricos e versões. Não apagar recibos para forçar nova tentativa nem remover proteções de identidade. O conjunto permanece sem merge/publicação até homologação.
