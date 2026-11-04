# F1.5 — criação assistida de intenção a partir de proposta/visita

## Entrega e limites

Nova ação em `/gestao/vinculos/nova?entity=proposals|agenda_events&id=...`, acessível em cada pendência. Requer sessão administrativa/comercial, comprador real ativo, título da intenção, próxima ação, evidência descritiva e confirmação explícita. A conferência humana é uma declaração auditada, não comprovação automática de envio/visita/venda.

O banco cria a oportunidade, associa o interesse de unidade quando a origem é uma proposta, vincula a origem, captura snapshot e registra quem confirmou, em uma única transação. A oportunidade começa em atendimento, com responsável igual ao usuário da sessão, data atual e histórico incompleto explícito. Não copia origem de marketing presumida nem altera responsável do contato. Fontes antigas, encerradas ou sem versão verificável são recusadas pelo atalho.

A mesma origem e os mesmos dados retornam a oportunidade existente em uma repetição, mesmo após mudança do timestamp por causa do vínculo. Repetição com dados divergentes é recusada. Outra origem para um comprador com intenção ativa ou em nutrição é recusada; casal documentado é considerado. Uma compra independente pode existir, mas exige o cadastro/revisão separado, não decisão automática deste atalho.

Corretor não vira comprador: é necessário selecionar um cliente real já cadastrado. Registro sem contato ou com contato arquivado é recusado. A confirmação não faz a IA criar compradores, não promove detecção a envio comprovado, não qualifica automaticamente e não registra contrato ou recebimento.

## Consistência e segurança

- RPC com `security invoker`, RLS, verificação de organização e papel. Sem acesso de execução para service_role ou anon; somente confirmação com sessão humana.
- Bloqueio da origem e dos contatos em ordem determinística. O bloqueio do comprador serializa os chamados concorrentes por este fluxo. Não equivale a deduplicação global dos demais produtores ou do cadastro manual.
- Versão `updated_at` exigida para não confirmar um documento que mudou depois da leitura. A string preserva microssegundos do banco.
- Evidência, ator, horário e snapshot são preservados; ator, horário e snapshot são gerados/validados pelo banco, não aceitos do navegador.
- Proteção no banco contra apagar ou trocar a identidade da origem que já possui esta confirmação, inclusive escrita direta. É uma proteção localizada; mesclagem/exclusão de todos os demais registros segue pendente.
- Nenhuma alteração automática de etapa além da etapa inicial desta nova oportunidade. Sincronização geral de etapas permanece pendente.

## Migração e validação

Quinta migração **nova e aditiva**: `20261021155436_commercial_verified_intent.sql`, criada com `supabase migration new commercial_verified_intent`, CLI 2.121.0, no diretório descartável da execução Actions #39629919284. As quatro migrações anteriores não são alteradas nesta rodada. O workflow temporário de preparação foi removido depois de produzir o nome real do arquivo.

Testes novos: `scripts/commercial/check-intake.mjs` (PGlite, cinco migrações, regras de negócio, autorizações, rollback, snapshots/imutabilidade e formulário) e `check-intake-concurrency.mjs` (duas conexões reais em PostgreSQL 17 descartável: mesma origem e origens diferentes para um comprador). O serviço de teste não usa projeto ou credenciais Supabase de produção.

Resultados devem ser registrados por SHA no PR depois do CI. Compilação/CI não substituem teste autenticado da interface, advisors, políticas completas, banco real e integrações. Não houve alteração de dados, configuração, migração ou mensagens em produção.

## Avanço

F1.5 continua parcial. Mantém-se 12/24 = 50% até concluir também atualização das etapas, demais produtores, deduplicação transversal e mesclagens. A criação assistida não deve ser rotulada como criação autônoma por inferência da Nara. A opção de vínculo automático existente permanece desativada por padrão.

## Reversão

Retirar o acesso ao novo formulário desativa novas confirmações. Preservar a tabela de confirmações, oportunidades, eventos e snapshots já gravados. Não apagar evidências ou reverter com DROP em um banco que contenha dados reais. Homologar as cinco migrações em banco isolado antes de qualquer publicação.
