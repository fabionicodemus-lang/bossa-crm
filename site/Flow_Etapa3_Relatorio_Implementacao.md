# Flow Aptos — Etapa 3: implementação para revisão

**Data:** 22/10/2026, referência de Brasília. **Branch:** `feat/flow-posicionamento-2026`. **Site:** `site/`, projeto Vercel `bossa-site` / Elos OS.

**Resultado:** página funcional implementada com o acervo existente, testes seguros e prévia protegida para revisão. Não é autorização de publicação.

**Prévia:** A_GERAR.
**Commit da implementação:** COMMIT_FLOW.
**PR em rascunho:** A_REGISTRAR.
**Capturas:** [índice](docs/flow/etapa3/Capturas.md).

## 1. Base e proteção dos trabalhos paralelos

Lida integralmente a [especificação aprovada da Etapa 2](docs/flow/fontes/Bossa_Flow_Etapa2_Especificacao_2026-10-22.md), `site/CLAUDE.md`, README do site e instruções aplicáveis. Nenhum AGENTS.md aplicável foi encontrado. A aprovação e o pedido atual autorizam a implementação, sem nova rodada editorial.

A busca do GitHub encontrou `main` em `f0c0dbb` (“Site: nova apresentação do Alma Sea Houses”). Seu conteúdo foi comparado com `feat/alma-fase3-previa` em `fa31d4d`: árvores idênticas. A nova branch do Flow parte dessa main atualizada, em worktree separado `/workspace/flow-trabalho`. O checkout anterior e a branch do Alma não foram editados. Nenhum merge foi realizado nesta rodada.

Todas as alterações desta implementação estão em `site/`. Preservados CRM, Nara, banco/migrações, Elos OS, Wix, domínio, DNS, configurações de produção e proteção Vercel. Nenhuma chave foi exposta ou alterada. O projeto já possuía um deployment de produção de trabalhos anteriores; esta implementação não o substitui.

## 2. Página entregue

Implementadas as doze seções, na ordem da especificação:

1. Abertura com “Seu apartamento é só o começo.”, marca e assinatura oficial “No ritmo da nossa vida.”; vídeo/pôster existentes, pausa e redução de movimento.
2. Plantas imediatamente após a abertura: cinco opções visíveis, áreas e suítes corretas, orientação aprovada, seleção por teclado, contato contextual, ampliação e link compartilhável.
3. Proposta de valor dos dois pavimentos, distinguindo área comum de área privativa.
4. Flow Move compacto, com galeria e planta ilustrativa do 5º pavimento ampliável.
5. The Roof unificado, com piscina, gourmet/conjunto, salão, pub, brinquedoteca e planta ilustrativa do 24º ampliável.
6. Vistas em três direções e doze alturas, preservando 36 imagens reais, proporção panorâmica sem crop e ampliação. WhatsApp recebe direção/andar como referência de drone, sem associação automática a unidade ou disponibilidade.
7. Duplex separados em 93 e 117,7 m², três suítes, com 4,90 m vinculado à configuração aprovada do Tipo 1. Vídeo identificado como unidade 1601, sem disponibilidade presumida.
8. Engenharia em quatro cartões com benefício e referência, sem garantias absolutas nem imagens de obra simuladas.
9. Obra, histórico Jazz/Soul e clientes: **57,87% exclusivamente em setembro/2026, edição 25**, prazo previsto novembro/2027. Vídeo do Fábio e depoimentos preservados.
10. Localização: aproximadamente 800 metros como distância divulgada, percurso depende do acesso; mapa é busca de endereço, sem rota pedonal ou minutos inventados.
11. Contato priorizando visita, confirmação posterior pela equipe e pedido de apresentação terciário; um formulário exibido por vez, com dados preservados ao alternar as plantas e ao fechar/reabrir a opção de formulário.
12. Seis FAQs específicas e notas legais.

Navegação interna Plantas/Lazer/Vistas/Construção/Agendar visita; barra móvel própria. Ela se recolhe na abertura, com menu/modal, ao focar campos e no contato final. O widget genérico é dispensado somente para Flow (e mantém a exceção anterior do Alma), evitando duplicidade e o SLA “resposta em minutos” nesta landing.

Preservados logotipo, grafite/sálvia/névoa/bronze, Saira e Michroma, renders e vídeos oficiais. Nenhuma arquitetura ou registro de obra foi gerado.

### Divergências reconciliadas

- O aviso antigo de `CLAUDE.md` menciona 114,7 m² na imagem do Duplex Tipo 1. **O arquivo atual foi aberto e já contém 117,7 m²**, coerente com os dados aprovados. Não foi acrescentada uma falsa advertência de erro, nem alterada a imagem. `CLAUDE.md` foi preservado; a divergência fica documentada aqui.
- `flow-apto-tipo-slide.jpg` foi inspecionado e contém o rótulo “APTOS TIPO”, mas não comprova qual composição corresponde a 62 ou 73 m². Não foi associado ao seletor. `apto-living.jpg` não é apresentado como apartamento tipo. As plantas suprem essa posição sem deixar um quadro vazio.
- A alegação de torre inteiramente fechada foi corrigida também no resumo e no texto digital do boletim do Flow: alvenaria 94,55% e esquadrias 18% no boletim de setembro. Percentuais e data não foram recalculados. Não se alterou documento original de engenharia; a edição do site passa a descrever as etapas de forma consistente.
- O OG passou a usar render horizontal existente com **dimensões reais 2400 × 1412**, sem novo render ou crop inventado. Dimensões opcionais foram adicionadas ao helper SEO; os padrões dos demais empreendimentos permanecem iguais.

## 3. Conversões e contrato real

### Leads e visita

A correção de HTTP 2xx + `ok === true` + `gravado === true` já veio do Alma e foi preservada. Resposta incompleta, `gravado:false`, HTTP 500 ou falha de rede não produzem sucesso nem `lead_submit`. Dados ficam preenchidos e há WhatsApp alternativo.

A RPC versionada `site_registrar_lead` recebe organização, nome, telefone, formulário, empreendimento, finalidade/CRECI, visitante e UTM; **não recebe data**. Foi lida no repositório, sem consulta ao banco real. Por isso, a página não solicita uma data que não seria persistida. O pedido de visita registra contato geral e a equipe combina data, horário e acesso. A tipologia escolhida segue na mensagem de WhatsApp; não é escondida em UTM/data nem prometida como campo gravado no lead.

Telefone com DDI explícito permanece internacional. Campos e consentimento usam a validação já existente. Formulários distintos ficam preservados no DOM, com somente um visível de cada vez; não há dois envios em paralelo por desenho de interface.

### Pedido de apresentação / eventos

`solicitacao` é uma opção explícita do FormLead usada pelo novo Flow, com padrão falso para preservar os demais consumidores. Após gravação confirmada do pedido de book, emite `request_material`, nunca `download_material`. Texto de sucesso: “Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar o material.” Não se presumiu ausência de automação no CRM; somente não se prometeu uma entrega que esta interface não verifica.

O novo nome foi incluído na lista permitida do site. A API de eventos importa essa lista; a definição SQL versionada armazena `name text` sem restrição por nome. **Nenhuma migração ou alteração de RPC/banco foi feita.** O transporte do evento até RPC foi testado localmente com servidor fictício. Seu processamento no banco real não foi verificado. O painel atual que mede `download_material` não contará esse pedido como download; adaptar relatórios comerciais no CRM está fora deste pacote.

No Flow, solicitação de visita não emite `request_visit`/Meta Schedule como agendamento confirmado. Não há `view_price` em formulário sem preço. `view_floorplan` exige exposição real por um segundo, não simples montagem; a seleção não gera `page_view` artificial. UTMs reais, consentimento e referência do atendimento são preservados.

## 4. Testes e evidências

| Verificação | Resultado e método | Evidência |
| --- | --- | --- |
| Instalação | `npm ci` em `site/`, concluído; package/lockfile não alterados | [logs](docs/flow/etapa3/build-e-tipos.txt) |
| Tipos e build | `npm run typecheck` e `npm run build` aprovados | [logs](docs/flow/etapa3/build-e-tipos.txt) |
| Cinco plantas | Seleção, título, imagem, área, suítes, URL e WhatsApp coerentes; campos/rolagem preservados; rotas diretas, recarga e voltar | [matriz](docs/flow/etapa3/verificacao.json) |
| Mobile e desktop | 60 conferências: 12 seções × larguras 1440/360/390/768/1024; desktop 1440 × 900, demais com altura 844 CSS px; sem overflow horizontal | [matriz](docs/flow/etapa3/verificacao.json) |
| Vistas | Três direções × doze alturas: 36 verificações, proporção contain e contato contextual | [matriz](docs/flow/etapa3/verificacao.json) |
| Plantas dos pavimentos | Abertura de ambos os visores e fechamento por Escape | [matriz](docs/flow/etapa3/verificacao.json) |
| Compartilhamento | Clipboard real local, link da planta correta. Compartilhamento nativo não validado em aparelho | [matriz](docs/flow/etapa3/verificacao.json) |
| Formulário UI | Cinco falhas controladas e dois sucessos simulados (visita/book); sem falso sucesso ou download/agendamento emitido | [matriz](docs/flow/etapa3/verificacao.json) |
| Validação de campos | Nome obrigatório, erro associado, foco no nome e nenhum envio de formulário vazio | [evidência](docs/flow/etapa3/metadados-e-validacao.json) |
| API → RPC | HTTP real contra RPC local fictícia: visita/book, DDI +351/+49/+1/nacional, UTMs, validação 422, erro 500 e request_material | [evidência](docs/flow/etapa3/api-controlada.json) |
| Barra móvel | Nove estados: abertura, fora dela, menu aberto/fechado, planta trocada, modal aberto/fechado, contato e campo focado | [complementos](docs/flow/etapa3/complementos.json) |
| Zoom e teclado | Controles, foco contido, Escape e retorno ao acionador; pinça com dois contatos CDP emulada atingiu 217% | [complementos](docs/flow/etapa3/complementos.json) |
| Texto 200% | Quatro estados, 390 × 844: plantas, menu, formulário e modal. Duplicação efetiva de font-size/line-height calculados, H1 38→76 px, DPR 1 inalterado. Sem transform, screenshot ampliada ou zoom nativo | [complementos](docs/flow/etapa3/complementos.json) |
| Acessibilidade automática | Axe WCAG 2 A/AA e 2.1 AA, página desktop, visor e estados de sucesso: zero violações detectadas; contraste insuficiente identificado e corrigido dentro da paleta | [matriz](docs/flow/etapa3/verificacao.json) |
| Vídeos | Unidade 1601, obra, Augusto e Natália reproduziram H.264 no Chromium; dimensões 540 × 960 e avanço do tempo observados; sem escuta integral | [complementos](docs/flow/etapa3/complementos.json) |
| Movimento e carga | Redução de movimento respeitada; pausa manual persiste após sair/voltar à abertura; só MP4 da abertura requisitado na chegada | [complementos](docs/flow/etapa3/complementos.json) |
| SEO | Seis rotas HTTP 200, title/OG/canonical corretos, noindex preservado e OG com dimensão real; sem Offer/preço/estoque | [evidência](docs/flow/etapa3/metadados-e-validacao.json) |
| Regressões | Dados completos de Alma/Soul/Jazz idênticos à main por comparação automatizada; Alma preserva seleção/título/formulário, Soul/Jazz respondem 200 | [matriz](docs/flow/etapa3/verificacao.json) |

[Ajustes finais verificados no navegador](docs/flow/etapa3/ajustes-finais.json): limpeza do retorno de compartilhamento ao trocar planta por teclado e pinça seguida de movimento com um dedo. Build e tipos finais aprovados.

Testes no Chromium 154 local. Não foram utilizados aparelho físico, Safari/iOS, teclado virtual real, leitor de tela ou zoom nativo. A pinça foi executada por emulação CDP. Axe não constitui certificação integral; itens de revisão manual ficam registrados no JSON, inclusive fundos de imagem e legendagem dos vídeos. Capturas mantêm barras e controles reais visíveis.

Desempenho observado em uma janela inicial local de 2,3 s, 390 × 844, sem throttling de rede/CPU, cache de navegador vazio e servidor aquecido: **LCP 296 ms, CLS 0,004 e aproximadamente 1,83 MB transferidos**; três das 26 imagens carregadas e somente o vídeo de abertura requisitado. Não é comparação antes/depois, pontuação Lighthouse, medição de campo ou promessa de performance em produção. Sem salto persistente de layout reproduzido.

O script `npm run lint` continua apontando ao legado `next lint`, indisponível nesta versão do Next. Não foi apresentado como comando aprovado. Houve TypeScript, build, `git diff --check`, revisão React e testes de navegador específicos, sem alterar a configuração geral do projeto.

## 5. Materiais pendentes e inserção

| Prioridade | Material a fornecer / validar | Onde entra / destino | Alternativa atual |
| --- | --- | --- | --- |
| P0 | Originais de Tipo 1 (73), Tipo 2 e Tipo 3 (62), idealmente PDF vetorial ou 2000–3000 px no lado maior | Seletor `#opcoes-flow` / visor: substituir respectivamente `site/public/img/flow-planta-tipo1.jpg`, `flow-planta-tipo2.jpg`, `flow-planta-tipo3.jpg`, mantendo geometria e correspondência | Arquivos atuais: 880×528, 423×539 e 429×539. Zoom disponível, sem alegar detalhe inexistente |
| P0 | Exports oficiais individuais dos pisos dos duplex, se existirem | `PlantasFlow.tsx`, junto à prancha da tipologia; arquivos futuros podem ficar em `site/public/img/flow/plantas/` com identificação validada de tipo/piso | Duas pranchas oficiais completas 2199×1237, sem recorte ou planta de piso inventada |
| P0 | Correspondência dos renders de 62 e 73 m² e original limpo de `flow-apto-tipo-slide.jpg` | Apoio visual da seção `#plantas`, após validação; o seletor só recebe imagem associada se comprovada | Plantas existentes; sem render genérico que confunda tipo e duplex |
| P1 | 3–6 fotos reais de engenharia/qualidade, datadas, identificadas e com etapa validada | Cartões de `#engenharia`, `engenhariaFlow` e componente `FotoFlow`; destino proposto `site/public/img/flow/engenharia/` | Características e referências escritas, sem prova fotográfica fictícia |
| P1 | Quadro técnico de final/unidade/planta/orientação | Futuro vínculo no componente `VistaAndares.tsx`; guardar documento aprovado no acervo de engenharia | Direção/altura como referência de drone, sem vínculo com apartamento |
| P1 acessibilidade | Transcrições fiéis e WebVTT revisado dos vídeos de Fábio/obra, unidade 1601, Augusto e Natália; confirmar data dos registros de obra | Registro `acessibilidadeVideosFlow` em `src/content/flow.ts`: chaves `obra-flow`, `unidade-1601`, `depoimento-augusto`, `depoimento-natalia`; VTT sugerido `site/public/video/flow/legendas/{arquivo}.vtt`. Componente já suporta track e transcrição expansível somente quando recebidos | Vídeos e legendas incorporadas existentes preservados. Quadros inspecionados de Augusto/Natália mostram legendas; fidelidade/cobertura integral não conferidas. Nenhuma transcrição inventada |
| P2 | Vídeo recente da obra de 20–40 s, se já existir, com data real | Bloco `#construcao`, substituindo mídia de obra após validação, em `site/public/video/flow/` e pôster correspondente | Vídeo existente de Fábio identificado como registro da obra, sem vinculá-lo à medição atual |

Nenhum desses materiais impede a revisão funcional da prévia. Alta resolução e transcrição/legendagem revisada devem ser tratadas antes de encerrar a revisão de legibilidade e acessibilidade para publicação. Não encomendar novos renders de lazer, drones ou vídeo principal por causa desta implementação.

## 6. Critérios de aceite e limites

| Critério da Etapa 2 | Situação |
| --- | --- |
| 1: abertura, assinatura e acesso às plantas | Atendido e verificado localmente |
| 2: antecipação, cinco opções e correspondência de dados | Atendido; fontes em alta e associação de render específico pendentes |
| 3: plantas do Move/Roof e narrativa unificada | Atendido e verificado |
| 4: vistas sem crop e contato contextual | Atendido; 36 combinações verificadas |
| 5: obra datada e engenharia sem absolutos | Atendido; fotos novas opcionais aguardam fonte |
| 6: distância anunciada transparente | Atendido; sem rota/minutos novos |
| 7: sucesso verdadeiro, book honesto, visita sem data perdida | Atendido com simulações; integração real não verificada |
| 8: instrumentação coerente e regressões | Atendido no site e RPC fictícia; painéis/fornecedores reais não testados |
| 9: rotas, SEO e proteção | Atendido localmente; prévia remota registrada na entrega |
| 10: instalação, tipos e build | Atendido; lint legado reportado separadamente |
| 11: cinco larguras, teclado e leitura | Atendido em emulação; teclado virtual/aparelho físico e transcrição integral pendentes |
| 12: branch isolada e prévia sem merge/publicação | Atendido na entrega; somente preview autorizado |

Não foram consultados leads reais nem testados atendimento, envio de WhatsApp, entrega externa do book ou disponibilidade de agenda. Configuração privada real e efeitos nos fornecedores analíticos não foram validados por envio. Não afirmar que a automação comercial entrega ou deixa de entregar o book.

A API e suas credenciais permanecem iguais; previews podem responder `gravado:false` por ausência de configuração. A interface lida com isso como falha recuperável, nunca interesse registrado. Um teste real de atendimento exige autorização específica e acompanhamento da equipe antes de qualquer publicação futura.

## 7. Arquivos e revisão

[Manifesto de arquivos desta implementação](docs/flow/etapa3/Arquivos_Alterados.txt), comparado com `origin/main` em `f0c0dbb`. Somente site; sem dependências novas de runtime, alterações em package/lockfile, robots, indexação, variáveis remotas, Vercel config ou proteção. Playwright, axe e Prettier foram ferramentas temporárias de QA fora do package do site.

Componentes Flow novos: `FlowPagina`, `PlantasFlow` e `Experiencia`; wrapper `FlowLanding`, clientes e vistas evoluídos. Conteúdo Flow isolado em `content/flow.ts`; corrigidos apenas dados Flow nos arquivos compartilhados. FormLead tem opção explícita de solicitação, WhatsApp dispensa widget duplicado no Flow, eventos recebem `request_material`, helper SEO aceita dimensões opcionais e as duas rotas passam a usar metadados Flow consistentes.

Para reproduzir: `npm ci`, `npm run typecheck`, `npm run build`, `npm run start -- -p 3220`, seguidos pelos scripts `verificar-flow-etapa3.cjs`, `verificar-flow-complementos.cjs` e `verificar-api-flow.cjs`, com Playwright/Chromium/axe disponíveis. Todos usam localhost e respostas controladas. O script da API inicia outro servidor local com credenciais fictícias e RPC local. Nunca trocar a base para atendimento real para fazer esses testes.

**Publicação nesta rodada:** exclusivamente branch/PR de revisão e prévia protegida. Não houve merge na main, promoção, deploy de produção, alteração de domínio/DNS/Wix, CRM, banco, Nara, Elos OS ou mensagens comerciais. Próximos passos: revisão da prévia, materiais pendentes, conferência em aparelho real e aprovação específica de qualquer futura publicação.
