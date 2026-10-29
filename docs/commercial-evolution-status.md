# Evolução comercial — implementação parcial em revisão

## Situação exata

A [homologação técnica integrada de 22/10/2026](commercial-homologation-status.md) validou a reconstrução do schema versionado e documentou correções de isolamento/autorização. A equivalência com o Supabase implantado continua impedida; esse resultado não altera a contagem de macroentregas.

**Em branch de trabalho; não implantada em produção.** Este documento acompanha o pedido original de 19 seções e suas quatro fases. O checklist fixo no comentário #6316857234 do PR #128 mantém **12/24 macroentregas (50%)**; entregas parciais não aumentam a barra. Os resultados de CI são registrados por SHA no PR; não herdar aprovação de revisões anteriores.

Base inspecionada: `d88fdd2` de `fabionicodemus-lang/bossa-crm`, Next.js 16/React 19/Supabase. Projeto de produção identificado: `bossa-site`. Nenhum dado, schema ou configuração de produção foi alterado nas continuações descritas aqui.

## Progresso por fase

| Fase | Implementado na branch | Pendente para concluir a fase |
|---|---|---|
| 1 — base e cálculos | Oportunidades separadas de contatos; participantes/interesses; eventos transacionais imutáveis; versões de proposta; contratos/recebimentos documentados; base canônica de cartões/detalhe/CSV; RLS por organização; reativação preservando criação. F1.5 parcial: vínculos conservadores, fila de revisão, sessão humana na agenda e criação assistida da intenção a partir de proposta/visita, em transação com evidência. | Integração completa dos produtores; atualização segura de etapas; deduplicação global; mesclagens e exclusões com histórico preservado em todos os caminhos; atribuição temporal de vínculos. A criação assistida não é criação autônoma por inferência da Nara. |
| 2 — operação | Gestão com filtros/cartões, estoque do funil, ações, conversão básica, comparecimento, exportação paginada; lista/ficha de oportunidades; vínculos manuais com agenda/propostas; participantes/interesses; contratos/distratos/recebimentos; acesso pela ficha do cliente e pré-seleção do contato; mediana/P90 das transições concluídas. | Kanban com arraste; filtros globais completos; remarcação atômica pela interface; proposta com preparação/aprovação/envio completos; Bossa Experience; concorrência por unidade; troca de interesse principal. |
| 3 — atendimento e marketing | Transferências com aceite separado de primeira mensagem humana válida; taxa no expediente configurado; fora do expediente destacado; revisão literal de conversa; ranking documentado com pesos preservados. | SLA completo da escala de plantão; exclusão de testes/spam; continuidade e erros de envio/agenda; site/campanhas/transmissões e atribuição confiável; revisão do ranking/marcos legados. |
| 4 — planejamento e validação | Metas básicas, pesos, parâmetros de amostra/paralisação, despesas documentadas, custos por origem com mesmo escopo de datas, qualidade básica, comparativo por empreendimento e testes automatizados isolados. | Demais custos/coortes; painel/diário de validade da coleta; metas editáveis por carteira/equipe; alertas por amostra/maturação; homologação autenticada com schema integral e integrações reais; implantação controlada. |

## Rotas

- `/gestao`: nova visão; substitui apenas o antigo alias para `/dashboard`.
- `/gestao/oportunidades`: lista paginada do estoque atual.
- `/gestao/nova`: cadastro de intenção, opcionalmente com `lead_id` da ficha do cliente.
- `/gestao/oportunidades/[id]`: participantes, interesses, documentos e eventos.
- `/gestao/configuracoes`: metas, custos, ranking e revisão; administrador.
- `/gestao/vinculos`: fila de revisão e controle administrativo da vinculação automática.
- `/gestao/vinculos/nova`: criação assistida de intenção com origem, comprador, revisão humana e evidência.
- `/api/commercial/export`: CSV de uma página de 50 registros pela mesma consulta e filtros do detalhe.

`/dashboard` permanece como painel legado. Agenda, propostas, corretores, Nara, site e campanhas não foram substituídos. A agenda manual passou a utilizar sessão humana e RLS; os produtores automáticos ainda não foram todos revisados. Nenhuma campanha ou mensagem foi disparada.

## Migrações novas — ordem obrigatória

1. `20261021011240_commercial_metrics_foundation.sql`
2. `20261021011422_commercial_metrics_queries.sql`
3. `20261021012121_commercial_operations_insights.sql`
4. `20261021094500_commercial_development_attribution.sql`
5. `20261021155436_commercial_verified_intent.sql`

A quinta é aditiva, criada com Supabase CLI 2.121.0 em diretório descartável (Actions #39629919284), sem conexão ao projeto. Ela não altera os quatro arquivos anteriores. A quarta havia sido ampliada nas rodadas anteriores enquanto ainda não implantada; não reutilizar versões divergentes num banco com dados reais. Recriar a homologação descartável para testar o conjunto correto.

Não aplicar em produção antes de validar uma cópia isolada do schema integral, políticas existentes, advisors e fluxos autenticados. Os testes usam fixtures mínimas compatíveis; não são restauração completa de produção. Nenhuma data antiga é preenchida por inferência, e vincular proposta anteriormente enviada não inventa um novo envio.

## Definições e limites dos indicadores

- **Novas:** criação de oportunidades, distinta de contatos; uma criação assistida recebe a data atual, não a data presumida da conversa antiga.
- **Qualificadas:** primeira entrada explícita na qualificação com critérios preenchidos. Confirmar intenção não equivale a qualificar.
- **Visitas:** ocorrências realizadas com comprador/remotas; data do indicador é registro do desfecho, não data retroativa presumida.
- **Propostas:** primeiro envio formal confirmado por oportunidade; revisões não multiplicam o total. Detecção da IA não é envio confirmado, mesmo depois do vínculo.
- **Contratos/valor:** assinatura documentada; contagem e valor brutos; distratos separados.
- **Entradas:** lançamentos documentados pelo administrador. Não existe integração financeira automática nem reversão/refundo nesta versão.
- **Coortes:** primeiras propostas/visitas do intervalo e resultados posteriores até o corte; não são previsão. Comparação com maturação equivalente ainda pendente.
- **Comparecimento:** realizadas / (realizadas + faltas); canceladas, pendentes e remarcadas separados.
- **Duração:** mediana/P90 apenas de etapas com entrada e saída documentadas, encerradas no período; não estima oportunidades ainda abertas. Carteira nos filtros é a atualmente atribuída.
- **Ranking:** pesos existentes 100/20/10/4/1, interações com evidência revisada e limite mensal. Ranking legado continua separado.
- **SLA:** primeira mensagem humana enviada com status válido; aceite não é resposta e envio não comprova leitura. Fora do expediente requer análise do plantão e não integra a taxa do expediente.
- **Custos:** despesas com intervalo e origem idênticos aos filtros. Não é CAC por coorte nem prova de causalidade de campanha. Falta de lançamento é indisponibilidade, não zero presumido.
- **Filtros:** cartões/coortes por empreendimento, responsável, corretor, origem e formato; formato altera somente fatos de visita. Bloco operacional declara usar toda a organização no período.
- **Empreendimentos:** intenções/qualificação/visitas usam interesses atuais e podem aparecer em dois produtos; essas colunas não são somáveis. Proposta pela unidade proposta; contratos/valores/recebimentos pela unidade contratada. Visitas ainda não têm atribuição histórica exclusiva. Comparativo limita consultas a 12 empreendimentos.
- **Histórico:** inicia na coleta nova; contatos antigos e marcos inferidos de etapa/updated_at não são convertidos em fatos novos. Intenção criada por revisão de uma origem marca histórico incompleto.
- **Permissões:** fronteira por organização e papel; configurações e confirmações financeiras restritas ao administrador. Comercial pode confirmar intenção; viewer não escreve. Novas restrições por carteira precisam de extensão.

## Integração F1.5 — limites atuais

`docs/commercial-linking-status.md` detalha a fila, a vinculação conservadora e o usuário da sessão na agenda. O controle automático permanece desativado por padrão; nenhuma ativação foi realizada. IA, integrações sem sessão humana e ambiguidades exigem revisão.

`docs/commercial-intent-status.md` detalha a criação assistida com comprador real e confirmação humana: oportunidade, interesse da proposta, vínculo e evidência em uma transação, repetição idempotente e recusa de outra intenção ativa/nutrição para o comprador. O bloqueio de comprador serializa apenas este fluxo; não é deduplicação global de todos os produtores/cadastros.

A evidência é uma declaração humana auditada, não um verificador automático de verdade. Não confirma envio, visita realizada, qualificação, contrato ou recebimento. Criação por IA sem revisão e sincronização geral das etapas continuam pendentes.

A API da agenda protege exclusão/identidade comercial; a quinta migração acrescenta proteção no banco para origens com confirmação de intenção. Isso não substitui a revisão de todos os produtores, importações Outlook, mesclagens e exclusões. CRM e Outlook não são uma única transação.

## Verificação

As revisões `4d03afc`, `21e640b` e `40ffe98` possuem resultados aprovados registrados no PR. Toda alteração posterior exige novo CI. A primeira execução da criação assistida passou nos testes de negócio e concorrência, mas apontou impureza de renderização na página; a correção mantém o relógio do banco como autoridade no momento da confirmação. Consultar o PR para o resultado do SHA mais recente.

Cobertura automatizada:

- `test:commercial`: quatro migrações/base, qualificação, casal/interesses, versões, cronologia, reativação, contratos/distratos, recebimentos repetidos, histórico, RLS/viewer, datas, referência zero, atribuição por empreendimento e duração.
- `check-linking.mjs`: fila/vínculo conservador, sem backfill, ambiguidades e permissões.
- `scripts/agenda/check-route.mjs`: 35 cenários isolados com adaptadores Supabase/Outlook simulados.
- `check-agenda-session.mjs`: PostgreSQL isolado, usuário autenticado, ator e RLS da agenda.
- `check-intake.mjs`: 27 cenários de intenção revisada com as cinco migrações, rollback, evidência, identidade, permissões, precisão de versão e formulário.
- `check-intake-concurrency.mjs`: conexões independentes em PostgreSQL 17 descartável; mesma origem e origens concorrentes para o mesmo comprador, preservando microssegundos.
- Lint, typecheck, build e regressões existentes de Nara/Hoje/Meta/tabelas/acessos.

Não foi executado o fluxo autenticado completo Nara → atendimento → visita → proposta → contrato na interface, nem integração real de envio/Outlook. CI não equivale a homologação ou implantação.

## Como validar em homologação

1. Preparar banco isolado com o schema integral e aplicar as **cinco** migrações em ordem; configurar preview somente nesse banco.
2. Usar apenas clientes/corretores/usuários de teste. Criar uma intenção, vincular cônjuge e interesses em dois empreendimentos.
3. Testar fila/revisão, criar intenção a partir de proposta/visita, repetir confirmação e provocar atualização concorrente. Conferir evidência, autor, versão e ausência de fatos presumidos.
4. Vincular proposta/agenda, registrar novos desfechos, conferir cartões/detalhe/CSV. Validar papéis e isolamento.
5. Confirmar contrato/entrada como administrador; testar recusas para comercial/viewer e integrar agenda/Outlook no ambiente apropriado.
6. Resolver as pendências relevantes antes de promover; não marcar a iniciativa inteira como concluída.

## Reversão

Reverter a aplicação ou a mudança de `/gestao` devolve o painel legado. Desativar a opção de vinculação automática interrompe novos vínculos automáticos, sem remover os existentes. Retirar o acesso ao formulário impede novas confirmações assistidas.

Preservar tabelas, snapshots, recibos, confirmações e eventos. Não executar DROP depois de haver dados reais. Transações que falham revertem suas próprias alterações. Registrar qualquer intervalo sem coleta; não apagar o histórico para esconder falhas. Restauração de backup deve ser testada isoladamente antes de intervenção de produção.
