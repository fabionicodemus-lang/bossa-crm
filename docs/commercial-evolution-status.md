# Evolução comercial — implementação inicial em revisão

## Situação exata

**Implementação parcial, em branch de trabalho; não implantada em produção.** Este documento acompanha o pedido de 19 seções. Não representa a conclusão das quatro fases.

Base inspecionada: `d88fdd2` de `fabionicodemus-lang/bossa-crm`, Next.js 16/React 19/Supabase. Projeto Supabase identificado pela leitura das tabelas: `bossa-site`. Nenhum registro de produção foi alterado durante esta execução.

## Progresso por fase

| Fase | Implementado nesta alteração | Pendente para concluir a fase |
|---|---|---|
| 1 — base e cálculos | Oportunidades separadas de contatos; participantes; interesses principal/alternativos; eventos transacionais imutáveis; versões de proposta; contratos documentados; recebimentos com identificador único; regras canônicas de cartões/detalhe/exportação; RLS por organização; reativação sem mudar criação. | Integração de criação de oportunidades ao fluxo de intenção detectada; revisão de todos os produtores externos e das mesclagens de contatos; atribuição histórica temporal de todos os vínculos. |
| 2 — operação | Gestão com filtros, cartões, estoque atual do funil, ações, coortes, comparecimento, exportação paginada; lista/ficha de oportunidades; vínculos com agenda/propostas existentes; participantes e interesses; confirmação de contrato, distrato e recebimento. | Funil de oportunidades com arraste; filtros globais completos nos módulos existentes; tempo mediano/p90 por etapa; vinculação automática assistida; remarcação atômica pela interface; proposta com preparação/aprovação completas; Bossa Experience; alertas de concorrência por unidade; troca de interesse principal. |
| 3 — atendimento e marketing | Análise de transferências com aceite separado da primeira mensagem humana enviada com status válido; taxa no expediente configurado; casos fora do expediente destacados; revisão de conversa com trecho literal; ranking documentado por período com pesos existentes preservados. | SLA completo da escala de plantão; exclusão sistemática de testes/spam; continuidade e erros de envio/agenda; reestruturação de site/campanhas/transmissões e atribuição confiável; revisão do ranking legado e dos marcos inferidos. |
| 4 — planejamento e validação | Cadastro de metas, pesos configuráveis, parâmetros de amostra/paralisação, despesas documentadas, custos por origem com escopos de data idênticos; qualidade da base; comparativo de empreendimentos com contratos/valores atribuídos à unidade; testes de regressão em PostgreSQL isolado. | Demais custos/coortes; painel e diário de validade da coleta; metas por carteira/equipe com edição; alertas por amostra/maturação; homologação autenticada pela interface; implantação. |

## Rotas

- `/gestao`: nova visão, substitui apenas o antigo alias para `/dashboard`.
- `/gestao/oportunidades`: lista paginada do estoque atual.
- `/gestao/nova`: cadastro de uma intenção concreta de compra.
- `/gestao/oportunidades/[id]`: participantes, interesses, documentos e eventos.
- `/gestao/configuracoes`: metas, custos, ranking e revisão de conversas; administrador.
- `/api/commercial/export`: CSV da página de 50 registros, com a mesma consulta e os mesmos filtros do detalhamento.

`/dashboard` continua como painel legado. Agenda, propostas, corretores, Nara, site e campanhas existentes não foram substituídos. A busca de contatos foi reaproveitada, com seleção remota preservada e IDs acessíveis únicos.

## Migrações novas (ordem obrigatória)

1. `20261021011240_commercial_metrics_foundation.sql`
2. `20261021011422_commercial_metrics_queries.sql`
3. `20261021012121_commercial_operations_insights.sql`
4. `20261021094500_commercial_development_attribution.sql`

Geradas inicialmente com Supabase CLI. São adicionais; não alteram migrações anteriores, não apagam dados e não preenchem datas antigas por inferência. A agenda mantém os estados legados e recebe campos de desfecho comercial. Propostas antigas só entram na nova análise depois de vínculo explícito e de novos eventos documentados; vincular uma proposta enviada anteriormente não inventa um novo envio.

Não aplicar em produção enquanto as pendências de integração/homologação relevantes não forem tratadas. Antes disso, aplicar em uma cópia isolada do schema real, validar políticas existentes, advisors e fluxos autenticados. Os testes incluídos usam um schema mínimo compatível, não uma restauração integral de produção.

## Definições e limites

- **Novas**: criação de oportunidades, sem confundir contatos com intenções.
- **Qualificadas**: primeira entrada explícita na qualificação, com critérios preenchidos.
- **Visitas**: ocorrências realizadas com comprador/remotas. A data do cartão é a confirmação de desfecho no CRM, não uma data retroativa presumida.
- **Propostas**: primeira proposta formal enviada por oportunidade; versões não multiplicam o total.
- **Contratos/valor**: assinatura documentada; contagem e valor brutos. Distratos separados.
- **Entradas confirmadas**: lançamentos documentados por administrador; não há integração financeira automática. Não há reversão de recebimento/refundo nesta versão.
- **Coortes**: primeiras propostas/visitas do intervalo, contratos/propostas posteriores até o corte. Coortes abertas não equivalem a previsões. A comparação de maturação equivalente ainda está pendente.
- **Comparecimento**: realizadas / (realizadas + faltas); cancelamentos e pendências separados. Remarcadas não contam como falta.
- **Ranking**: pesos efetivamente encontrados no código (100/20/10/4/1). Interações revisadas têm limite mensal. O novo quadro usa fatos documentados; o ranking legado permanece separado.
- **SLA**: primeira mensagem humana enviada, excluindo mensagens sem status válido. Casos fora de expediente não são avaliados como se fossem atendidos pelo plantão. Entrega/leitura não são presumidas.
- **Custos**: despesas com intervalo exato do filtro e mesma origem. Não equivalem a CAC por coorte nem demonstram causalidade de campanha. A ausência de lançamento é indisponibilidade.
- **Filtros**: cartões/coortes usam empreendimento, responsável, corretor, origem e formato de visita. O quadro operacional informa explicitamente que usa toda a organização no período. O filtro de formato modifica apenas o fato de visita.
- **Comparação por empreendimento**: oportunidades, qualificação e visitas acompanham os interesses atuais e podem aparecer em dois empreendimentos; propostas enviadas são atribuídas pela unidade da proposta, contratos/valores/recebimentos pela unidade contratada. Sem vinculação histórica exclusiva das visitas a um produto. O comparativo usa até 12 empreendimentos simultâneos para limitar carga.
- **Histórico**: começa na implantação da nova coleta. Contatos legados não são convertidos automaticamente em oportunidades. Os marcos legados, inferidos de etapa/updated_at, permanecem para compatibilidade e não são usados nos novos cartões.
- **Permissões**: mesma fronteira por organização da aplicação existente. Novas carteiras/restrições por perfil exigem extensão antes de adoção. Configurações e confirmações financeiras são exclusivas do administrador; viewer não escreve.

## Verificação executada

- `npm run test:commercial`: migrações em PostgreSQL WASM/PGlite, teste de venda única com interesses em dois empreendimentos e filtro por corretor, casal, dois interesses sem duplicar, qualificação obrigatória, versões de proposta, proposta anterior à visita, remarcação, reativação, contrato/distrato, recebimento repetido, histórico imutável, conciliação, organização alheia com dados reais de teste, viewer, datas de Brasília e referência zero.
- `npm run typecheck`.
- `npm run lint`: sem erros; avisos preexistentes documentados na execução.
- `npm run build`, incluindo os testes de Nara exigidos pelo script do projeto.
- HTTP isolado: `/gestao` redireciona usuário sem sessão para login; exportação sem sessão retorna 401.

Não foi executado o percurso autenticado Nara → atendimento → visita → proposta → contrato na interface. Não há evidência de homologação ou implantação de produção.

## Como validar em homologação

1. Aplicar as três migrações em banco isolado com o schema real e configurar o preview para esse banco.
2. Usar apenas clientes/corretores/usuários de teste. Criar intenção de compra, vincular cônjuge e interesses de dois empreendimentos.
3. Vincular proposta e agenda existentes; registrar novos desfechos com evidência. Conferir cartões, páginas e CSV.
4. Confirmar contrato e entrada como administrador; verificar recusa para comercial/viewer e isolamento entre organizações.
5. Validar todas as pendências da matriz antes de promover a evolução como concluída.

## Reversão

Reverter o commit da aplicação ou a alteração de `/gestao` devolve o painel legado. Manter as tabelas, snapshots, recibos e eventos para preservar os dados produzidos. Se uma migração falhar antes de commit, a transação reverte suas próprias alterações. Não fazer DROP das novas tabelas depois que houver registros. Uma eventual desativação dos gatilhos deve ser registrada e acompanhada da marcação do intervalo sem coleta; não apagar o histórico. Executar restauração de backup apenas em ambiente isolado antes de qualquer intervenção em produção.

## Continuação de 21/10/2026

Novo comparativo de empreendimentos na Gestão, busca remota do filtro de corretor, atribuição de propostas e vendas à unidade real via migração aditiva e regressão de cliente com dois interesses. Esta continuação também permanece em rascunho: executar novo CI e homologação na cópia do banco antes de promover.
