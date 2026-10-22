# Homologação técnica comercial — 22/10/2026

**Resultado: integração do schema versionado aprovada; homologação integral do Supabase implantado permanece impedida.** HEAD de entrada: `bebb0dfb44c9f737be10de02845871637ba858e1`, branch `feat/commercial-metrics-foundation`, árvore inicialmente limpa. A referência remota de `main` foi conferida em `d88fdd23d07f78dfe994df8e74445b9340153f14`. O checklist fixo do PR #128 mantém **12/24 macroentregas (50%)**: `████████████░░░░░░░░░░░░`. F1.5 permanece parcial; nenhum dos 24 itens foi acrescentado, removido ou promovido nesta rodada.

## Ambiente e alcance da evidência

Não havia conexão Supabase, dump estrutural, histórico `supabase_migrations`, credencial ou ferramenta de metadados do projeto implantado. A sessão confirmou ausência de secrets/identidades de saída configurados e nenhum acesso TCP ao projeto. Não houve tentativa de acessar produção com credenciais alternativas. O inventário do PR foi obtido pelo diff Git com a base remota conferida; não se repetiu a consulta anteriormente bloqueada à API do GitHub. Não se declara CI remoto aprovado para esta revisão.

A extração da imagem `supabase/postgres:17.6.1.101` falhou por falta de espaço no armazenamento do Docker. A execução utilizou **PostgreSQL 17.11**, imagem `postgres:17`, digest registrado no [manifesto de evidências](commercial-homologation-evidence.json). O contêiner não publica portas, usa `--network none` e é removido ao terminar. Somente identidades e registros sintéticos foram inseridos; seeds operacionais, contatos, telefones e configurações pessoais contidos no histórico não foram importados.

O teste aplica o DDL de negócio real dos **56 arquivos legados**, seguido dos **12 arquivos comerciais originais completos**, mais **uma correção aditiva**. Não utiliza as tabelas de negócio simplificadas das fixtures anteriores. Preserva enums, NOT NULL, FKs, defaults, triggers legados, políticas, índices e a exclusão GiST de sobreposição da agenda. São omitidas e inventariadas **65 instruções legadas** de dados/backfill, verificações de Vault, agendamento e extensões de automação. Funções de negócio e de trigger não são substituídas.

Auth/Storage usam o adaptador explícito `scripts/commercial/homologation/platform-adapter.sql`: identidade de sessão PostgreSQL, tabela mínima `auth.users`, objetos mínimos de Storage e publicação Realtime. Os grants de objetos públicos para `service_role` modelam a operação de servidor; grants de navegador provêm das próprias migrações. Defaults de privilégios reais do Supabase, serviço JWT, Storage, Realtime, Vault e extensões operacionais **não foram homologados**. Portanto, esse resultado não prova equivalência com o ambiente implantado.

## Ordem e dependências comerciais

Primeiro deve existir a estrutura legada: `001` (organização, perfis, papéis, contatos, mensagens e atividades), `005` (atendimento híbrido), `007`/`010`/`022_unit_status` (produtos, propostas e parcelas), `028_agenda`/`029` (agenda e exclusão de horários), `034` (marcos legados), `036` (parâmetros operacionais), `042` e `20261001211000` (mesclagem e identidade WhatsApp), além de `20261002150000` (RPC de escolha do responsável). O replay usa todos os arquivos legados, sem abreviar essas dependências.

| Ordem | Migração | Dependência principal / alteração |
|---|---|---|
| 1 | `20261021011240_commercial_metrics_foundation.sql` | Estrutura legada acima; oportunidades, eventos, versões, contratos, recebimentos e RLS |
| 2 | `20261021011422_commercial_metrics_queries.sql` | 1; fatos, painel, detalhe e proteção do histórico |
| 3 | `20261021012121_commercial_operations_insights.sql` | 1–2 e parâmetros operacionais de `036`; custos, revisão literal, SLA e ranking |
| 4 | `20261021094500_commercial_development_attribution.sql` | 1–3; atribuição, duração, fila/vínculo e guarda de detecção IA |
| 5 | `20261021155436_commercial_verified_intent.sql` | 1–4; criação revisada da intenção e preservação da origem |
| 6 | `20261021162332_commercial_fact_stage_sync.sql` | 1–5; decisões de etapa; opção automática continua desativada |
| 7 | `20261021165139_commercial_contact_integrity.sql` | 1–6 e mesclagem legada; proteção de identidades e wrapper da mesclagem |
| 8 | `20261021172930_commercial_source_idempotency.sql` | 1–7 e propostas/parcelas/agenda legadas; comandos e recibos atômicos |
| 9 | `20261021182758_commercial_recoverable_requests.sql` | 8; preparação, recuperação, confirmação e abandono |
| 10 | `20261021190000_commercial_contact_reconciliation.sql` | 1–7; relação revisada entre contatos, sem mover fatos |
| 11 | `20261021203000_commercial_proposal_status_once.sql` | 8–9; status transacional com versão observada e evidência pendente |
| 12 | `20261021213000_commercial_ai_proposal_detection.sql` | 1–7, mensagens e parcelas legadas; produtor automático sem ator humano |
| 13 | `20261022123000_commercial_source_scope_integrity.sql` | Conjunto anterior e RPC legada de responsável; correções desta homologação |

O manifesto registra SHA-256 de **todos os 69 arquivos**, instruções omitidas com posição/hash, introdução e commits posteriores dos arquivos comerciais. A comparação com `origin/main` mostra os 12 arquivos originais como adições do PR; nenhuma migração legada foi editada pelo PR. Dentro do PR, houve alterações acumuladas em três arquivos:

- Atribuição `20261021094500`: `7334b72`, `4d03afc`, `b961afc`, `21e640b` após `0837d70`.
- Integridade `20261021165139`: `16e0f49` após `74753e7`.
- Reconciliação `20261021190000`: `5034421` após `2e5c5eb`.

Não reaplicar um arquivo já executado com outro hash. As migrações comerciais têm versões únicas, porém o histórico legado possui prefixos repetidos (`002`, `022`, `026`, `027`, `028`). O replay foi feito por `psql`, em ordem lexical compatível com a ordem documental dos dois `002`. Isso **não valida** um `supabase db reset` indiscriminado nem reconcilia o ledger real do CLI. O README antigo encerrava sua lista em `022`; esse trecho não representa todo o histórico atual.

## Defeitos comprovados e correção delimitada

O teste negativo sobre a revisão de entrada aceitou três escritas autenticadas indevidas: proposta ainda sem oportunidade com produto de outra organização; parcela com proposta de outra organização; agenda com responsável sem membership na organização. A RLS protegia a organização da própria linha, mas não essas referências. O validador comercial anterior retornava antes das verificações de proposta/agenda sem oportunidade, e parcelas não tinham uma guarda equivalente. O manifesto preserva os três resultados vermelhos; o mesmo teste passa após a correção.

A migração 13 acrescenta um trigger `SECURITY INVOKER` a propostas, parcelas e agenda. Valida referências e membros na organização da linha, unidade no empreendimento e preservação da organização em updates. Não acrescenta papel ou grant. Uma referência inválida interrompe a transação, inclusive quando o produtor usa `service_role`.

A auditoria também comprovou `EXECUTE` público em `next_client_handoff_owner(uuid,uuid)`, uma função legada `SECURITY DEFINER` que lê dados de encaminhamento e altera o último responsável. O código da aplicação usa essa RPC apenas pelo cliente administrativo em `hybrid-server.ts`. A migração revoga execução pública/anon/autenticada, mantém somente `service_role` e fixa o search path. Os testes conferem recusa de navegador e continuidade da chamada do servidor sem configurar atendimento automático.

Essas mudanças corrigem isolamento e autorização; não introduzem novo módulo, envio, prompt ou regra de venda. Nenhum dos 12 arquivos comerciais anteriores foi reescrito. Registros antigos inconsistentes **não são corrigidos por inferência**: após a migração, uma atualização dessas linhas pode ser recusada. A consulta somente de leitura `preflight-source-scope.sql` inventaria os casos por contagem; passou sem violações no conjunto sintético. Dados reais, inclusive autores que perderam membership, precisam de revisão explícita em uma cópia estrutural e sanitizada antes de promoção.

## Testes integrados e inventário

O comando `node scripts/commercial/check-integrated-schema.mjs` passou **16 cenários integrados** no mesmo banco reconstruído:

- Proposta humana, parcelas, atividade, recibo, preparação e repetição sem duplicação; chave com conteúdo diferente recusada.
- Intenção revisada, oportunidade, vínculo e snapshot capturado no banco; IDs originais preservados.
- Status rápido preservando finanças e parcelas; escolha “enviada” continua pendente e não entra como envio confirmado.
- Falha na atividade revertendo proposta vinculada, versão, ledger e recibo juntos.
- Agenda real, recuperação, vínculo, exclusão GiST de sobreposição e recusa de conclusão futura.
- Visita concluída, envio documentado sintético, contrato por administrador e recebimento único; fatos, painel, detalhe, operações e duração executados com permissões reais de papel PostgreSQL.
- Detecção WhatsApp como rascunho, transferência humana, recibo estável e edição humana preservada; sem envio, contrato ou recebimento inferido.
- Reconciliação proposta/revisada por usuários distintos, repetição e preservação de contatos, fatos e snapshots.
- Isolamento de duas organizações, viewer, anônimo, RPC privilegiada e referências estrangeiras diretas.
- Duas alterações concorrentes de status: uma vencedora e um conflito de versão; duas tentativas IA: uma proposta/parcelas/atividade/recibo; edição humana concorrente vencendo a IA; falha intermediária da IA com rollback e repetição bem-sucedida.
- Opções de vínculo e etapa automática desativadas; nenhum job de alerta ou agendamento foi criado.

Inventário observado: **72 tabelas públicas**, todas com RLS; **20 tabelas comerciais**; **87 triggers**, **447 constraints**, **239 índices**, **156 políticas** públicas/Storage e **303 funções** públicas/privadas, incluindo extensões. Nenhuma constraint não validada ou índice inválido foi encontrado. Os catálogos completos e planos ficam nos artefatos JSON do teste; o CI foi configurado para preservá-los, sem pressupor sua aprovação remota.

Os dois novos portões públicos `SECURITY DEFINER` comerciais são os da reconciliação, restritos a `authenticated`, com checagem de sessão/papel/organização e search path seguro. A rotina de mesclagem legada permanece privada e restrita ao servidor; as demais funções privilegiadas legadas estão enumeradas no manifesto. Sete funções comerciais de trigger ainda possuem o `EXECUTE` público padrão; retornam `trigger` e não são RPCs invocáveis diretamente. Isso não equivale à exposição da RPC de responsável corrigida. Não foi feito um endurecimento genérico de funções fora do escopo comprovado.

As suítes existentes de negócio comercial, vinculação, intenção, etapas, agenda, integridade, reconciliação, ações, status, recuperação, pedidos de origem e produtor IA **passaram**. Também passaram as oito suítes de concorrência PostgreSQL de intenção, etapas, integridade, recuperação, pedidos de origem, reconciliação, status e detecção IA. Elas mantêm suas fixtures/adaptadores próprios; seu resultado é separado da reconstrução integrada.

Após `npm ci`, usando Node **22.23.3**, passaram typecheck, build com variáveis fictícias documentadas no CI e regressões de Hoje, Meta, tabelas, arquivos e Nara. O lint terminou com **0 erros e 11 avisos preexistentes**; os arquivos novos passaram também pela verificação direcionada. Nenhum teste de navegador renderizado, autenticação JWT implantada ou serviço externo real foi homologado nesta rodada. Os comandos/grupos e resultados estão no campo `validation` do manifesto.

## Segurança e desempenho: limites e riscos

Foram usadas consultas de catálogo, testes negativos de autorização/RLS e `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` com sessão autenticada, 2.000 contatos/oportunidades sintéticos distintos e eventos reais de trigger. Amostras locais desta execução: busca seletiva por contato usou `commercial_identity_buyer` (~1 ms); procura negativa de identidade histórica ~53 ms; filtro de snapshots fez `Seq Scan` em 2.011 eventos (~36 ms); painel ~148 ms. São medições diagnósticas sob carga local, sem SLA ou equivalência à produção.

A busca por contato dentro de snapshots JSON não tem índice específico utilizável nessa forma de consulta; é risco de crescimento para exclusões/mesclagens. O inventário encontrou **29 FKs comerciais sem índice incondicional nas mesmas colunas iniciais**. A lista inclui casos com índices parciais ou índices iniciados pela organização, que podem atender consultas da aplicação mas não todo acesso de FK. São candidatos a análise, não 29 falhas comprovadas nem autorização para criar índices em massa. Nenhum índice especulativo foi acrescentado.

`plpgsql_check` não está instalado na imagem utilizada. Advisors Supabase, estatísticas/carga reais, bloat e logs do projeto não estavam acessíveis. FKs simples legadas e mutações dos cadastros-pai ainda exigem revisão no schema real; os triggers corrigidos não substituem uma auditoria de todos os produtores/importações. A validação de privilégio usa o adaptador descrito, e não comprova os default privileges atuais da plataforma implantada.

## Impedimentos e sequência

Para homologação integral faltam: DDL sanitizado e ledger real de migrações; comparação dos hashes/objetos/políticas/grants; ambiente Supabase isolado com as extensões correspondentes; preflight de referências existentes; fluxo autenticado implantado e análise de desempenho com distribuição representativa. Nenhuma produção foi alterada e não houve merge, deploy, automação ativada ou mensagem real.

A integração técnica do **repositório** passou após as correções; a homologação integral está pendente desses impedimentos. A próxima tarefa funcional fica registrada, condicionada ao fechamento dessa homologação: **integração transacional dos compromissos detectados pelo WhatsApp**. Ela não foi iniciada. A barra permanece **12/24**, com F1.5 parcial.
