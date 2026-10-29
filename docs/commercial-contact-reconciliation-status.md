# F1.5 — reconciliação explícita de contatos (unidade parcial)

Esta unidade registra uma relação revisada entre duas fichas de clientes da mesma organização quando pelo menos uma tem histórico comercial. Uma proposta exige justificativa e referência de evidência independentes do telefone. Outro usuário com papel de administrador confere as duas fichas e confirma ou rejeita, com sua própria justificativa. A proposta e a decisão ficam auditadas com autor, horário e snapshot dos dois contatos. Repetições idênticas retornam o mesmo registro; propostas ou decisões divergentes são recusadas. As duas fichas são bloqueadas em ordem fixa durante a operação.

A confirmação **não mescla** fichas, não move propostas, agenda, mensagens, oportunidades, eventos ou contratos e não agrega indicadores. A ficha preferida é uma referência para revisão humana. Os vínculos e snapshots históricos continuam apontando para o contato original. A proteção de identidade comercial passa a incluir ambos os contatos desde a proposta, impedindo exclusão, reclassificação e mesclagem legada silenciosa.

Migração aditiva: `20261021190000_commercial_contact_reconciliation.sql`, após a migração de integridade. A página `/gestao/contatos` permite propor e revisar, e está ligada à Gestão. Acesso de leitura usa RLS por organização; as funções de escrita exigem membro comercial/administrador para propor e outro administrador para decidir. Escritas diretas na tabela não são concedidas à aplicação.

Os testes usam a fixture mínima de integridade em PGlite e transações independentes em PostgreSQL 17 descartável; não equivalem a restauração ou homologação com schema integral. Ainda faltam regras de atribuição temporal das relações, busca contextual no histórico unido e auditoria de todos os produtores. Esta unidade não conclui deduplicação global nem F1.5. O checklist fixo permanece **12/24 (50%)**, com 24 itens; nenhuma entrega parcial é contada como completa. Não houve migração em produção, merge ou deploy.

## Revisão corretiva da reconciliação

As ações reutilizam `commercialUuid` (formato 8-4-4-4-12). O teste de regressão executa as duas ações reais com adaptadores isolados; um UUID válido chega à RPC, um incompleto é recusado antes do banco e falhas da RPC não aparecem como sucesso. O teste falhou no commit anterior `2e5c5eb` para o primeiro UUID válido e passou após a correção.

As duas consultas de bloqueio em `leads` filtram por `organization_id` autorizado antes de adquirir qualquer bloqueio. Em PostgreSQL 17 isolado, um usuário pertencente à organização de teste tentou incluir uma ficha de outra organização enquanto ela estava bloqueada por outra transação: houve recusa imediata, sem esperar pelo bloqueio estrangeiro. O teste mantém verificações de repetição e decisões concorrentes.

As funções de escrita continuam `SECURITY DEFINER` porque a aplicação não recebe `INSERT` ou `UPDATE` direto na tabela de auditoria. A execução é concedida somente a `authenticated`; cada função exige `auth.uid()` e verifica papel/organização antes das consultas aos contatos. O caminho de busca prioriza `pg_catalog`, usa tabelas/funções qualificadas e deixa `pg_temp` por último. Nenhum privilégio adicional de tabela ou serviço foi concedido.

O teste de navegador renderiza a página real em Chromium, submete os formulários às ações reais com adaptadores isolados de autenticação e PGlite, vê a pendência como outro usuário e verifica confirmação/rejeição e preservação de oportunidades, mensagem e snapshots. Isso valida o percurso renderizado no harness; não equivale a homologação da autenticação Supabase nem do servidor Next.js com schema integral.
