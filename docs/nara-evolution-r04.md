# Nara — evolução R04 (06/11/2026)

Referência: estudo `Nara_Bossa_Estudo_Estrategia_Implementacao_R01_2026-11-06` entregue pela direção. Camada consultiva: `2026-11-06.evolucao-4`.

## Decisões preservadas

- Preço vem da consulta comercial estruturada vigente; condição personalizada exige avaliação humana, sem aprovação automática.
- Convite contextual para visita, vídeo ou proposta; qualificação progressiva não é barreira ao pedido explícito.
- Clientes, corretores, pós-venda e venda assistida continuam nos fluxos próprios.
- Alma a 300 m conforme instrução comercial vigente (não regredir para os 350 m do estudo); Flow a 800 m.
- Cadência 8 h e 48–72 h, limite de duas retomadas em 14 dias e janela 08:30–20:30. Templates existentes fora da janela de 24 h permanecem intactos.
- O simulador não envia WhatsApp nem cria compromissos reais.

## Integração incremental

1. `nara-journey`: registra a última solicitação, objeção e pendência declaradas, retorno combinado e necessidade de esclarecimento. Não transforma esses dados em preço ou condição aprovada.
2. `hybrid-server`: une os dados acumulados e o turno atual no briefing. Anexos só aparecem como enviados quando há mensagem outbound com status de envio. Mantém responsável, prazo e aceite pendente.
3. `nara-followup-context` / `nara-followup`: retomada contextual dentro da janela de serviço; pausa por humano, supressão, preferência e retorno. Revalida dados depois do claim antes do provider. A última leitura não é uma transação atômica com WhatsApp.
4. `nara-agenda-context`: distingue convite genérico de afirmação de confirmação. Não apaga explicação consultiva por encontrar “visita agendada”; não inventa aceite ou horário.
5. `agenda-ai-microsoft`: quando existe conexão Outlook, confirmação exige sincronização efetiva. Falhas deixam o compromisso pendente de verificação humana, sem uma segunda criação no teste.
6. Agenda e propostas: ações humanas explícitas distinguem realizado/não compareceu e proposta enviada/apresentada. Não inferir esses resultados de estágio, geração de PDF ou prazo vencido.
7. `nara-funnel-events`: trilha idempotente em `activities` (`type=nara_funil`, schema 1), sem migração. GET autenticado usa RLS + organização da sessão. Não reconstrói o legado.
8. `/nara/funil`: painel somente de leitura, com período inclusivo em Brasília, separação Cliente/Corretor, pessoas únicas e eventos. Expõe cobertura e eventual truncamento; não apresenta taxas sem coorte.
9. Resultados de agenda/proposta exigem declaração humana e versão do registro. Reagendamento concorrente, resultado futuro e tentativa de aceitar passagem por outra pessoa são bloqueados. Transferir é oferecer a responsabilidade, não provar que o destinatário aceitou.

## Operação e limites

- `inbound_24h` é opcional e desativado por padrão. Somente `sim` libera a primeira consulta espontânea noturna. Não amplia prospecção, expediente humano ou janela de template.
- Retorno com data ambígua pede esclarecimento e bloqueia retomadas. Data exata posterior é aceita como complemento quando a pendência é temporal. O parser é conservador, não universal.
- Retorno após 72 h cria/atualiza o acompanhamento no CRM; não inaugura um disparador de mensagens longas.
- Lembretes novos ao cliente não foram ativados: dependem da política operacional e do template aprovado quando necessário. Não confundir alerta interno com lembrete enviado ao cliente.
- Validade, versão e palavras-chave de materiais já existem e permanecem. Mapeamento de foto/vista real por unidade/andar requer curadoria factual; uma instrução de prompt não substitui essa evidência.
- Coleta por evento é parcial. A API informa `collection_catalog`; campos sem coletor retornam `null`, não zero. Contagens e pessoas únicas não são taxas de conversão.
- A passagem humana ainda usa múltiplas escritas, sem transação única. Falha intermediária exige reconciliação; não é criada evidência de aceite se a passagem não foi atualizada. Na agenda, falha apenas da métrica não repete o resultado e retorna aviso, sem reparo automático de telemetria.
- `previewNaraExperimentAssignment` é apenas preparação offline, sem hook de produção. Nenhum A/B real foi ativado.

## Testar com segurança

`npm run test:nara-evolution-r04` executa as novas proteções com dados sintéticos e adapters simulados. `npm run build` inclui esse gate e todas as suítes anteriores de Nara. Complementar com `npm run test:security:crm`, `npm run typecheck` e ESLint dos arquivos alterados.

Testes de proposta/agenda não devem usar contatos reais. Na interface de produção, verificar telas e o simulador; não registrar um encontro fictício ou uma proposta falsa apenas para preencher o funil.

## Medir depois da publicação

Estabelecer uma coorte de novos leads elegíveis por origem, empreendimento e tipo. Registrar encontros efetivamente realizados e propostas efetivamente apresentadas pela equipe. Somente depois calcular os resultados por 100 leads com denominador verificável. Qualidade sintática/testes aprovados não provam aumento de conversão comercial.

Revisão semanal sugerida: amostras que avançaram, pararam e recusaram, avaliando intenção, continuidade, evidência, passagem humana, respeito à preferência e fatos inventados. Nenhum agendamento recorrente foi criado por esta alteração.
