# Alma Sea Houses — Fase 3: relatório de implementação

Data: 21/10/2026 (UTC). Destino: `fabionicodemus-lang/bossa-crm`, exclusivamente `site/`. Branch: `feat/alma-fase3-previa`.

## Entrega e publicação

Implementação completa das dez seções aprovadas na fase 2, com as quatro rotas de plantas preservadas, contato contextual e espaços de produção na prévia. Prévia isolada gerada no projeto **bossa-site**, time **Elos OS**. Primeira versão verificada: https://bossa-site-ntwmsdynz-elos-os.vercel.app/empreendimentos/alma-seahouses (deploy `dpl_DznsXc7b2FSkJT8DWJSLG59KWQLP`, commit `e7a345caa35cd6105da7f97266986dabb3fa0486`). O endereço da consolidação final será registrado abaixo. O acesso mantém a proteção por login da Vercel.

Nenhum deploy de produção, merge em `main`, promoção, alteração de domínio, DNS, estado comercial, credenciais, estrutura de banco, CRM, Nara ou automações comerciais foi realizado. Os testes de formulário usaram respostas controladas e uma RPC HTTP local simulada. Não foram criados leads nem enviadas mensagens reais.

## Fontes, estado inicial e decisões

Lidos os anexos `1-Alma_Fase1_Ficha_e_Acervo-1.md` e `2-Alma_Fase2_Especificacao_Pagina-2.md` (versão 1.1 aprovada por Fábio), `README.md`, `site/README.md` e `site/CLAUDE.md`. Não havia `AGENTS.md` aplicável no checkout. Estado inicial limpo, branch local `work`, commit `d88fdd23d07f78dfe994df8e74445b9340153f14`. A consulta a `origin/main` não mostrou diferenças recentes em `site/` a reconciliar.

Preservados Literata, Urbanist, Ephesis, assinatura, paleta, curvas, renders e vídeos oficiais. Nenhuma imagem arquitetônica ou de obra foi gerada. As onze imagens de `vida/` não são utilizadas. A divergência de contagem na seção de aceite da FAQ da fase 2 foi resolvida pela lista editorial e pelo §15: **treze perguntas**, conforme o pedido de implementação.

O percentual segue a fonte única `e.edicoes[0]`: **10,52% · agosto de 2026 · boletim 07**. A FAQ usa a mesma edição. Não há nova medição ou fotografia de execução recebida.

## Alterações realizadas

1. Abertura com produto, previsão de entrega, botão direto para plantas, pôster e controle de animação; contato inicial geral.
2. Interiores antes do seletor, sem vincular renders a tipologias; M01 em 16:9 e animação duplex consultável.
3. Quatro plantas: 103/114 m², três suítes; 145/168 m², quatro suítes; duas vagas em todas. Comparação, ampliação com zoom e foco contido, compartilhamento com fallback, duas pranchas completas e aviso obrigatório dos duplex.
4. Uma seleção alimenta ficha, imagens, URL e mensagens. Troca usa substituição nativa de histórico, preservando formulário, rolagem e contagem de entrada. Links diretos e recarga restauram a opção correta; rota inválida permanece 404.
5. Posição e vistas recolhidas, com referências de altura e limitações; giro por sete imagens, anterior/próximo e controle por teclado.
6. Lazer em quatro usos, ambientes/pavimentos identificados, complemento breve de sábado e duas implantações ampliáveis. O salão do rooftop usa `alma/gourmet.jpg`.
7. Localização única, endereço correto, aproximadamente 300 m como referência, percurso vertical sob demanda, três quadros e mapa consultável. Tempos e distâncias divergentes foram omitidos.
8. Seis benefícios de conforto e consulta às especificações completas aprovadas.
9. Histórico Jazz/Soul, obra datada, treze respostas completas e um único contato final, com pedido de apresentação a confirmar pela equipe.
10. Navegação local com indicação ativa e barra móvel Plantas/Conversar, recolhida no contato, menu, foco em campo e modal.
11. Formulário de interesse geral: finalidade opcional vazia, aceite desmarcado, erros associados, preservação de dados e sucesso somente com HTTP 2xx + `ok === true` + `gravado === true`. Telefone internacional com `+` mantém DDI até o parâmetro da RPC; sem `+`, DDD nacional recebe 55. Não há planta/data em UTMs ou campos alternativos.
12. Eventos permitidos; exposição de plantas por um segundo contínuo com aba ativa e geometria visível, uma vez por opção por entrada. Sem evento de troca na inicialização, `view_price`, `request_visit` ou `download_material` na jornada do Alma. Mudança de comparabilidade da métrica de exposição: versão iniciada em **21/10/2026**, a efetivar somente após publicação futura.

## Verificações e evidências

- `npm run typecheck`: passou.
- `npm run build`: passou, 33 páginas geradas.
- `scripts/verificar-alma.cjs`: passou em Chromium local, com eventos e leads interceptados. Nenhum envio real. Inclui rotas, comparação, compartilhamento, formulário, zoom, teclado, barra, dados, FAQ, Flow e erros JavaScript.
- `scripts/verificar-api-alma.cjs`: passou; a rota HTTP real do site chamou uma RPC local simulada. Conferidos DDI +351, +1 e +49 até `p_telefone`, DDD brasileiro, finalidade nula, validação 422 e falha RPC 500.
- Complemento de navegador: formulário compartilhado do Flow em falha e sucesso controlados; mensagem offline apenas com `navigator.onLine === false`; contexto final de 168 m².
- Build local com `VERCEL_ENV=production`: cinco páginas do Alma sem `data-midia`, etiquetas internas ou quadros de produção; living e alternativas textuais preservados. Foi uma verificação local, sem publicação. Build final restaurado para prévia.
- HTML remoto da primeira prévia: página principal e quatro plantas retornaram 200 com títulos correspondentes, dez seções, nove posições de mídia, pré-registro, boletim datado e `noindex`. Sem submissão remota de formulário.
- `git diff --check`: passou.

As evidências estruturadas estão em [verificacao.json](docs/alma/capturas/verificacao.json), [api-verificacao.json](docs/alma/capturas/api-verificacao.json), [complementos-verificacao.json](docs/alma/capturas/complementos-verificacao.json) [publico-verificacao.json](docs/alma/capturas/publico-verificacao.json) e [previa-verificacao.json](docs/alma/capturas/previa-verificacao.json).

Para reproduzir os testes, iniciar um build local em `site/` e `npm run start -- -p 3200`. Executar `node scripts/verificar-alma.cjs` com Playwright disponível, ou informar seu caminho em `PLAYWRIGHT_MODULE`. O script aceita apenas localhost/127.0.0.1. O Chromium pode ser indicado em `CHROMIUM_PATH`. Executar `node scripts/verificar-api-alma.cjs` para a simulação da RPC; ela cria e encerra seus próprios servidores locais. Não usar o teste de formulário contra atendimento real.

### Critérios de aceite integrados da fase 2

| ID | Situação | Evidência objetiva / limite |
| --- | --- | --- |
| A01 | Atendido | Abertura capturada em 1440×1000 e 390×844; primeiro botão vai a `#plantas`; dez seções na ordem. |
| A02 | Atendido | As quatro rotas, recarga, atributos, desenhos, título e WhatsApp foram conferidos no navegador local. |
| A03 | Atendido | Trocas, comparação e visor preservam seleção; sem reload, alteração de scroll ou novo `page_view`. |
| A04 | Atendido | Dois duplex, duas pranchas inteiras; aviso no painel e modal; sem associação individual de lados/pisos. |
| A05 | Atendido nos testes controlados | Cópia confirmada, compartilhamento nativo simulado, cancelamento e falha com campo copiável. Diálogo real de compartilhamento do sistema operacional não verificado. |
| A06 | Atendido | Contato da abertura sem escolha não inclui 103 m². |
| A07 | Atendido | Botão de planta, barra móvel e contato final derivam da mesma seleção; 168 m² conferido nos caminhos finais. |
| A08 | Atendido em ambiente isolado | 2xx/ok/gravado; HTTP 500; gravado false; ok false; confirmação incompleta; JSON inválido; erro de rede e offline. Dados mantidos; evento somente com confirmação completa. |
| A09 | Atendido no contrato do site | Finalidade vazia e aceite desmarcado; validação de campos; DDI mantido até a RPC simulada. Persistência e atendimento internacional reais não verificados. |
| A10 | Atendido | Planta fora da tela sem evento; um segundo de exposição; retorno à opção sem duplicação; troca de URL sem nova entrada. |
| A11 | Atendido com alternativa aprovada | Boletim/FAQ com agosto de 2026 e 10,52%; M03 aguarda registros reais com data própria. |
| A12 | Atendido | Relações de usos e pavimentos, implantações, endereço, referência de praia e seis blocos de conforto conferidos. |
| A13 | Atendido nos percursos locais | Foco contido, Escape, retorno de foco, controles de zoom, barra recolhida; sem overflow de 320 a 1440 px e com texto do corpo ampliado a 200%. Leitor de tela e aparelho físico não verificados; não é certificação de acessibilidade. |
| A14 | Atendido | Nove posições identificadas (M04A/M04B); sem arquivo quebrado, imagem fictícia ou play de material ausente. M05 é consultável por expansão. |
| A15 | Atendido | Build público local nas cinco páginas sem marcadores internos; alternativas presentes; opcionais recolhidos. |
| A16 | Atendido nos consumidores alterados | Flow abre com identidade própria, seletor e WhatsApp preservados; formulário compartilhado conferido com falha/sucesso controlados. Não foi feita auditoria integral de todas as páginas do Flow. |
| A17 | Atendido | Pré-registro e avisos mantidos; privacidade e boletim retornam 200; nenhuma condição comercial adicionada. |

### Capturas para a revisão da fase 4

As capturas foram feitas com Chromium local, preferências de movimento reduzido e cookies necessários. As imagens de seção ocultam temporariamente as barras fixas durante a captura para não encobrir o conteúdo; isso não altera o site. A captura de abertura mostra a composição da página.

| Seção | Computador | Celular |
| --- | --- | --- |
| Abertura | [1440 px](docs/alma/capturas/computador-abertura.png) | [390 px](docs/alma/capturas/celular-abertura.png) |
| Plantas | [1440 px](docs/alma/capturas/computador-plantas.png) | [390 px](docs/alma/capturas/celular-plantas.png) |
| Lazer | [1440 px](docs/alma/capturas/computador-lazer.png) | [390 px](docs/alma/capturas/celular-lazer.png) |

## Materiais aguardados e substituição

Todos continuam aguardando produção/aprovação; a ausência não bloqueia a página.

| Espaço | Posição/formato | Alternativa pública |
| --- | --- | --- |
| M01 — Família no living | Interiores · 16:9 | Living oficial existente. |
| M02 — Fábio apresenta o Alma | Bossa · 16:9 | Texto institucional; vídeo recolhido. |
| M03 — Fotos/vídeo da obra com mês/ano | Obra · 16:9 | Resumo e link ao boletim de agosto/2026. |
| M04A — Jazz entregue | Bossa · 4:3 | Cartão com entrega em setembro/2019. |
| M04B — Soul entregue | Bossa · 4:3 | Cartão com entrega em dezembro/2023. |
| M05 — Plantas de 103 e 114 m² | Após comparação · 16:9 | Plantas e comparação textual; vídeo recolhido. |
| M06 — Pavimento, acessos e duas unidades | Posição · 4:3 | Fachada e explicação textual. |
| M07 — Apoio na volta da praia | Conforto · 4:3 | Texto dos recursos confirmados. |
| M08 — Uma manhã em família no Perequê | Localização · 16:9 | Trajeto real existente; complemento recolhido. |

O cadastro `midiasAprovadasAlma` em `src/content/alma.ts` centraliza futuras substituições. Só cadastrar arquivos existentes e aprovados, com texto alternativo/legenda; vídeos possuem campos de pôster, legendas e transcrição. Para M03, preencher a data real na legenda, sem alterar a medição. M01 permite substituir sua imagem mantendo o living como alternativa. Não há referência de arquivo inexistente.

## Pendências e limites que permanecem

- P01–P12 da fase 1 permanecem abertas; utilizados os tratamentos provisórios da fase 2. Destaques individuais dos duplex, plantas cotadas, render por tipologia, medição recente, documentação, estimativa de condomínio e condições comerciais dependem das fontes ali indicadas.
- **Não verificado:** gravação em Supabase/CRM real, recebimento pelo atendimento, envio de WhatsApp, entrega real de arquivo, agendamento, compartilhamento pelo sistema operacional, tela de leitor de tela e aparelho físico. O site prepara a mensagem e solicita apresentação, sem confirmar envio ou horário.
- A disponibilidade das credenciais de gravação no ambiente Preview não foi presumida nem alterada. A interface mostra falha recuperável quando o contrato não confirma gravação. A chave descrita no projeto como exclusiva de Production pode não estar disponível em Preview.
- Vídeos existentes de ambiente/trajeto preservados; não foi feita transcrição ou revisão de eventual áudio do trajeto. Novos vídeos narrados dependem de legendas e transcrição aprovadas antes de cadastro.
- Revisão visual/editorial de Fábio e validação com tecnologias assistivas continuam na fase 4. A entrega não equivale a autorização de publicação.

## Arquivos alterados

Todos sob `site/`:

- `src/components/alma/AlmaLanding.tsx`: entrada server-side e distinção entre prévia e versão pública.
- `src/components/alma/AlmaPagina.tsx`: dez seções, estado compartilhado, contato e barra móvel.
- `src/components/alma/Experiencia.tsx`: seletor, comparação, visor, compartilhamento, exposições e espaços de mídia.
- `src/components/alma/Clientes.tsx`: animação, referências e controles de vistas.
- `src/content/alma.ts`: redação aprovada, perguntas, mensagens, metadados e cadastro de mídias.
- `src/styles/alma.css`: composição, estados e responsividade do Alma.
- `src/components/FormLead.tsx`: confirmação efetiva, falhas, validação e variante de interesse geral do Alma.
- `src/components/WhatsApp.tsx`: experiência fixa independente do Alma; preserva o Flow.
- `src/lib/telefone.ts` e `src/lib/banco.ts`: normalização única com preservação de DDI.
- `src/app/api/leads/route.ts`: mensagens de validação coerentes com a especificação.
- `src/app/empreendimentos/[slug]/page.tsx` e `src/app/empreendimentos/[slug]/plantas/[planta]/page.tsx`: metadados do Alma e miniaturas corretas.
- `scripts/verificar-alma.cjs` e `scripts/verificar-api-alma.cjs`: verificações locais reproduzíveis.
- `docs/alma/capturas/`: seis PNGs e evidências JSON.
- `Alma_Fase3_Relatorio_Implementacao.md`: este relatório.
