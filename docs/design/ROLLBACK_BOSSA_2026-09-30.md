# Retorno ao visual anterior — Bossa CRM

A versão anterior foi preservada antes de qualquer edição.

- Repositório: `fabionicodemus-lang/bossa-crm`.
- Branch de backup: `backup/visual-antes-redesign-2026-09-30`.
- Commit preservado: `4bcca0fdeea182b84f286adb8b6e9f998808166c`.
- Produção anterior confirmada na Vercel: `dpl_7jsK6NZzTrp8KDAghgfNow3RD3hp`, READY, domínio oficial `crm.bossaempreendimentos.com.br`.
- Branch da atualização: `feat/bossa-visual-hoje-2026-09-30`.

## Como retornar

Antes do merge, basta continuar usando a produção atual e fechar o PR.
Depois do merge, reverta o merge da atualização em um novo PR, sem reset forçado da main. Publique o revert pela integração GitHub/Vercel. Isso restaura o visual e mantém as mudanças de código que possam ter ocorrido depois. Para um retorno imediato, a produção anterior pode ser selecionada pelo rollback da Vercel, após verificar o deployment acima.

O backup preserva o código e o modelo visual. Não é um dump do banco.
Nenhuma migração, exclusão, importação ou alteração de registros foi executada para implantar o visual. O CRM usa a mesma base, autenticação e APIs existentes. Ações feitas pelo usuário nas telas, como concluir tarefas ou assumir atendimento, continuam gravando normalmente nessas APIs.

## Adaptações da referência

As etapas reais dos pipelines foram mantidas, incluindo Nara/Plantão, estados de passagem e encerramento. Não foram substituídas pelas etapas fictícias do protótipo. O indicador de clientes indicados por corretor mostra “—”, pois não existe relação estruturada para calculá-lo. Os arquivos do lead são os anexos identificados no histórico de mensagens carregado. Materiais gerais continuam no módulo de arquivos da IA. A agenda operacional traz tarefas; o calendário completo, reuniões, visitas e sincronização Microsoft ficam na seção Calendário.

A agenda usa contagens exatas e páginas de 50 registros. Foram encontrados 55.524 registros marcados como overdue na inspeção do banco, portanto o carregamento de todas as tarefas no navegador foi evitado. Todas permanecem no banco. Os alertas usam horários de interação e próximas ações existentes; nenhuma nova automação de mensagens foi criada.

## Validação

TypeScript, lint (somente avisos preexistentes), build de produção e 12 testes de datas/status passaram. Os campos consultados foram conferidos no schema de produção por consultas somente de leitura. A verificação visual automatizada no navegador local ficou indisponível: o daemon do navegador não iniciou e a instalação do navegador falhou por certificado do ambiente. A revisão visual no preview autenticado ainda deve ser feita antes do merge.
