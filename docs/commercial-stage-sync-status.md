# F1.5 — etapas por fatos confirmados

## Escopo desta continuação

Sexta migração nova e aditiva: `20261021162332_commercial_fact_stage_sync.sql`, gerada por Supabase CLI 2.121.0 em diretório isolado da execução Actions #39634322618. Nenhuma das cinco migrações anteriores foi alterada. Aplicar as seis em ordem somente em homologação com schema integral antes de publicar.

Criado um avaliador transacional de novos eventos comerciais. O avanço automático começa **desativado** em todas as organizações. Somente administrador pode habilitar pela tela `/gestao/etapas`; ligar/desligar não reprocessa eventos antigos. Nenhuma configuração de produção foi ativada.

Regras de avanço quando habilitado:

- Visita com comprador/apresentação remota, agendada/confirmada por ação humana autorizada, com data futura e dados compatíveis: `visit_scheduled`.
- Desfecho realizado explicitamente registrado por humano em uma visita com comprador/remota e data compatível: `visit_completed`. A declaração humana continua sendo a evidência operacional; não verifica presença física.
- Novo evento de envio confirmado de proposta manual com unidade e `sent_at` preenchido: `proposal`. Não transforma mera detecção da IA em envio comprovado nem presume entrega/leitura pelo cliente.
- Contrato ativo com unidade, valor, documento, assinatura não futura e registro administrativo: `signed`.

Somente avança; não presume etapas intermediárias. Uma proposta pode ser registrada antes da visita, mas isso não cria qualificação ou visita fictícia. Não altera responsável, corretor, origem, criação ou próxima ação.

## Preservações e revisões

Perdido/nutrição/assinado não são reabertos por eventos novos. Eventos não confirmados, sem sessão humana, de origem automática, incompletos ou retroativos incompatíveis permanecem para revisão. Proposta sem data de envio não movimenta o funil, mesmo que o status legado diga enviada.

Cancelamentos, faltas, remarcações e distratos não apagam o histórico nem retrocedem silenciosamente a oportunidade: geram avaliação de revisão. O histórico de avaliações **não é uma lista de tarefas resolvidas**; não há mecanismo de resolução/reprocessamento destes registros nesta entrega. A equipe acessa a oportunidade/origem e faz a revisão operacional apropriada.

A automação usa as declarações e documentos já gravados no ledger e confere a entidade de origem. Não certifica a veracidade de um documento manual ou o envio físico. O fluxo completo de envio e a confirmação das detecções de IA continuam em F2.6. A semântica completa de visitas/remarcações e suas datas permanece em F2.5.

## Atomicidade, auditoria e permissões

O fato, a alteração de etapa, o evento de mudança e a decisão são gravados na mesma transação. Falha na auditoria reverte também a alteração da origem; não há best-effort que deixe estado parcialmente atualizado. Isso torna a homologação do schema integral obrigatória antes de ativar.

Cada evento avaliado tem uma única decisão, com etapas anterior/alvo/resultante, motivo, ator, horário e versão da política. Tabela com RLS e somente leitura/inserção via gatilhos; alteração/exclusão ou inserção manual da decisão são recusadas. Funções usam security invoker e search_path fixo, sem escalada de privilégio.

O bloqueio `FOR NO KEY UPDATE` serializa alterações da oportunidade mantendo compatibilidade com bloqueios de chave das referências da proposta/visita. Concorrência é testada em PostgreSQL 17 isolado; isso não substitui medição de carga no ambiente de homologação.

## Interface e validação

`/gestao/etapas`: controle administrativo, histórico paginado, filtros avançou/mantida/revisão e links para o histórico da oportunidade. Falha de migração/permissão é exibida como indisponibilidade, não zero. Há link pela lista de oportunidades.

`check-stages.mjs`: aplica as seis migrações em fixture PGlite e testa avanço, recusa, cancelamentos, isolamento, papéis, dados preservados, ausência de backfill e rollback.

`check-stage-concurrency.mjs`: executado após a suíte de intenção num PostgreSQL 17 descartável; testa visita/proposta simultâneas nas duas ordens e repetição de envio, sem deadlock ou regressão.

Os resultados de cada SHA devem ser registrados no PR após CI; não herdar aprovação da base anterior. Teste autenticado da tela, advisors/schema integral, integrações reais e implantação continuam pendentes.

## Progresso e reversão

F1.5 avançou, mas ainda faltam deduplicação transversal, revisão de todos os produtores e mesclagens/exclusões. Mantém-se **12/24 = 50%** até concluir a macroentrega completa. Esta atualização não executou migração, mensagem, campanha ou gravação no projeto de produção.

Desativar o avanço interrompe as movimentações futuras; não altera decisões ou etapas passadas. Não apagar tabelas/eventos para reverter; preservar as evidências. A configuração é independente do vínculo automático e da criação assistida de intenção.
