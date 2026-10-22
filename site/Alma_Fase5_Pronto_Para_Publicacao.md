# Alma Sea Houses — Fase 5: candidata à publicação

**Data:** 22/10/2026 · **Branch:** `feat/alma-fase3-previa` · **Projeto:** `bossa-site` · **Pasta:** `site/`.

**Resultado:** candidata preparada para revisão final. Produção não autorizada nesta fase. A aprovação visual de Fábio e a validação real controlada do atendimento são portas de liberação da fase 6; os testes desta entrega não geraram contatos reais.

**Prévia protegida:** https://bossa-site-61udy6ira-elos-os.vercel.app/empreendimentos/alma-seahouses.
**Commit da candidata:** 223326ed426cab6f65dd094a3423427746e4fdec.
**Commit final de código/testes:** `223326ed426cab6f65dd094a3423427746e4fdec`. A atualização documental posterior apenas registra a URL e este encerramento; seu SHA consta no histórico Git e na entrega.
**PR em rascunho, sem merge:** https://github.com/fabionicodemus-lang/bossa-crm/pull/129
**Deploy:** `dpl_8yZJitAtrQpWXrLxPU1G2FePLUfj`, READY, Preview (`target: null`), SSO Vercel preservado. [Evidência remota](docs/alma/fase5/previa-verificacao.json): HTTP 200, `noindex, nofollow`, nove espaços identificados e boletim datado. Somente HTML verificado remotamente; interações/capturas foram locais.
**Capturas:** [índice visual](docs/alma/fase5/Capturas.md). Todas são capturas do Chromium local, com as barras reais visíveis.

## 1. Base, preservações e mudanças

Partida: `d252da5`, que documenta a implementação da fase 4 `72358385e84139aba7e844d95d3754e362f75d61`. Checkout limpo, sem restauração. Busca do GitHub confirmou a branch; `origin/main` é ancestral da implementação, sem commits exclusivos da main no início desta rodada. Nenhum merge realizado.

Lidos `CLAUDE.md`, README da raiz e do site e os relatórios das fases 3 e 4. Não há AGENTS.md aplicável. As fontes textuais aprovadas foram arquivadas, sem alteração de conteúdo, em [ficha da fase 1](docs/alma/fontes/Alma_Fase1_Ficha_e_Acervo.md) e [especificação da fase 2](docs/alma/fontes/Alma_Fase2_Especificacao_Pagina.md). O site usa exclusivamente o acervo versionado em `public/`; nenhum caminho temporário de imagem é usado.

Preservados a assinatura “Sua casa na praia. feita para sua alma.”, paleta, Literata/Urbanist/Ephesis, curvas, composição, textos e sequência das dez seções. Dados: 103 m²/Tipo 02 e 114 m²/Tipo 01, três suítes; 145 m²/Duplex Tipo 2 e 168 m²/Duplex Tipo 1, quatro suítes; duas vagas nas quatro opções. Dois apartamentos por andar. Pranchas completas e aviso dos duplex sem inventar limites ou pisos. Sem associação de interiores a uma tipologia específica. Pré-registro e avisos legais mantidos. **10,52% refere-se exclusivamente ao boletim de agosto de 2026.**

Correções comprovadas nesta fase:

1. **Contraste na localização:** axe identificou razões de 3,18:1 e 3,84:1 em textos pequenos sobre sálvia, e 4,30:1 no quadro interno M08. Aplicado o claro `#f3f0eb`, já existente na paleta, somente aos textos correspondentes dentro do Alma. Sem mudança de fundo, textos ou identidade. Nova auditoria confere os estados público e de prévia.
2. **Indexação de prévias:** anteriormente `BOSSA_PUBLICADO=sim` liberava os metadados e robots independentemente do ambiente. Nova fonte única `src/lib/publicacao.ts` impede indexação quando `VERCEL_ENV=preview`, mesmo se a liberação pública for herdada. Não houve alteração de variável remota ou proteção de acesso.
3. **Verificação reproduzível:** scripts permitem gravar evidência em pasta própria, preservando as fases anteriores; adicionadas auditoria da candidata e matriz de indexação. Dependências do site e arquivos de mídia permanecem iguais.

Fases anteriores incluídas na candidata: fase 3 reorganizou a página completa, comparação/visor/compartilhamento, contato contextual, formulário e alternativas de mídia; fase 4 sincronizou o título com a planta e ajustou a altura do formulário recolhido e o reflow com texto ampliado.

## 2. Auditoria e classificação dos requisitos

“APROVADO” descreve o escopo efetivamente verificado, sem equivaler à autorização de publicar. Estados de evidência: **verificado diretamente**, **testado com simulação**, **evidência anterior reaproveitada** ou **não verificado**.

| Requisito | Situação | Evidência e alcance |
| --- | --- | --- |
| T1: abertura, interiores, quatro plantas, comparação e visor | APROVADO | Navegação local, matriz das quatro rotas e capturas. Texto, URL, painel e WhatsApp coerentes; sem recarga/remontagem. |
| T1: dois por andar, vistas e limites | APROVADO | Conteúdo conferido com a ficha; imagens de drone continuam referências, sem garantia de vista da unidade. |
| T1: lazer e pavimentos | APROVADO | Organização por uso preservada; piscina/gourmet da piscina no lazer; salão/Jantar Jardim/Pub/brinquedoteca no rooftop. Duas implantações completas. |
| T1: localização e vídeo | APROVADO | Reprodução H.264 no Chromium, quadros e endereço existentes; edição do trajeto não é tratada como tempo de caminhada. |
| T1: conforto, Bossa, entregas e obra histórica | APROVADO | Conferência factual e visual; Jazz setembro/2019, Soul dezembro/2023; boletim agosto/2026. |
| T1: 13 FAQs e contato | APROVADO | Conteúdo aprovado preservado, expansões e canais acessíveis. |
| T2: acesso, seleção e WhatsApp | APROVADO | Links inspecionados e eventos interceptados; mensagem geral antes de escolha explícita; contexto correto nas quatro opções. Nenhuma mensagem enviada. |
| T2: formulário e API, respostas controladas | APROVADO | Testado com simulação: seis respostas de UI e RPC HTTP local. Sem falso sucesso e sem leads reais. |
| T2: atendimento real e configuração privada operacional | BLOQUEADOR PARA PUBLICAÇÃO | Não verificado nesta fase por restrição expressa a leads reais. Exige autorização e teste controlado na fase 6, antes de liberar o lançamento. Não exige alteração de banco/Nara. |
| T3: teclado, modal, foco, erros e redução de movimento | APROVADO | Testes diretos locais; Tab/Escape/retorno de foco, skip link, estados de formulário e vídeo pausado com redução de movimento. |
| T3: contraste, nomes e alternativas de imagem | APROVADO | Auditoria axe WCAG 2 A/AA e 2.1 AA nos estados registrados, mais inspeção de conteúdo. Não constitui certificação integral WCAG. |
| T3: 320 px, 390 × 844 e texto efetivo 200% | APROVADO | Chromium com viewport CSS efetivo; texto/entrelinha duplicados; 12 estados sem perda de ações essenciais. |
| T3: aparelho físico, teclado virtual e leitor de tela | PENDENTE | Não verificado; emulação não substitui iOS/Android, teclado real ou escuta com tecnologia assistiva. Recomendado na fase 6. |
| T4: compilação, tipos e estabilidade de URL | APROVADO | Builds preview/público e typecheck; acesso direto, recarga, seleção, comparação e retorno pelo histórico. |
| T4: carregamento, mídia e layout | APROVADO | Medição local e inspeção de recursos. Imagens responsivas, lazy loading, dimensões reservadas, vídeos consultáveis sob demanda. Sem alteração de qualidade. |
| T4: desempenho em rede/aparelho reais | PENDENTE | Não medido em rede móvel nem usuários reais; não é relatório de Core Web Vitals de campo. |
| T4: metadados, canonical e indexação | APROVADO | Rotas, HTML local/remoto e oito combinações da regra de indexação. URL canônica institucional preservada. |
| T5: lista definitiva M01–M08/M04A/B | APROVADO | Nove fichas de produção com 16 campos, abaixo; instalação condicionada a aprovação e direitos. |
| T5: fornecimento dos novos materiais | PENDENTE | Todos aguardam produção/aprovação; alternativas existentes permitem publicar sem eles. Não é bloqueador da primeira versão. |
| T6: apresentação pública no computador e celular | APROVADO | Build local com `VERCEL_ENV=production`, `BOSSA_PUBLICADO=sim`; navegador em 1440/390/320 px; ausência de marcadores e quadros internos. |
| T7: Flow, formulário, navegação e links | APROVADO | Regressão controlada do Flow e links internos; diff exclusivamente `site/`, sem mudança de dados de produto do Flow. |
| T7: CRM, Nara, banco, DNS e domínio | APROVADO | Nenhum arquivo ou configuração desses sistemas alterado; nenhuma migração. |
| T8: manifesto, dependências e reversão | APROVADO | Relação completa de arquivos e plano operacional, abaixo. |
| T8: nova prévia protegida | APROVADO | Deploy da candidata no projeto existente; proteção preservada. |
| T9: aprovação final de Fábio | BLOQUEADOR PARA PUBLICAÇÃO | Pendente da sua avaliação desta candidata. Nenhuma publicação em produção deve ocorrer antes disso. |

### Critérios A01–A17 da fase 2

| Critério | Situação | Evidência objetiva |
| --- | --- | --- |
| A01 abertura | APROVADO | Capturas em 1440 × 1000 e 390 × 844; acesso direto às plantas. |
| A02 rotas e compartilhamento | APROVADO | Quatro rotas, recarga e URL copiável; compartilhamento nativo simulado, sem envio. |
| A03 coerência e estado | APROVADO | 32 combinações origem/opção/caminho, além da página geral; campos e expansões preservados. |
| A04 duplex | APROVADO | Duas pranchas completas, avisos junto à imagem e no visor. |
| A05 compartilhar/cancelar/falhar | APROVADO | Clipboard real local; navigator.share simulado para sucesso/cancelamento/falha. Não comprova aparelho físico. |
| A06 padrão sem preferência | APROVADO | Título e contato gerais até seleção explícita. |
| A07 contexto em todos os canais | APROVADO | Seletor/comparação e barra/contato final conferidos sem abrir conversa real. |
| A08 sucesso verdadeiro e falhas | APROVADO | Apenas HTTP 2xx + ok true + gravado true produz sucesso/lead_submit. |
| A09 campos iniciais e DDI | APROVADO | Finalidade vazia, consentimento desmarcado; +351/+1/+49 e nacional até RPC local. |
| A10 exposição | APROVADO | Fora da tela não conta; retorno à opção já vista não duplica a exposição. |
| A11 obra histórica | APROVADO | Percentual datado de agosto/2026; nenhuma foto nova ou medição inventada. |
| A12 factualidade dos ambientes | APROVADO | Ficha e legendas corretas, sem atribuir render de interior a tipologia. |
| A13 teclado e ampliação | APROVADO | Testes locais e texto efetivo 200%; limites de aparelho físico discriminados. |
| A14 espaços de produção | APROVADO | Nove posições nomeadas na prévia, sem play de vídeo inexistente. |
| A15 alternativas públicas | APROVADO | Navegação pública local sem IDs/quadros vazios. |
| A16 consumidores compartilhados | APROVADO | Flow 73 m² e formulário controlado, estilos do Alma delimitados. |
| A17 pré-registro e links | APROVADO | Avisos e destinos institucionais/privacidade/boletim conferidos. |

## 3. Testes e evidências

- [Regressão funcional](docs/alma/fase5/regressao-controlada.json): 33 registros de título (página geral + matriz de 32), três medidas do formulário, 20 verificações móveis das dez seções, 14 estados da barra, seis cenários de formulário; Flow e compartilhamento. Reexecutado nesta fase; respostas de lead/evento interceptadas. A cópia de link usa clipboard real local. Sucesso/cancelamento/erro de compartilhamento nativo são simulações.
- [API HTTP real com RPC simulada](docs/alma/fase5/api-verificacao.json): +351, +1, +49 preservados; nacional recebe 55; origem `alma-seahouses`, formulário `interesse`, finalidade nula; validação 422 e falha RPC 500. Sem Supabase real.
- [Auditoria de prévia](docs/alma/fase5/auditoria-previa.json) e [auditoria pública](docs/alma/fase5/auditoria-publica.json): seções, links HTTP, axe, teclado, vídeo, erro de execução, viewport e métricas locais. A revisão da fase 4 no computador é também reaproveitada para os blocos editoriais inalterados.
- [Texto 200%](docs/alma/fase5/texto200-verificacao.json): 12 estados em 390/320 px. Duplicação de `font-size` e `line-height` calculados antes de qualquer escrita, aplicada ao texto HTML real somente pelo teste. Ex.: 17→34 px no corpo; viewport e DPR inalterados. Não é zoom nativo, DPR maior, transform, screenshot ampliada ou simples redução de viewport. Menu, plantas, comparação, formulário e controles do visor alcançáveis. Capturas reais adicionais em [índice](docs/alma/fase5/Capturas.md).
- [Metadados das cinco rotas](docs/alma/fase5/metadados-rotas.json): HTTP 200, título/OG correspondentes e canonical correto na página geral e quatro tipologias.
- [Indexação](docs/alma/fase5/indexacao.json): oito combinações; preview sempre bloqueado, produção depende da liberação explícita já adotada pelo projeto.
- [Build e tipos](docs/alma/fase5/build-e-tipos.txt): compilação Next e TypeScript. `npm run lint` continua sendo comando legado `next lint` indisponível no Next 16; não foi apresentado como verificação executada.

Escopo visual: Chromium 154 local, 1440 × 1000, 390 × 844 e 320 × 844 CSS px. Barras reais não foram ocultadas nas capturas. Sem aparelho físico, teclado virtual real, Safari/iOS, leitor de tela ou zoom nativo do navegador. Nenhum desses resultados é declarado verificado.

### Formulários e integração

FormLead é compartilhado. Alma registra interesse geral e finalidade opcional; planta permanece no contexto do WhatsApp, sem campo escondido em UTM/data. Não há agendamento confirmado nem download entregue por clique. O evento de interesse só sai após confirmação completa; falhas/incompletude/rede preservam os dados e oferecem nova tentativa ou WhatsApp. Trava de envio e regra de eventos preservadas. Nenhum nome/telefone de teste foi enviado aos sistemas reais.

**Teste real controlado da fase 6:** com autorização específica, conferir configuração de servidor sem expor valores; utilizar um contato da própria equipe identificado como teste; verificar retorno 2xx/ok/gravado, vínculo no atendimento correto e deduplicação/evento único; conferir tratamento do contato internacional. Definir antes quem acompanhará e tratará o registro. O canal de WhatsApp pode ser conferido pela equipe em dispositivo próprio. Não criar migração nem modificar Nara para passar esse teste. Esta ação não foi realizada nem está autorizada nesta fase.

### Acessibilidade

Contraste corrigido somente na localização do Alma. Nomes de botões e campos, imagens/legendas, títulos, modais nativos, Escape, foco inicial/retorno, rolagem da imagem e erros associados conferidos. Movimento reduzido pausa a abertura e impede animações automáticas; vídeos consultáveis dependem do usuário. A análise automática não cobre toda a percepção de leitura, daltonismo ou tecnologia assistiva; os itens `revisaoManual` dos JSONs são observações do mecanismo, não certificados de conformidade.

### Desempenho e áudio

Medição local, sem limitação de rede/CPU, cache do navegador vazio e cache do servidor já aquecido: apresentação pública desktop com movimento reduzido teve LCP observado de 376 ms e CLS de 0,015; em 390 × 844 com movimento normal, LCP de 240 ms, CLS de 0,053 e cerca de 2,94 MB transferidos na janela inicial, incluindo o loop da piscina. O vídeo da abertura reproduziu (2,09 s observados); apenas 4 das 29 imagens estavam carregadas inicialmente. A medição reduzida ficou em cerca de 0,8 MB. São observações do laboratório local, não uma pontuação Lighthouse, percentis de campo, rede móvel ou garantia de desempenho em produção. Sem salto persistente reproduzido; não houve refatoração de navegação por O01.

Imagens existentes mantidas sem recompressão destrutiva. Next serve AVIF/WebP responsivos; figuras têm proporções reservadas; fotos distantes usam carregamento progressivo. Na chegada não se baixa o vídeo consultável do trajeto nem todos os quadros de drone. O loop de abertura tem 2.181.186 bytes; duplex 435.683 bytes; trajeto 7.850.873 bytes e só é montado após ação. Abertura tem pôster e controle de pausa; redução de movimento mantém alternativa estática. Não há justificativa observada para trocar arquivos ou reduzir a qualidade nesta rodada.

**Áudio do trajeto — evidência anterior reaproveitada + identidade do arquivo reconferida:** SHA-256 `d69cc46287907d3546cbb46e1c21e53a18d7d2d671772bb95c181085197a3ab7`, igual à fase 4. Faixa AAC estéreo 44.100 Hz, 64,203 s. Decodificação integral anterior: 5.662.720 amostras, todas zero. Portanto o arquivo contém silêncio digital, sem fala a legendar. [ffprobe](docs/alma/fase4/audio-ffprobe.json) e [amostras](docs/alma/fase4/audio-amostras.json). Escuta humana não realizada neste ambiente; não foi inventada transcrição.

## 4. Versão pública e mídias

A prévia protegida mantém o mapa M01–M08 conforme a especificação. A versão equivalente ao cliente foi compilada e navegada **localmente** com configuração pública: living atual e demais renders preservados; Jazz/Soul em cartões textuais; boletim histórico completo; vídeos opcionais ausentes recolhidos. Sem IDs, avisos internos, arquivo pendente, quadro vazio ou play sem vídeo. Todos os dez blocos conferidos em computador e celular. Essa simulação local não altera produção nem demonstra configuração privada remota.

**Todos os novos materiais abaixo estão PENDENTES de produção/aprovação; suas alternativas estão APROVADAS para a primeira publicação.** As proporções, resoluções e durações são recomendações de produção, sem inferir características do imóvel. URLs `/img` e `/video` correspondem a arquivos em `site/public`. Não aumentar artificialmente uma fonte pequena. Não gerar arquitetura, obra simulada ou registro fictício.

### Lista priorizada de produção

1. **M03:** registros reais datados da obra, validados pela engenharia.
2. **M01:** convivência no living, com fidelidade ao render oficial.
3. **M02:** apresentação humana de Fábio/Bossa.
4. **M04A e M04B:** fotografias reais de Jazz e Soul entregues.
5. **M05:** compreensão das plantas oficiais de 103/114 m².
6. **M06 em paralelo:** depende de base técnica validada, não de criação visual livre.
7. **M07:** somente após referência arquitetônica aprovada.
8. **M08:** complementar, se acrescentar qualidade ao trajeto existente.

Para vídeos: MP4 H.264/AAC adequado à web, pôster, direitos de música e imagem; legendas WebVTT revisadas e transcrição sempre que houver fala. Preservar o arquivo-mestre e exportar versão web com qualidade visual. Música é opcional e licenciada, nunca substitui uma explicação; sem som automático. Texto editorial fica em HTML, evitando informações essenciais somente embutidas no arquivo. Registrar aprovação em `src/content/alma.ts`, no registro `midiasAprovadasAlma`, após receber e conferir o arquivo. O registro aceita uma mídia principal por espaço; para M03, escolher a principal e guardar o restante datado no acervo/boletim, sem presumir uma galeria já instalada.

### M01 — Família no living do Alma

| Campo | Orientação para produção |
| --- | --- |
| Código | M01 |
| Nome | Família no living do Alma |
| Tipo | Imagem ilustrativa baseada no render oficial |
| Local exato | S02 `#apartamentos`, imagem principal antes do seletor |
| Objetivo emocional e comercial | Acolhimento e convivência; ajudar a imaginar a rotina e avançar para as plantas. |
| Cena | Duas ou três pessoas em uma ação central: conversar, ler ou compartilhar a mesa no living oficial. |
| Enquadramento | Horizontal, câmera e arquitetura do render preservadas; ação central legível no recorte móvel. |
| Proporção | 16:9, com recorte móvel aprovado. |
| Resolução recomendada | Preferir 2400 × 1350; mínimo 1920 × 1080, se a fonte comportar. |
| Duração | Não se aplica. |
| Texto, narração e música | Sem texto embutido/áudio. Legenda: “Cena ilustrativa de convivência, baseada em perspectiva do projeto do Alma.” |
| Nome do arquivo | m01-familia-living.webp |
| Caminho no projeto | `site/public/img/alma/novos/m01-familia-living.webp` |
| Alternativa atual | `/img/alma/living.jpg` com legenda ilustrativa. |
| Prioridade | Alta, 2ª entrega da primeira rodada. |
| Cuidados factuais | Não alterar paredes, circulação, mobiliário fixo, proporções, acabamentos ou paisagem. Sem vínculo com 103/114/145/168 enquanto P08 estiver aberta; participantes autorizados. Nenhuma imagem será gerada nesta fase. |

### M02 — Fábio apresenta o Alma

| Campo | Orientação para produção |
| --- | --- |
| Código | M02 |
| Nome | Fábio apresenta o Alma |
| Tipo | Vídeo real + pôster + legendas/transcrição |
| Local exato | S08 `#obra`, bloco de apresentação da Bossa, antes do boletim |
| Objetivo emocional e comercial | Proximidade e confiança na equipe; convite respeitoso para explorar plantas e conversar. |
| Cena | Fábio se apresenta, explica convivência/espaço individual, dois por andar, três/quatro suítes e convida para conhecer o projeto. |
| Enquadramento | Plano médio no escritório ou ambiente real; luz natural, fundo organizado e áudio limpo. Margem para recorte móvel. |
| Proporção | 16:9. |
| Resolução recomendada | 1920 × 1080; pôster 1920 × 1080. |
| Duração | 45–60 segundos. |
| Texto, narração e música | Fala natural; nome/cargo só após confirmação. Música licenciada opcional, baixa. WebVTT e transcrição fiéis; legenda pública “Fábio apresenta o projeto do Alma Sea Houses.” |
| Nome do arquivo | m02-fabio-apresenta-alma.mp4; m02-poster.webp; m02-fabio-apresenta-alma.vtt |
| Caminho no projeto | Vídeo/VTT em `site/public/video/alma/novos/`; pôster em `site/public/img/alma/novos/`. |
| Alternativa atual | Texto institucional; bloco de vídeo recolhido. |
| Prioridade | Alta, 3ª entrega da primeira rodada. |
| Cuidados factuais | Não aparentar apartamento pronto, prometer antecipação, valorização, silêncio absoluto ou condições comerciais. Confirmar como Fábio quer ser identificado. |

### M03 — Fotos e vídeo da obra do Alma, com mês/ano

| Campo | Orientação para produção |
| --- | --- |
| Código | M03 |
| Nome | Fotos e vídeo da obra do Alma, com mês/ano |
| Tipo | 4–6 fotografias reais datadas; vídeo complementar opcional |
| Local exato | S08 `#obra`, junto ao boletim histórico |
| Objetivo emocional e comercial | Transparência e confiança; mostrar estágio real sem transformar fotografia em medição. |
| Cena | Vista geral identificável do canteiro e detalhes de etapas que a engenharia nomeie e valide. Data e descrição por arquivo. |
| Enquadramento | Horizontais estáveis, mesma obra reconhecível, conjunto amplo e detalhes; evitar riscos e exposição de trabalhadores sem autorização. |
| Proporção | 16:9 para a principal e vídeo; preservar originais sem corte técnico enganoso. |
| Resolução recomendada | Fotos 2400 × 1350 ou superior; mínimo 1920 px de largura. Vídeo 1920 × 1080. |
| Duração | Fotos: não se aplica; vídeo opcional 30–45 segundos. |
| Texto, narração e música | Legenda “Obra do Alma · {etapa validada} · registro de {data real}”. Narração opcional validada; se houver fala, VTT/transcrição. Música dispensável. |
| Nome do arquivo | m03-obra-AAAA-MM-01.webp até -06.webp; opcional m03-obra-AAAA-MM.mp4, pôster e .vtt. Substituir a data pela real. |
| Caminho no projeto | Fotos/pôster em `site/public/img/alma/novos/`; MP4/VTT em `site/public/video/alma/novos/`. |
| Alternativa atual | Resumo e link do boletim nº 07, agosto/2026; nenhum registro de outra obra. |
| Prioridade | Máxima, 1ª entrega. |
| Cuidados factuais | Obrigatoriamente real: não gerar, simular avanço, retocar para aparentar conclusão ou usar Flow. Engenharia valida etapa/data; nova foto não atualiza 10,52% nem sua referência agosto/2026. |

### M04A — Jazz entregue

| Campo | Orientação para produção |
| --- | --- |
| Código | M04A |
| Nome | Jazz entregue |
| Tipo | Fotografia real |
| Local exato | S08 `#obra`, cartão Jazz no histórico de entregas |
| Objetivo emocional e comercial | Segurança por evidência concreta; conectar a marca à entrega existente. |
| Cena | Fachada real do Jazz concluído, clara e identificável. |
| Enquadramento | Horizontal, edifício inteiro ou recorte que preserve identificação, verticais cuidadas, sem ocultar elementos para sugerir outro padrão. |
| Proporção | 4:3. |
| Resolução recomendada | 2400 × 1800 preferível; mínimo 2000 × 1500 quando disponível. |
| Duração | Não se aplica. |
| Texto, narração e música | Sem áudio/texto na foto. Legenda “Jazz · fotografia do empreendimento entregue”. Data de entrega em HTML. |
| Nome do arquivo | m04a-jazz-entregue.webp |
| Caminho no projeto | `site/public/img/alma/novos/m04a-jazz-entregue.webp` |
| Alternativa atual | Cartão textual Jazz, setembro/2019. |
| Prioridade | Alta, primeira parte da segunda rodada. |
| Cuidados factuais | Confirmar prédio e autorização de uso. Não usar render como prova de entrega nem atribuir foto ao Alma. Data da captura não altera setembro/2019; histórico não garante antecipação do Alma. |

### M04B — Soul entregue

| Campo | Orientação para produção |
| --- | --- |
| Código | M04B |
| Nome | Soul entregue |
| Tipo | Fotografia real |
| Local exato | S08 `#obra`, cartão Soul no histórico de entregas |
| Objetivo emocional e comercial | Confiança na continuidade da Bossa e nas realizações já existentes. |
| Cena | Fachada real do Soul concluído, clara e identificável. |
| Enquadramento | Horizontal, escala e identificação do prédio preservadas; luz natural, sem manipulação arquitetônica. |
| Proporção | 4:3. |
| Resolução recomendada | 2400 × 1800 preferível; mínimo 2000 × 1500 quando disponível. |
| Duração | Não se aplica. |
| Texto, narração e música | Sem áudio/texto na foto. Legenda “Soul · fotografia do empreendimento entregue”. Data em HTML. |
| Nome do arquivo | m04b-soul-entregue.webp |
| Caminho no projeto | `site/public/img/alma/novos/m04b-soul-entregue.webp` |
| Alternativa atual | Cartão textual Soul, dezembro/2023. |
| Prioridade | Alta, junto a M04A. |
| Cuidados factuais | Confirmar prédio e direitos; fotografia real, sem misturar Soul e Alma. Data de captura independente de dezembro/2023, sem garantia de prazo futuro. |

### M05 — Conheça as plantas de 103 e 114 m²

| Campo | Orientação para produção |
| --- | --- |
| Código | M05 |
| Nome | Conheça as plantas de 103 e 114 m² |
| Tipo | Vídeo explicativo a partir das plantas oficiais |
| Local exato | S03 `#plantas`, consulta abaixo da comparação |
| Objetivo emocional e comercial | Clareza e conforto na escolha; reduzir dúvidas antes de conversar. |
| Cena | Planta de 103 e depois 114, em seguida lado a lado; identificar área, três suítes, duas vagas e como ampliar/consultar a equipe. |
| Enquadramento | Captura limpa das pranchas inteiras, zoom discreto preservando orientação; rótulos legíveis também no celular. |
| Proporção | 16:9. |
| Resolução recomendada | 1920 × 1080; pôster 1920 × 1080. |
| Duração | 45–75 segundos. |
| Texto, narração e música | Narração objetiva recomendada, VTT/transcrição; rótulos acessíveis. Música opcional discreta. Legenda “Apresentação das plantas de 103 e 114 m². Ilustrações do projeto.” |
| Nome do arquivo | m05-plantas-103-114.mp4; m05-poster.webp; m05-plantas-103-114.vtt |
| Caminho no projeto | MP4/VTT em `site/public/video/alma/novos/`; pôster em `site/public/img/alma/novos/`. |
| Alternativa atual | Plantas e comparação atuais; vídeo complementar recolhido. |
| Prioridade | Média no planejamento, 5ª prioridade prática após M04A/B conforme solicitado. |
| Cuidados factuais | Não medir por pixels, afirmar onde estão os 11 m² de diferença, garantir encaixe de móveis ou alterar layout. Não incluir duplex enquanto a associação técnica não for resolvida. |

### M06 — Pavimento, acessos e duas unidades

| Campo | Orientação para produção |
| --- | --- |
| Código | M06 |
| Nome | Pavimento, acessos e duas unidades |
| Tipo | Imagem técnica derivada de planta oficial aprovada |
| Local exato | S04 `#posicao`, junto à explicação de configuração e fachada |
| Objetivo emocional e comercial | Orientação e confiança; facilitar compreensão de dois por andar e acessos. |
| Cena | Pavimento oficial identificado, com duas unidades, circulação, acessos e núcleo comum, rótulos validados por engenharia/arquitetura. |
| Enquadramento | Prancha inteira, sem perspectiva inventada; destacar informação somente com base técnica. Oferecer fonte para ampliação. |
| Proporção | 4:3 ou proporção técnica original quando necessária. |
| Resolução recomendada | Largura de pelo menos 2400 px se a fonte permitir; preferir original vetorial e exportação legível, sem criar detalhe por aumento artificial. |
| Duração | Não se aplica. |
| Texto, narração e música | Rótulos e revisão validados; legenda final nomeia o pavimento efetivamente representado. Sem áudio. |
| Nome do arquivo | m06-pavimento-aprovado.webp, ou formato técnico adequado aprovado. |
| Caminho no projeto | `site/public/img/alma/novos/m06-pavimento-aprovado.webp` e original técnico no acervo aprovado. |
| Alternativa atual | Fachada oficial e texto de dois apartamentos por andar. |
| Prioridade | Alta utilidade; em paralelo, dependente de documento técnico. |
| Cuidados factuais | Não colar plantas individuais, inventar orientação solar, limites/lados ou gerar desenho técnico. Se duplex, resolver P01 e declarar pavimento/revisão. Sem inferir disponibilidade comercial. |

### M07 — O apoio na volta da praia

| Campo | Orientação para produção |
| --- | --- |
| Código | M07 |
| Nome | O apoio na volta da praia |
| Tipo | Imagem de perspectiva aprovada |
| Local exato | S07 `#conforto`, item “A volta da praia” |
| Objetivo emocional e comercial | Cuidado cotidiano e conveniência; tornar concreto um recurso já confirmado. |
| Cena | Um espaço efetivamente projetado: entrada de banhistas, ducha/lava-pés ou box; escolher conforme referência arquitetônica disponível. |
| Enquadramento | Horizontal com câmera e elementos coerentes com a base aprovada; espaço identificável, sem montagem de ambientes desconectados. |
| Proporção | 4:3. |
| Resolução recomendada | 2400 × 1800 preferível, mínimo 2000 × 1500 se a fonte permitir. |
| Duração | Não se aplica. |
| Texto, narração e música | Sem áudio/texto embutido. Legenda “Perspectiva ilustrativa de {nome do espaço aprovado} do Alma.” |
| Nome do arquivo | m07-volta-da-praia.webp |
| Caminho no projeto | `site/public/img/alma/novos/m07-volta-da-praia.webp` |
| Alternativa atual | Texto com entrada de banhistas, ducha/lava-pés e box confirmados. |
| Prioridade | Média, após validação da base. |
| Cuidados factuais | Não criar resort, acrescentar equipamentos, pranchas/bicicletas sem comprovar dimensões ou inventar ligação entre espaços. Foto externa de pessoas não comprova instalações. |

### M08 — Uma manhã em família no Perequê

| Campo | Orientação para produção |
| --- | --- |
| Código | M08 |
| Nome | Uma manhã em família no Perequê |
| Tipo | Vídeo real do entorno + pôster |
| Local exato | S06 `#localizacao`, faixa complementar após percurso/quadros |
| Objetivo emocional e comercial | Naturalidade e pertencimento; mostrar uma rotina possível no bairro. |
| Cena | Sequência breve real: caminhar, conversar, chegar à Praia do Perequê e observar a água. Participantes com autorização. |
| Enquadramento | Planos estáveis de conjunto e proximidade; ação central com margem para recorte móvel. |
| Proporção | 16:9; recorte 9:16 opcional, se filmado com margem. |
| Resolução recomendada | 1920 × 1080 horizontal; eventual versão vertical 1080 × 1920; pôster correspondente. |
| Duração | 20–30 segundos. |
| Texto, narração e música | Som ambiente preferível; música licenciada opcional. Sem necessidade de fala; se houver informação narrada, VTT/transcrição. Legenda “Momentos no Perequê, em Porto Belo. Imagens reais do entorno.” |
| Nome do arquivo | m08-manha-pereque.mp4; m08-poster.webp; .vtt se houver fala. |
| Caminho no projeto | MP4/VTT em `site/public/video/alma/novos/`; pôster em `site/public/img/alma/novos/`. |
| Alternativa atual | Trajeto real `/video/alma/trajeto.mp4`; faixa complementar recolhida. |
| Prioridade | Opcional, rodada complementar. |
| Cuidados factuais | Não filmar outra praia como Perequê, simular vista de unidade, equiparar duração editada a tempo de caminhada ou mencionar distâncias/serviços sem verificação. Não substituir o trajeto principal. |

## 5. Regressões, arquivos, dependências e configuração

**Comparação:** [manifesto completo das fases 3–5](docs/alma/fase5/Arquivos_Para_Publicacao.txt), produzido contra `origin/main` e incluindo os novos arquivos desta fase. Somente caminhos sob `site/`. Relatórios e capturas acompanham a revisão; não são assets públicos de cliente. Nenhum arquivo de CRM, Nara, banco ou configuração remota foi modificado. `package.json`, lockfile, `next.config.ts` e configuração Vercel permanecem iguais.

**Arquivos funcionais desta fase:** `src/lib/publicacao.ts`, `src/app/layout.tsx`, `src/app/robots.ts`, `src/styles/alma.css`. Testes: `scripts/verificar-alma-fase5.cjs`, `scripts/verificar-indexacao-alma.cjs`, `scripts/verificar-alma-texto-publico.cjs`, `scripts/verificar-api-alma.cjs`. Documentos/fontes/evidências novos estão relacionados no manifesto.

**Risco compartilhado:** FormLead, normalização de telefone, API de leads e WhatsApp foram alterados na fase 3; testes da candidata cobrem Flow e os contratos comuns. Nesta fase, a regra de indexação é global por necessidade e não muda a condição de liberação da produção, apenas bloqueia previews explicitamente. A correção de contraste é delimitada ao Alma. Não houve alteração dos componentes de layout/menu institucionais. Não foi executada a aplicação CRM, pois seu código está fora do diff e os serviços reais não fazem parte do escopo autorizado.

Dependências atuais: Next.js 16.4.2, React 19, TypeScript, fontes locais `@fontsource`, cliente Supabase no servidor. Nenhum pacote novo no site. Playwright e axe usados como ferramentas de QA do ambiente, fora do lockfile da aplicação.

| Variável | Papel e conferência necessária na fase 6 |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical/OG/sitemap; deve refletir o endereço institucional aprovado. Nenhuma troca de domínio autorizada aqui. |
| `NEXT_PUBLIC_WHATSAPP` | Destino centralizado; fallback atual `554792889395`, conferido nos links. Confirmar o canal com a equipe. |
| `NEXT_PUBLIC_ALMA_ESTADO` | Manter `pre-registro`. Registro cartorial e mudança comercial exigem comprovação e aprovação próprias. |
| `BOSSA_PUBLICADO` | Libera indexação somente quando `sim` e fora de preview. Não foi alterada remotamente. Não mudar por causa da simulação local. |
| `VERCEL_ENV` | Fornecida pela Vercel; preview bloqueado mesmo com liberação pública. Também determina apresentação dos espaços de revisão. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `BOSSA_ORGANIZATION_ID` | Servidor/API. Chave Sensitive só em Production conforme documentação vigente. Presença e funcionamento reais não foram validados por envio. Nunca copiar valores para o relatório ou cliente. |
| `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_CLARITY_ID` | Opcionais, dependem de configuração e consentimento. Documentação informa vazios; estado remoto e entrega real a esses fornecedores não verificados. Não foram configurados nesta fase. |

RPC existente envolvida: `site_registrar_lead`; eventos usam `site_registrar_evento` e o vínculo de referência de WhatsApp já existente. Nenhuma migração, nova tabela, novo evento ou mudança de permissão.

## 6. Critérios para liberar e plano da fase 6

**Portas de liberação:** aprovação final de Fábio; validação real controlada do atendimento com autorização específica; confirmar configurações de servidor/ambiente, estado de pré-registro, canal e domínio vigentes. Não confundir o sucesso do mock com integração real. Materiais novos são melhorias opcionais; não bloqueiam a publicação das alternativas aprovadas. Eventual mudança de incorporação, preço, estoque ou prazo requer outra aprovação, não é parte deste pacote.

Procedimento proposto, **não executado**:

1. Fábio aprova visual, textos, alternativa pública e critérios pendentes. Registrar o SHA exato aprovado e conferir novamente a diferença contra main; preservar trabalhos posteriores e resolver conflitos de modo explícito. PR, se preparado, permanece em rascunho, sem merge.
2. Registrar deploy de produção ativo e configuração vigente, sem exportar segredos. Confirmar `rootDirectory=site`, projeto `bossa-site`, builds independentes do CRM e ausência de alterações fora do manifesto.
3. Concluir teste real controlado acordado com a equipe, em contexto autorizado, incluindo tratamento do registro de teste. Se a configuração/integracão falhar, manter publicação bloqueada; não fazer o formulário fingir sucesso.
4. Somente na fase 6, após autorização de publicação, executar o fluxo de merge/deploy aprovado. Não mudar DNS, domínio ou proteção como consequência automática deste trabalho. O site institucional/Wix e seu lançamento geral exigem decisão separada quando aplicável.
5. Após deploy: conferir HTTP, noindex/index conforme estado aprovado, canonical/OG/robots/sitemap, dez seções e alternativas públicas sem códigos, quatro rotas+recarga+voltar, celular/barras/modal, Flow, contato e boletim datado. Conferir erros de execução e eventos sem duplicação, acompanhando o atendimento real previamente autorizado.
6. Se falha relevante: interromper divulgação e reverter **somente `bossa-site`** para o deploy estável anterior registrado; não reverter CRM ou banco. Se necessário, preparar revert dos commits do site em branch/PR próprio, preservando modificações paralelas. Não alterar DNS para contornar um defeito da página.

**Referência de reversão conferida por leitura da Vercel nesta fase:** último deploy Production READY retornado: `dpl_3J8Y9Ln4vZw38fK4u9HspTZMuwcF`, SHA `31cd1510aeddd8ba0402f3ba09c43ffde6319f27`, `bossa-site-1a9uupuxz-elos-os.vercel.app`, elegível a rollback. Há deploy Production posterior cancelado; ele não é a referência estável. Reconfirmar o ativo no dia da publicação; esta informação não autoriza rollback agora.

## 7. Entrega e decisões de Fábio

- Avaliar a candidata e as capturas públicas. Aprovação final **PENDENTE**.
- Autorizar/combinar o teste real controlado de atendimento na fase 6. Até sua conclusão, **BLOQUEADOR PARA PUBLICAÇÃO** operacional.
- Produzir/aprovar M03, M01, M02, M04A/B e M05 na prioridade combinada; M06 exige engenharia, M07 base aprovada, M08 opcional. Todos **PENDENTES**, sem bloquear alternativas públicas.
- Confirmar direitos dos novos materiais e manter as ressalvas técnicas P01–P12 enquanto não houver documentação. Não é necessário resolver essas pendências factuais para usar as alternativas já aprovadas.

**Publicado nesta fase:** somente prévia protegida e commits de preparação na branch de implementação. **Não publicado:** produção, main, domínio/DNS, estado comercial, CRM/Nara/banco. Não houve mensagens comerciais, contatos reais, promoção de deploy nem mudança de proteção. Aguarda avaliação da fase 5 antes da publicação.
