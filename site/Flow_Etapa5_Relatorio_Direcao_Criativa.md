# Flow Aptos — implementação da direção criativa e revisão

22/10/2026 · Bossa Site 2.0 · Somente `site/`.

## Entrega e referências

- **Prévia protegida:** https://bossa-site-65ahog42d-elos-os.vercel.app/empreendimentos/flow-aptos
- **PR #130, mantido em rascunho:** https://github.com/fabionicodemus-lang/bossa-crm/pull/130
- **Branch:** `feat/flow-posicionamento-2026`.
- **Commit do código publicado somente em Preview:** `1565484788ab1c0107af1c0e6f7ba8aecd17a052`.
- **Deployment:** `dpl_DRMhxqnvpUvciMPKcrW3L9T71uRA`, READY, Preview (`target: null`), projeto `bossa-site`, time Elos OS. Proteção Vercel Authentication existente preservada; HTML remoto com `noindex, nofollow`.
- [Capturas nas cinco larguras e JSON dos testes](docs/flow/etapa5/Capturas_Indice.md).
- [Direção criativa integral, com link da Page de origem](docs/flow/fontes/Flow_Direcao_Criativa_Etapa5.md), [auditoria integral da Etapa 4](docs/flow/fontes/Bossa_Flow_Etapa4_Auditoria.md), [especificação da Etapa 2](docs/flow/fontes/Bossa_Flow_Etapa2_Especificacao_2026-10-22.md). As três foram lidas integralmente. O ZIP da auditoria foi conferido como pacote de evidências; suas capturas não são apresentadas como capturas novas.

A solicitação atual de Fábio autoriza implementar a direção criativa. As observações de que os documentos eram planejamento ou não autorizavam código foram tratadas como contexto dos documentos anteriores. Não autorizam merge ou produção. Esta entrega não atribui nota editorial à própria implementação; a aprovação depende de nova auditoria independente.

## Alterações e decisões de composição

| Capítulo | Implementação e decisão |
|---|---|
| Abertura | H1 “Seu apartamento é só o começo.”, assinatura, marca, paleta Saira/Michroma preservadas. Copy e duas ações da direção criativa: explorar plantas e agendar visita. Gradiente com contraste sobre o vídeo oficial e pausa manual preservada. Economia de dados ou movimento reduzido mantêm o poster até interação. |
| Navegação | Faixa discreta no computador com indicação da seção; no celular/tablet, botão “Explorar o Flow” com lista expansível, Escape e foco na âncora. Mantido o menu institucional. Barra Plantas/Agendar visita contextual, recolhida em menus, modais, campos e contato; sem barra sobre o consentimento. |
| Apartamentos | Escolhas agrupadas em “Apartamentos tipo” e “Duplex”, com chips menores e desenho grande. Mantidos dados, pranchas, ampliação e compartilhamento. Orientação solar vem da fonte atual. Seleção não remonta a landing nem apaga o formulário. Default Tipo 2 não declara preferência no contato geral. |
| Duplex | Capítulo imediatamente após plantas, com o texto aprovado e acesso às duas pranchas. No celular, uma ficha de duplex por vez. Render apresentado como acervo geral do duplex, separado das fichas: não há comprovação documental suficiente para atribuir cada render a 93/117,7 m². Living de 4,90 m permanece somente na ficha do Tipo 1. Vídeo 1601 compacto e identificado, sem estoque presumido. |
| Ficha factual | Faixa após apartamentos/duplex informa Balneário Perequê, aproximadamente 800 m conforme divulgação e previsão novembro/2027, com acesso direto à localização. Não há tempo caminhável ou rota medidos por suposição. |
| The Roof | Piscina oficial como imagem principal de largura ampla; salão, pub, brinquedoteca e vista geral em apoio. Vista geral não é identificada como foto específica do gourmet. Planta do 24º em expansão e visor, sem dominar a rolagem inicial. |
| Flow Move | Um ambiente principal grande com cinco escolhas legíveis e benefícios curtos. Lavanderia permanece no texto e na planta. Planta do 5º recolhível/ampliável. Mantidos todos os ambientes e o limite sobre operação de conveniências. |
| Vistas | Pavimento numérico preservado ao mudar direção. Se ausente, seleção da foto real mais próxima, com desempate pela menor altura e aviso visível/`role=status`. Rooftop corresponde a 24º. Comparação mostra dois quadros reais da mesma direção, com alturas explícitas. Todas as 36 associações arquivo/altura foram preservadas. |
| Engenharia | Texto aprovado mais direto e cartões factuais, sem bastidores da Etapa 2. Links ao boletim para impermeabilização/esquadrias e convite a conhecer o detalhamento nos outros temas. Não foram fabricadas fotos de execução, certificados ou memorial. |
| Obra e confiança | Novo título sobre avanço, 57,87% exclusivamente setembro/2026, boletim 25 e etapas datadas. Registro de obra separado da medição, sem atribuir mês de captura desconhecido. Jazz/Soul com fotografias reais do acervo e datas de entrega. Depoimentos em cartões compactos. |
| Vídeos | Abertura oficial preservada. Quatro vídeos verticais abrem em diálogo sob ação do visitante, com fechamento e retorno de foco. Durações medidas por `ffprobe`: 1601 1:49; obra 1:22; Augusto 1:30; Natália 0:58. Arquivos, áudio e falas não foram editados. |
| Localização | Endereço e copy aprovados, aproximadamente 800 m antes da imagem, imagem aérea existente, link para busca do endereço no Google Maps. Sem prometer percurso ou vista de unidade. |
| Contato | Uma ação principal de pedido de visita. WhatsApp secundário; apresentação em link terciário. Alternância preserva os campos. Sucessos usam os textos aprovados e continuam pedidos, sem agenda confirmada ou entrega automática. WhatsApp geral também recebe altura/direção quando selecionadas explicitamente; cada planta mantém seu próprio contexto. |
| FAQ/SEO | Sete perguntas e respostas da direção criativa, coincidentes com FAQPage. Datas absolutas. BreadcrumbList restaurado. Troca cliente sincroniza title, description, canonical, OG e Twitter com a mesma fonte das rotas, sem page_view adicional. |

A escala maior evidenciou imagens subdimensionadas no tablet: ajustado `sizes` às larguras reais de exibição, mantendo os arquivos oficiais. A nota clara do formulário recebeu grafite para atender contraste. Cookies no desktop Flow ficam à direita para preservar os dois botões da abertura à esquerda; nenhuma alteração no componente global de consentimento.

## Commits pequenos e verificações por etapa

| Commit | Escopo | Evidência |
|---|---|---|
| `0dfa4c3` | Apartamentos/lazer/navegação móvel; arquivo da direção criativa | TypeScript e `git diff --check` sem erro |
| `30c8df1` | Engenharia, confiança, FAQ e composição de conversão | TypeScript e `git diff --check` sem erro |
| `ffe0b3e` | Alturas/contexto/metadados, vídeos e testes; auditoria arquivada | TypeScript e build; matriz de navegador executada na sequência |
| `1565484` | Nitidez, entregues, primeiro acesso e CTA duplex | TypeScript/build finais e scripts abaixo |

O commit posterior de documentação/testes adiciona este relatório, as capturas e evidências; não altera o código servido pela prévia identificada acima. Os ajustes do script medem os retângulos dos botões reais do hero, em vez da área vazia de toda a linha de ações.

## Matriz de testes funcionais e regressões

Estados: **verificado diretamente** = navegador/arquivo/HTTP realmente exercitado; **testado com simulação** = resposta ou recurso controlado; **não verificado** = limite explícito. A classificação não significa homologação do atendimento real.

| Percurso | Estado | Evidência objetiva |
|---|---|---|
| Build/tipos | Verificado diretamente | `npm run build`, TypeScript do Next e `npx tsc --noEmit`; [build](docs/flow/etapa5/build.txt). Sem novos pacotes ou alteração do lockfile. O comando legado `next lint` do projeto não é compatível com Next 16; não foi declarado como aprovado. |
| Cinco tipologias | Verificado diretamente | Seleção, URL, título, canonical/OG, painel, suíte e contato; cinco entradas diretas e recargas; histórico, teclado e preservação de campos. [verificacao.json](docs/flow/etapa5/verificacao.json). |
| Exposição/eventos | Verificado diretamente com transporte interceptado | Nenhuma planta vista no mount fora da tela; um segundo visível exigido. Trocas não duplicam page_view. Pausa de exposição com menu/modal. Eventos coletados na matriz, sem gravação no banco real. |
| Responsividade | Verificado diretamente | 12 seções/estados × 5 larguras = 60 verificações sem overflow geral. Viewports CSS efetivos 360×844, 390×844, 768×844, 1024×844, 1440×900. Capturas reais novas com barras conforme estado. |
| Lazer | Verificado diretamente | Piscina principal mede 328/358/736/928/1320 px; Move principal 328/358/736/586,7/848 px, nas respectivas larguras. Plantas de 5º/24º abrem com títulos corretos, Escape fecha. |
| Vistas | Verificado diretamente | 36 estados, fonte real `contain`, CTA contextual; 13º comum preservado nas três direções, 20º/mar→19º/morros com aviso, 24º/Rooftop preservado. Comparação 13º/19º usa `b-07`/`b-03`. Teclado do slider e contato final 15º/morros conferidos. [direcao.json](docs/flow/etapa5/direcao.json). |
| Ampliação e foco | Verificado diretamente | Botões, Tab/Shift+Tab, Escape e retorno ao acionador; imagem inteira e pan. Pinça 217% exercitada com dois contatos emulados via CDP: não é pinça física. |
| Compartilhamento | Verificado diretamente / testado com simulação | Cópia real em clipboard local; compartilhamento nativo simulado em sucesso, cancelamento e falha com link manual. Nenhum conteúdo enviado a terceiros ou aparelho físico utilizado. |
| Barra móvel | Verificado diretamente | 11 estados: abertura, fora da abertura, menu institucional aberto/fechado, troca de planta, modal aberto/fechado, contato, foco, Explorar Flow aberto/fechado. [complementos.json](docs/flow/etapa5/complementos.json). |
| Texto ampliado | Verificado diretamente, mecanismo de teste declarado | Fonte e entrelinha computadas duplicadas no DOM: H1 38→76 px e links do menu Flow 14→28 px, viewport390/DPR1 intactos. Plantas, menu institucional, menu Explorar Flow, formulário e visor sem overflow; controles alcançáveis. Não foi zoom nativo do navegador. |
| Vídeos | Verificado diretamente, sem escuta integral | Quatro arquivos avançaram no Chromium, 540×960, sem erro; pausa manual do hero sobrevive à rolagem. Economia de dados simulada: poster pausado e zero MP4 requisitado. |
| Formulário UI | Testado com simulação | Cinco falhas: `gravado:false`, resposta incompleta, `ok:false`, HTTP500 e rede. Dados preservados, nenhum lead_submit. Dois sucessos apenas em HTTP2xx+ok=true+gravado=true; um request_material, zero download_material/request_visit/view_price indevidos. |
| API→persistência | Testado com simulação | Rota HTTP real local contra RPC fictícia, oito chamadas; +351/+49/+1/nacional e UTM preservados, 422 e falha500 exercitados. [api-controlada.json](docs/flow/etapa5/api-controlada.json). Nenhuma consulta ou escrita no banco real. |
| Acessibilidade automática | Verificado diretamente | Axe WCAG2A/AA/2.1AA: zero violações detectadas em página desktop, visor e sucessos simulados. Casos `incomplete` exigem revisão manual; não substitui leitor de tela ou certificação. |
| Alma/Soul/Jazz | Verificado diretamente | Dados comparados à main e iguais; Alma alternou 114 m² preservando formulário/título; Soul/Jazz HTTP200. Nenhum arquivo do Alma foi alterado nesta rodada. FormLead/API/leads permanecem idênticos à entrada `ca17fb8`. |
| Escopo/acervo | Verificado diretamente | Diferença desta rodada restrita a `site/`; nenhum arquivo em `public/` modificado. Checkout paralelo do Alma preservado. CRM, Nara, banco, Wix e configurações de produção sem alteração. |
| Prévia remota | Verificado diretamente por HTTP autenticado | READY/Preview; HTML200, H1/copy novos, noindex, WhatsApp correto `554792889395`. [conferencia-remota.json](docs/flow/etapa5/conferencia-remota.json). Não é navegação interativa remota. |
| Atendimento real | Não verificado | Não houve lead, WhatsApp, entrega de material, agenda ou teste real no CRM/Nara. Requer homologação operacional separada e autorizada antes do lançamento. |
| Aparelhos/assistência | Não verificado | Sem iPhone/Android físico, Safari/iOS, teclado virtual real, leitor de tela, compartilhamento nativo real ou escuta integral dos quatro vídeos. |

Reprodução: `node scripts/verificar-flow-etapa5.cjs`, `node scripts/verificar-flow-etapa5-direcao.cjs`, `node scripts/verificar-flow-etapa5-complementos.cjs`, `node scripts/verificar-flow-etapa5-api.cjs`, com build local em 3220; API fictícia usa 3210. O número público foi configurado localmente no build conforme `.env.example`/CLAUDE; nenhum segredo real foi necessário. Todos os scripts interceptam ou isolam os caminhos de persistência.

## Desempenho — alcance da evidência

Três navegações locais independentes em 390×844, Chromium, contextos novos, sem limitação de rede/CPU, janela de 2,3 s. LCP local de 260–340 ms, CLS observado 0.00331 e aproximadamente 1.84 MB transferidos nessa janela. Valores brutos em `direcao.json`. Sem Lighthouse, INP de campo, rede móvel real ou inferência de desempenho remoto. Os vídeos de apoio são inseridos sob ação; somente a abertura baixa MP4 inicialmente em movimento normal. Com economia de dados, nenhum MP4 inicial foi baixado. A nitidez foi preservada por `sizes` adequado, sem recompressão do acervo ou geração de imagem.

## Situação dos achados da Etapa 4

| Achado | Situação nesta entrega |
|---|---|
| P1-01 bastidores públicos | Corrigido: engenharia, clientes, formulário e FAQ sem referências a etapas internas. |
| P1-02 plantas em alta | Pendente de material. Aproveitamento do quadro melhorado; zoom não cria detalhe ausente no original. |
| P1-03 altura silenciosa | Corrigido e testado com pavimento comum/ausente. |
| P1-04 escala do lazer | Corrigido, medido e capturado nas cinco larguras. |
| P1-05 provas técnicas/data do vídeo | Parcial: copy, boletim e fontes úteis corrigidos; fotos técnicas e data de captura continuam pendentes. Filmagem não é datada por exportação ou pelo boletim. |
| P1-06 distância/dados de unidade | Distância antecipada e navegação corrigidas; vagas/mapa técnico seguem pendentes, sem inferência. |
| P1-07 legendas/transcrições | Pendente de conteúdo revisado; suporte existente mantido. Reprodução não comprova acessibilidade da fala. |
| P2-01 metadados cliente | Corrigido na mesma fonte das rotas, sem remontar a página. |
| P2-02 migalhas | BreadcrumbList restaurado. |
| P2-03 datas relativas | FAQ e copy com referência absoluta setembro/2026. |
| P2-04 duração/presença de vídeos | Durações medidas e cartões com player em diálogo. |
| P2-05 redundância de contato | Uma ação principal, WhatsApp secundário, book terciário. |
| P2-06 economia de dados | Implementado poster/opt-in para saveData; preferência simulada e ausência de download inicial confirmadas. |

## Materiais e confirmações ainda pendentes

| Prioridade | Material | Inserção preparada / alternativa atual |
|---|---|---|
| Alta — leitura | Tipo1/2/3 em PDF vetorial ou JPG/PNG limpo de2000–3000px | Substituir os mesmos `/img/flow-planta-tipo1.jpg`, `tipo2.jpg`, `tipo3.jpg`; painel e visor já consomem essas fontes. Mantidas as plantas oficiais menores. |
| Alta — desejo | Original limpo e identificação documental de living62/73m² | Capítulo dos apartamentos, junto do desenho; até receber, somente plantas e orientação verificadas. Não usamos `apto-living.jpg` como tipo sem comprovação. Recuperar original de `flow-apto-tipo-slide.jpg` sem tarja, se adequado. |
| Alta — prova | 3–6 fotografias reais de engenharia, contexto/detalhe, ≥2400px, data/pavimento/atividade/fonte | Cartões de engenharia; atualmente texto factual e boletim público. Não há quadro vazio, imagem de obra inventada ou render apresentado como execução. |
| Alta — acessibilidade | WebVTT e transcrição revisada de1601/obra/Augusto/Natália | Preencher `acessibilidadeVideosFlow` em `content/flow.ts`; players já suportam `track`/alternativa textual. Nenhuma fala presumida foi criada. |
| Alta — confiança | Data validada do vídeo da obra; eventual registro recente existente | Cartão “Fábio apresenta a obra do Flow”; enquanto pendente, registro real sem data atribuída. Percentual continua separado, setembro/2026. |
| Média — precisão | Associação documental dos renders às variantes duplex | Render geral do acervo separado das fichas. Confirmar antes de identificá-lo como variante específica. |
| Média — leitura | Duplex em pranchas oficiais separadas por piso, ≥2000px/PDF | Visor das duas tipologias. Mantidas pranchas completas; nenhum piso foi reconstruído ou recortado como desenho técnico independente. |
| Média — dados | Quadro final/tipo/unidade/orientação, vagas e condições atuais | Consulta com equipe. Vistas independentes de unidade/estoque, sem oferta inventada. |

Não são necessários novos renders de lazer, drone ou vídeo de abertura para avaliar esta composição. Não foram geradas imagens arquitetônicas.

## Arquivos e preservação do trabalho paralelo

Código desta rodada: `src/components/flow/{FlowPagina,PlantasFlow,VistaAndares,Clientes,Experiencia,GaleriaMove,NavegacaoFlow,VideoFlowModal}.tsx`, `src/content/flow.ts`, `src/styles/flow.css`.

Novos documentos: esta entrega, fontes da direção criativa e da auditoria em `docs/flow/fontes/`, índice/capturas/JSON/build em `docs/flow/etapa5/`. Testes novos: quatro scripts `verificar-flow-etapa5*.cjs`. [Inventário completo dos arquivos](docs/flow/etapa5/Arquivos_Alterados.txt) distingue a rodada atual do conjunto do PR contra a main.

Trabalho em worktree separado `/workspace/flow-trabalho`, a partir do HEAD atual `ca17fb8`, sem restauração para um commit antigo. Checkout original do Alma em `/workspace/bossa-crm` preservado. A comparação contra a main mantém as mudanças autorizadas da Etapa3 do Flow, inclusive o contrato de formulário já corrigido; esta rodada não reescreve esse contrato. Sem merge automático.

## Pontos objetivos para a próxima auditoria independente

1. Julgar hierarquia/desejo e composição de apartamentos, piscina e Move nas cinco larguras, sem nota autoatribuída desta implementação.
2. Conferir a primeira dobra em quadros claros/escuros do vídeo e no primeiro acesso com cookies; experimentar telas baixas.
3. Ler plantas no visor e decidir sobre os originais em alta; verificar vínculo do futuro living tipo e dos renders duplex antes de nomeá-los por área.
4. Exercitar pavimento comum13º, ausência20º/morros, Rooftop24º e comparação de alturas; confirmar que referências não prometem vista de unidade.
5. Testar teclado e leitor de tela nos menus, ancoragem, grupos de escolha, FAQ e diálogos; texto200% e Safari/iOS, pinça/teclado virtual/aparelho físico.
6. Rever as falas completas dos quatro vídeos, validar data da obra e fornecer legendas/transcrições fiéis.
7. Revalidar as respostas de erro/sucesso com as simulações documentadas; homologar separadamente atendimento, registro, deduplicação, retorno e envio de material reais, somente com autorização específica.
8. Conferir a nova prévia protegida e sua correspondência ao commit; validar noindex nesta fase e estratégia de indexação apenas na publicação autorizada.
9. Revisar desempenho na prévia com rede/CPU/cache declarados; não extrapolar os números locais para clientes reais.

## Publicação

**Não houve publicação em produção, merge na main, promoção de deployment ou alteração de domínio, DNS, proteção ou estado comercial.** A nova URL é exclusivamente Preview protegida. Nenhum contato ou mensagem comercial foi criado/enviado.

A entrega está disponível para a próxima auditoria. As pendências de mídia/acessibilidade e a homologação operacional permanecem identificadas; não são fatos preenchidos por estimativa nem uma aprovação automática para lançamento.
