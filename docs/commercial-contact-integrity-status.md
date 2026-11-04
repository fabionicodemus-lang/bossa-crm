# F1.5 — integridade de contatos, exclusões e mesclagem

## Diagnóstico e escopo

Inspeção da branch identificou o produtor de mesclagem em `src/app/api/whatsapp/send/route.ts`, chamando `merge_duplicate_lead`. A implementação vigente vem de `20261001211000_canonical_whatsapp_identity.sql`: movimenta mensagens, agenda, propostas e tabelas legadas e arquiva a duplicata, mas não contempla os novos vínculos comerciais. A API anterior não conferia o objeto `data/error` da RPC e devolvia `mergedFromLeadId` mesmo sem confirmação de mesclagem.

Foram revisados também os caminhos de exclusão/arquivo (`leads/[id]/lifecycle`), reclassificação individual/em lote (`kind`, `bulk-kind`), identidade canônica por telefone e os produtores encontrados pelo inventário de código. O inventário não é prova de cobertura semântica de todos os produtores e não substitui testes ponta a ponta.

## Comportamento implementado

- Uma identidade com referência comercial atual ou preservada em snapshots não pode ser apagada, trocar de organização/classificação ou ser marcada como mesclada silenciosamente. Nome/telefone podem ser corrigidos e o contato pode ser arquivado/restaurado, sem apagar as evidências.
- Proposta/visita com vínculo ou fila comercial não pode ser apagada, mudar de contato ou trocar uma oportunidade já vinculada. O primeiro vínculo explícito continua permitido. Cancelamento preserva o registro; alterações normais de preço/status continuam sujeitas aos validadores existentes.
- Mensagens/conversas/transportes de uma identidade protegida não podem ser apagados ou transferidos por atualização direta. Texto que foi citado literalmente numa revisão é protegido; atualizações de entrega/leitura e enriquecimento de mídia ainda não revisada permanecem permitidos.
- Bloqueios de referência no contato serializam a validação contra alteração concorrente da classificação. Travas são testadas em PostgreSQL independente; nenhum teste garante ausência universal de deadlocks ou capacidade de carga.
- O serviço de mesclagem agora bloqueia os dois contatos em ordem fixa e confere identidade, organização, classificação e histórico ANTES de transferir qualquer registro. Casos comerciais e ambíguos retornam `review_required`, sem mover fontes. Não existe nesta entrega uma mesclagem automática do novo histórico comercial.
- A rotina legada é preservada integralmente num helper privado, com os privilégios restritos ao serviço já usado pela integração. A nova interface pública é `security invoker` e não é executável por anon/authenticated. Não se introduz uma nova função definer para contornar permissões.
- Duplicatas pré-coleta sem proteção e com identidade/classificação compatíveis continuam usando a rotina legada; repetir uma mesclagem já concluída não transfere ou registra novamente.
- O envio humano verifica o caso de identidade duplicada antes de chamar o provedor. Sem verificação disponível ou com conflito comercial, recusa antes de enviar. Conversas escolhidas que mudariam de contato também passam pela verificação.
- Se surgir conflito entre a verificação inicial e a tentativa de mesclagem depois do envio, a resposta distingue mensagem enviada de mesclagem pendente/falha. `mergedFromLeadId` só é informado quando a RPC confirmou os IDs corretos. A API inclui `mergeStatus` e `mergeWarning`; o uso desses avisos em todos os componentes de interface ainda precisa ser homologado.
- A rota de exclusão retorna mensagem compreensível e 409 para proteção comercial. As reclassificações também são protegidas no banco, inclusive em lote ou por integrações, mas a apresentação de cada erro por todas as telas permanece para revisão.

## Limites e próximos passos

A entrega impede alterações destrutivas; NÃO conclui a reconciliação de duas fichas com histórico comercial. Essa reconciliação precisa de modelo de identidade/aliases, revisão explícita, atribuição temporal e uma estratégia para manter os snapshots originais. Não chamar bloqueio de mesclagem de “mesclagem concluída”.

Não foi criada uma fila persistente de solicitações de mesclagem nem um assistente de resolução. O retorno informa que o caso exige revisão. Não foram fundidas oportunidades, confirmadas vendas, alteradas comissões, reprocessados históricos ou enviados WhatsApps reais.

A proteção usa referências existentes e snapshots com IDs explícitos. Não reconstrói uma referência que já tenha sido perdida antes da coleta. Correções de telefone não certificam que duas pessoas são a mesma pessoa. O índice canônico de telefone existente continua sendo uma regra técnica, não prova universal de identidade.

Outros produtores de propostas e agenda ainda precisam de chaves de idempotência/reconciliação transversal. Importações, #reset, limpezas, outras interfaces e a experiência do usuário quando uma proteção é acionada exigem homologação antes da publicação. Arquivamento mantém o histórico, mas a atomicidade de tarefas/passagens legadas fora da transação de contatos não foi reimplementada nesta rodada.

As consultas de histórico priorizam correção e podem varrer snapshots da organização em operações raras de mesclagem/exclusão. Medir desempenho e ajustar índices após validar o schema integral. Não aplicar a migração em produção sem essa verificação.

## Migração e testes

Sétima migração aditiva: `20261021165139_commercial_contact_integrity.sql`, gerada por Supabase CLI 2.121.0 no diretório descartável de Actions #39638501818. As seis migrações anteriores são preservadas. Ela não executa nenhuma mesclagem/exclusão nem altera dados de produção.

`integrity-fixture.mjs` carrega a função real de normalização de telefone e a implementação real de mesclagem do repositório, acrescentando as colunas/tabelas mínimas necessárias à fixture. Isso é mais abrangente que um mock de merge, mas não é uma restauração completa do schema.

Novo workflow de integridade testa resultado da RPC/avisos, mesclagem legada, proteção e permissões com as sete migrações, além de disputas de reclassificação/exclusão/mesclagem em conexões independentes PostgreSQL 17. O workflow principal continua exigindo as regressões anteriores, lint, tipos e build. Registrar resultados por SHA; não presumir sucesso antes da execução.

## Progresso e reversão

F1.5 permanece parcial: proteções de integridade não encerram deduplicação global ou reconciliação explícita de identidades. O checklist permanece **12/24 = 50%**. Nenhuma alteração foi aplicada à produção; nenhuma configuração automática foi ativada.

Para desativar funcionalidades, retirar os atalhos de automação sem remover histórico. Não remover as proteções nem expor o helper privado para forçar uma mesclagem. Uma revisão com dados reais exige plano próprio, evidência e transação testada. Preservar contatos arquivados, snapshots, fila e eventos.
