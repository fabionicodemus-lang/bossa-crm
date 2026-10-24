# Bossa Site — Etapa 4: auditoria da nova página do Flow

**Data:** 22/10/2026 · **Prévia auditada:** https://bossa-site-3ika5rf4s-elos-os.vercel.app/empreendimentos/flow-aptos · **PR:** https://github.com/fabionicodemus-lang/bossa-crm/pull/130.

## 1. Parecer executivo

**A nova página é uma evolução clara de organização e funcionamento. Recomendo uma rodada de correções de apresentação comercial e legibilidade antes de considerá-la pronta para publicação.** Não foi reproduzido problema P0 nos caminhos exercitados. Isso não homologa a gravação real de leads, o atendimento da Nara, a entrega de material ou a operação de visitas.

O maior ganho é mostrar as plantas logo depois da abertura, em vez de exigir um longo percurso por lazer e vistas. Flow Move e The Roof ficaram mais fáceis de entender; a distância anunciada continua acessível; as informações de obra estão datadas; os pedidos de visita e apresentação já não prometem confirmações que o site não verifica.

O principal ponto a melhorar é a força demonstrativa. A página informa bastante, mas ainda mostra pouco da experiência de morar no apartamento de duas suítes e da qualidade executada. Além disso, cuidados legítimos foram transformados em muitos textos defensivos e algumas referências internas de desenvolvimento aparecem para o comprador. É possível comunicar com precisão e confiança usando notas curtas, benefícios concretos e evidências acessíveis.

**Minha decisão como comprador do perfil solicitado:** eu consideraria uma visita, especialmente pelo lazer em dois pavimentos, duas suítes, vistas selecionáveis e entrega prevista em 2027. Eu ainda pediria confirmação de vagas, unidade/andar/orientação, planta em alta, estágio recente da obra e condições comerciais. A página não permite concluir que o Flow é a melhor opção em torno de R$ 1 milhão: não apresenta uma oferta atual comparável nem vincula preço, unidade, andar e características. O orçamento foi usado como contexto de exigência do comprador, não como preço divulgado do Flow.

### Notas de 0 a 10

São avaliações editoriais desta auditoria, não medições de comportamento, conversão ou pesquisa com compradores.

| Critério | Nota | Fundamentação |
|---|---:|---|
| Clareza | **8,0** | H1 e resumo coerentes; cinco tipologias e dois pavimentos identificados. Excesso de notas e algumas expressões internas atrapalham. |
| Desejo | **7,0** | Marca, fachada, rooftop e vistas ajudam. Galerias pequenas e ausência de um living tipo validado reduzem a experiência de se imaginar morando. |
| Diferenciação | **7,0** | Lazer, conveniência e prazo aparecem. Engenharia ainda depende de afirmações genéricas e referências pouco úteis ao cliente. |
| Confiança | **7,5** | Obra datada, clientes reais, histórico e promessas corrigidas. Faltam data do vídeo, provas visuais de execução e confirmação de dados comerciais importantes. |
| Experiência móvel | **7,5** | Sem overflow geral nos estados medidos; seleção e visor funcionam. Cartões pequenos, duas barras superiores e leitura de plantas ainda exigem esforço. |
| Conversão | **7,0** | CTA de planta contextual, visita e alternativa de contato funcionam na interface. Falta demonstrar melhor o apartamento e reduzir redundância/cautelas. Integração real não homologada. |

**Avaliação geral editorial: aproximadamente 7,3/10.** A próxima rodada deve melhorar demonstração, legibilidade e foco; não exige redesenhar toda a identidade nem encomendar novos renders de lazer.

## 2. Versões, escopo e fontes

| Item | Verificação |
|---|---|
| Repositório | `fabionicodemus-lang/bossa-crm`, somente `site/` |
| Branch do PR | `feat/flow-posicionamento-2026` |
| Situação observada do PR #130 | Aberto, rascunho, sem merge |
| HEAD do PR consultado | `ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b` |
| Commit da prévia informada | `b98cc77f2cc70969287f1250ddd7a92c2e78d0d7` |
| Deployment | `dpl_G4Lmy4Nja2hJBiELfVCAfeAAR6Wd`, READY, Preview, projeto `bossa-site` |
| Diferença entre HEAD e prévia | Somente relatório de implementação e JSON de conferência remota; nenhuma diferença de código da página ou mídia |
| Base do PR | `main` em `f0c0dbb5077dbe25a8dae692f11015f70d99ab7e`; já inclui a evolução do Alma, conforme relatório |
| Especificação lida | `site/docs/flow/fontes/Bossa_Flow_Etapa2_Especificacao_2026-10-22.md` |
| Relatório lido | `site/Flow_Etapa3_Relatorio_Implementacao.md` e evidências em `site/docs/flow/etapa3/` |
| Versão anterior acessível | https://bossa-site-1a9uupuxz-elos-os.vercel.app/empreendimentos/flow-aptos |
| Proteção | Vercel Authentication habilitada em todos os deployments na configuração consultada; `noindex, nofollow` encontrado na prévia e na rota de planta |

Não foram alterados código, banco, CRM, PR, configuração, proteção ou domínio. Não houve merge, publicação nem envio de contatos/mensagens. A navegação normal pode gerar os eventos analíticos que o próprio site emite; isso não é teste de gravação de lead nem homologação do painel.

### Métodos e limites

- Navegação real no Chrome conectado, na URL fornecida e na versão anterior.
- Inspeção do DOM renderizado nas larguras **360, 390, 768, 1024 e 1440 CSS px**. O ambiente exigiu ajuste de um pixel no controle de viewport para atingir exatamente 360/768/1024; as larguras efetivas foram conferidas no navegador. Altura 844 px, exceto desktop 900 px.
- Exercitados: cinco plantas, URLs/títulos/WhatsApp; 36 combinações de vistas; visor, zoom, teclado, Escape e retorno de foco; plantas dos dois pavimentos; vídeos; validação vazia do formulário; alternância entre visita e apresentação; FAQ; navegação interna e versão anterior.
- Revisão do código e dos arquivos de mídia, cruzada com o conteúdo renderizado. As 91 mídias foram conferidas por arquivo e comparadas por hash com o acervo da Etapa 1: nenhuma foi alterada.
- Sucessos/falhas de API, pinça, texto a 200%, axe e integrações fictícias são **testes documentados pelo Codex na Etapa 3**. Não foram todos repetidos nesta auditoria. Seus resultados não foram tratados como integrações reais.
- Não usados aparelho físico, Safari/iOS, teclado virtual real, leitor de tela ou escuta integral dos quatro vídeos. Pinça física não homologada; zoom por botões foi exercitado.
- As capturas remotas tiveram falhas intermitentes após alterações de viewport. O pacote distingue as capturas novas aproveitáveis das imagens do próprio relatório da Etapa 3, do mesmo código. Essas imagens complementares foram abertas e examinadas, mas **não são novas capturas remotas desta rodada**. Não há captura nova independente de cada seção em todas as cinco larguras. A verificação responsiva ao vivo nas cinco larguras foi estrutural/DOM, com inspeção visual disponível principalmente em desktop e em estados móveis, complementada pelo acervo de QA do PR.
- Não foi realizado Lighthouse nem uma medição controlada de LCP/INP/CLS no ambiente remoto. Este relatório não atribui desempenho numérico a resultados não medidos.

## 3. Comparação com a versão anterior

| Aspecto | Antes | Nova versão | Avaliação |
|---|---|---|---|
| Abertura | “Perto do mar. No ritmo da cidade.” | “Seu apartamento é só o começo.” | Melhor conexão com o conjunto apartamento + edifício e menor dependência da proximidade da praia. |
| Plantas | Seção começava perto de 9.513 px no desktop | Seção começa perto de 974 px; escolhas logo abaixo | Grande ganho de acesso. A âncora chega às escolhas. |
| Flow Move | Cinco grandes blocos em sequência | Galeria compacta e planta do pavimento | Mais eficiente; miniaturas ficam pequenas, sobretudo no celular. |
| The Roof | Piscina e receber separados pelo bloco de vistas | Ambientes reunidos e planta do pavimento | Melhor compreensão do conjunto. A piscina perdeu parte do impacto de imagem ampla. |
| Vistas | Corte lateral no mobile e promessa forte de janela | Proporção `contain`, ampliação e contexto de drone | Correção relevante; ainda falta preservar o andar ao trocar direção. |
| Apartamento tipo | Living com aparência de duplex junto às plantas de duas suítes | Render não comprovado retirado | Informação mais confiável; falta substituto validado que demonstre o uso do apartamento tipo. |
| Engenharia | Listas extensas e títulos absolutos | Quatro cartões com benefício e referência | Mais preciso, porém genérico e com bastidores de especificação expostos. |
| Obra | Frases relativas e “fechada de baixo a cima” | Percentual e boletim datados; esquadrias/alvenaria distinguidas | Mais confiável; título e excesso de cautelas enfraquecem a percepção de avanço. |
| Contato | Dois formulários e promessa de book em instantes | Um formulário visível por vez; pedido, sem confirmação automática | Evolução funcional e de honestidade. Ainda há múltiplos botões repetidos no mesmo bloco. |

Na renderização desktop desta rodada, a nova página apresentou cerca de **18,8 mil px** de altura. No celular de 390 px, cerca de **21,1 mil px**. São medidas de extensão de uma renderização, não desempenho nem taxa de abandono. A página permanece longa, especialmente por plantas de pavimento, duplex e vídeos verticais. Condensar não deve significar esconder informações importantes.

## 4. Avaliação comercial: comprador com orçamento próximo de R$ 1 milhão

### A página desperta desejo?

Sim, principalmente pela marca, fachada em movimento, piscina elevada, distribuição do lazer e vistas reais. O desejo cai quando se passa para uma sucessão de pequenos cartões e textos de ressalva. A página precisa demonstrar a vida no apartamento de duas suítes com a mesma força que demonstra as áreas comuns.

O acervo permite mais impacto sem novas imagens: piscina em destaque maior, render do salão e momentos de uso com legendas curtas, plantas de pavimento em apresentação recolhível/ampliável e imagens de apoio selecionadas. A assinatura e a paleta devem permanecer.

### É claro por que considerar o Flow?

Está claro o conjunto: duas suítes, dois pavimentos de lazer e conveniência, vistas em diferentes alturas e entrega prevista para novembro de 2027. Ainda falta uma síntese curta que una esses fatores e indique para quem fazem sentido. A engenharia, importante para sustentar valor, aparece tarde e sem prova visual suficiente.

### A distância da praia é tratada adequadamente?

A página informa aproximadamente 800 m na Localização e no FAQ e não inventa tempo caminhável. Isso é correto. Porém, a informação aparece muito tarde na jornada: no estado móvel medido, Localização começa após cerca de 16,7 mil px. Para o comprador que faz comparação, descobrir a distância só no final pode gerar sensação de informação tardia, mesmo sem intenção de esconder.

**Recomendação editorial:** manter o hero aprovado sem transformar distância em protagonista, mas oferecer uma ficha factual compacta após as plantas ou acesso rápido à Localização. Exemplo de conteúdo, sujeito à aprovação editorial: “Balneário Perequê · aproximadamente 800 m da praia, conforme distância divulgada · entrega prevista nov/2027”. Não criar nova medição, rota ou promessa de minutos.

Lazer e conveniência podem justificar preferência para certos perfis, mas não “compensam” universalmente os 800 m. Quem prioriza poucos metros até a areia pode preferir outro produto. Para provar escolha superior por preço seria necessário comparar oferta atual, área, vagas, andar, orientação, entrega e condição de pagamento; esta página não fornece esses dados por unidade.

### Existe informação suficiente para querer visitar?

Sim, para uma visita de descoberta. Falta informação para uma decisão comparativa madura: vagas confirmadas, desenho nítido, orientação por unidade, correspondência de vista e condições comerciais atuais. Não publicar esses dados por suposição. O próximo contato deve ajudar o comprador a resolver essas dúvidas, aproveitando a planta e a referência de altura já escolhidas.

## 5. Revisão individual das seções

| Seção | O que está bom | O que pode melhorar | O que precisa ser corrigido |
|---|---|---|---|
| **Abertura** | Mensagem aprovada, marca, assinatura, tipologias e prazo claros. CTAs têm destinos coerentes. | Enxugar o parágrafo e repetição da assinatura na nota; assegurar contraste dos rótulos em todos os quadros do vídeo. | Nenhum erro factual reproduzido. Preservar distinção 2 suítes/tipo e 3/duplex. O banner de cookies ocupa parte da área de CTA no primeiro acesso desktop: conferir composição em tela baixa. |
| **Plantas** | Cinco opções com área/suítes, seleção evidente, CTA específico, link direto e ampliação. | Demonstrar 2–3 benefícios concretos de cada planta com base no desenho aprovado; oferecer render tipo validado; melhorar a leitura antes do clique. | Fontes Tipo 2/3 são pequenas; zoom amplia pixels. Duplex precisa opção por piso quando fonte oficial estiver disponível. Não preencher vagas ainda desconhecidas. |
| **Conceito de morar** | Flow Move e Roof identificados; área comum separada da privativa. | Trocar texto administrativo por síntese de uso e valor; evitar repetir duas imagens que reaparecem imediatamente. | “Mais de 600 m² declarados” soa como ressalva documental. Usar o dado aprovado com nota de fonte, sem inflar ou misturar com a área privativa. |
| **Flow Move** | Compacto; fitness, coworking, store, playground/zen e cinema; planta do 5º disponível. | Fotos pequenas em cinco colunas desktop e duas mobile. Dar uma imagem principal e seleção/galeria com leitura confortável. Planta pode ficar acessível sem ocupar grande altura por padrão. | Explicar conveniência como ambiente previsto, sem transformar a cautela de operação em protagonista. Nenhuma promessa de roupa pronta foi encontrada. |
| **The Roof** | Ambientes reunidos; aquecimento descrito como infraestrutura; planta do 24º ampliável. | Piscina deve ser imagem de maior impacto também no desktop. Nos estados atuais são três colunas, enquanto no mobile a primeira foto ocupa toda a linha. | Evitar que a foto de vista geral pareça foto específica do gourmet. Não acrescentar sol integral, piscina já aquecida ou vista garantida. |
| **Vistas** | 36 referências; proporção preservada; ampliação; andar/direção no contato. | Mostrar foto e controles mais próximos no celular; CTA pode ter texto mais natural. | Trocar direção deve preservar andar quando ele existe em ambas, ou avisar mudança para altura disponível. Atualmente 20º/mar → 19º/morros sem aviso explícito. |
| **Duplex** | Duas áreas separadas, 3 suítes, vídeo 1601 identificado; sem estoque presumido. | Reduzir altura do vídeo no fluxo e permitir preview de duração; pranchas por piso. | Confirmar documentalmente a associação dos dois renders às variantes 93/117,7 m²; o alt atual é genérico, embora a legenda faça associação específica. Não foi comprovado erro de render nesta auditoria. |
| **Engenharia** | Tirou garantias absolutas; características identificáveis e CTA para visita. | Benefício cotidiano + evidência concreta; isolamento, esquadrias e execução merecem fotos e fonte verificável. “Normatizadas” isoladamente não demonstra diferencial. | Remover do texto público “especificação aprovada da Etapa 2”, “aprovadas no conteúdo do site” e referências genéricas que não abrem documento. Separar referência editorial interna de fonte para cliente. |
| **Obra** | Boletim 25/setembro, 57,87%, estrutura/alvenaria/esquadrias contextualizados; vídeo e histórico. | Título “O projeto está no papel” diminui percepção de uma torre com estrutura concluída. Sugerido: “A obra avançou. Acompanhe cada etapa.” com data visível. Pequeno resumo de avanço pode aparecer antes. | Confirmar e informar data do vídeo; substituir “data de captura a confirmar” por informação validada antes de encerrar a revisão. Não atualizar percentual sem novo boletim. |
| **Clientes** | Dois depoimentos reais existentes, junto da prova de obra. | Legenda humana curta e duração do vídeo; destacar o que será encontrado no depoimento após revisão do conteúdo. | Providenciar legendas/transcrições revisadas. Registro de autorização é informação de controle interno; não é argumento de venda para aparecer como destaque. |
| **Localização** | Endereço, aproximadamente 800 m, aerial e busca por endereço corretamente nomeada. | Informação pode ser encontrada mais cedo; explicar rotina/conveniência só com referências aprovadas do entorno. | Simplificar “não corresponde a rota pedonal aferida” na legenda pública, mantendo nota metodológica acessível. Não inventar deslocamento nem novas rotas. |
| **FAQ** | Seis dúvidas úteis; abertura nativa; conteúdo coincide com JSON-LD. | Respostas mais diretas, sem repetir todo o histórico de cautelas. | Redação “não representa nova medição em outubro” envelhece. Preferir “Medição publicada: setembro/2026; consulte a edição mais recente”. Preservar a data real. |
| **Contato** | Visita prioritária; formulário alternável; sem data descartada; WhatsApp leva planta escolhida. | Reduzir repetição de “solicitar visita”, “agendar”, “conversar” e alternativa no mesmo quadro. | Tirar bastidores como “o formulário registra o pedido geral” e “Não há download automático nesta etapa” da copy principal. Manter texto simples e honesto: equipe retorna para combinar visita/enviar material. |

Algumas sugestões editoriais alteram copy aprovada na Etapa 2. Devem ser reconciliadas no Chat Alto antes da correção, sem usar a auditoria para inventar fatos ou reabrir toda a estratégia.

## 6. Testes funcionais realizados e resultado

| Teste | Método nesta rodada | Resultado |
|---|---|---|
| Abrir a prévia e comparar com anterior | Navegação real; metadados Vercel e DOM | Prévia acessível na sessão autorizada; H1 e organização novos confirmados. |
| Cinco plantas | Clique nas cinco opções, leitura de imagem/área/suítes/título/path/WhatsApp | Coerentes para Tipo 2, Tipo 3, Tipo 1, Duplex 2/3 e Duplex 1. Não foi declarado estoque. |
| Teclado nas plantas | ArrowRight a partir do Tipo 1 | Foco e seleção foram ao duplex de 93 m². |
| Rota direta de planta | Entrada na URL do duplex Tipo 1 com `#opcoes-flow` | Abriu em 117,7 m²/3 suítes; escolhas perto de 160 px do topo; canonical específico e noindex. |
| Zoom | Abrir, aproximar duas vezes | 100% → 200%; ampliação funcional. Fonte pequena continua sem detalhe novo. |
| Foco/fechamento | Tab e Shift+Tab no visor; Escape | Foco observado dentro do diálogo; Escape fechou e devolveu foco ao acionador. Não equivale a auditoria com leitor de tela. |
| Plantas do 5º/24º | Abrir os dois visores e fechar por Escape | Título e legenda corretos; fechamento funcional. |
| Vistas | 3 direções × 12 alturas, rótulo/alt/path/contexto | 36 combinações coerentes. Preservação do pavimento entre direções ainda precisa ajuste. |
| Slider de vista por teclado | ArrowRight no controle | Mudou da referência 19º para 21º na direção dos morros, conforme níveis existentes. Não há fotografia de cada pavimento. |
| Ampliar drone | Abrir e fechar visor | Título direção/altura e nota de referência coerentes. |
| Hero | Reprodução e pausa no navegador | Reproduziu; pausa manual funcionou. Código também pausa fora da tela/aba; não foi medido consumo de dados. |
| Quatro vídeos verticais | Acionar cada player e observar avanço/readyState | 1601, obra, Augusto e Natália atingiram readyState 4 e avançaram; foram pausados. Sem escuta integral. Nenhum tinha `<track>` carregado. |
| Formulário vazio | Clique sem nome/telefone/consentimento | Erros locais apresentados. O código retorna antes de `fetch`; não houve envio de contato válido. |
| Alternar visita/apresentação | Botões de modo e inspeção do formulário | Um formulário visível por vez; sem data solicitada nem promessa de reserva/agenda confirmada. |
| Contexto WhatsApp | Leitura dos `href`, sem abrir conversa | Tipo/área/suítes no CTA de planta e no contato; direção/altura no CTA de vistas; referência de visita preservada. |
| FAQ | Abrir pergunta da praia | Texto informa aproximadamente 800 m e limitações do acesso, sem tempo caminhável. |
| Barra móvel | Inspeção no contato e no código; confronto com nove estados documentados | Ausente no contato final observado; não cobre o formulário nesse estado. Teclado virtual físico não homologado. |
| Compartilhar | Código e teste de clipboard documentado na Etapa 3 | URL gerada da planta correta; compartilhamento nativo/dispositivo não repetido nesta rodada. |

### O que é simulação, o que é real e o que falta

**Real nesta auditoria:** navegação e interações de página na prévia protegida, estados renderizados, mídia, URLs, foco e validação local vazia.

**Simulado pelo Codex na Etapa 3, evidências consultadas:** falhas/sucessos de formulário, RPC HTTP fictícia local, preservação de DDI/UTM e evento `request_material`. O relatório e os JSON deixam essa separação explícita. Não foram substituídos por envios reais nesta etapa.

**Não homologado:** lead chegar ao CRM, deduplicação no banco real, atendimento/tempo de resposta Nara, retorno humano, confirmação de agenda, envio de apresentação e processamento dos eventos no painel. Isso deve constar como pendência operacional antes de lançamento; não exige alterar banco para concluir a revisão visual.

### Promessas falsas: conferência específica

- `FormLead.tsx` exige HTTP bem-sucedido, `ok === true` e `gravado === true` para mostrar sucesso. A API pode retornar `gravado:false`; o front trata isso como falha recuperável.
- Visita é pedido; data/horário são combinados pela equipe. Não se coleta uma data sem contrato de persistência.
- Book/apresentação: mensagem de solicitação recebida; sem promessa de entrega instantânea. O Flow emite `request_material`, não `download_material`.
- Solicitação Flow não emite `request_visit` como evento de agenda confirmada; formulário não é contado como `view_price`.
- CTA de vistas não presume disponibilidade; vídeo 1601 não anuncia estoque.

**Conclusão:** os P0 de contrato identificados na Etapa 1 foram tratados no caminho de interface inspecionado. A comprovação de funcionamento real depende de teste operacional separado.

## 7. Responsividade e apresentação visual

| Largura efetiva | Evidência ao vivo | Avaliação |
|---:|---|---|
| **360 px** | Documento sem overflow horizontal geral; plantas em 2 colunas com quinta opção na linha inteira; Move em 2 colunas; vistas `contain` | Cabeçalhos e cards cabem estruturalmente. Miniaturas têm aproximadamente 145 px de largura e pouco espaço para demonstrar o ambiente. |
| **390 px** | Mesma estrutura, miniaturas próximas de 160 px; formulário alternável e barra final ausente | Seleção acessível; ainda exige muita rolagem. Prancha duplex inteira não é leitura confortável sem zoom. |
| **768 px** | Dois cards por linha e painel de planta empilhado; documento sem overflow | Área grande de planta e espaçamento podem alongar a página sem ganho proporcional. Convém revisar proporção do quadro e densidade. |
| **1024 px** | Plantas em 5 colunas, Move em 3, Roof em 3; documento sem overflow | Transição de layout funciona. Revisar hierarquia das fotos do Roof e comprimento dos textos/CTAs. |
| **1440 px** | Plantas em 5 colunas; Move em 5; Roof em 3; vistas com painel lateral | Claro e coerente com a marca. Fotos pequenas do Move e piscina sem protagonismo reduzem impacto. |

O documento tem largura menor que `innerWidth` pela reserva de barra de rolagem do ambiente. Isso não é perda de conteúdo. Não foi reproduzido transbordamento geral; a navegação interna usa rolagem horizontal própria no celular.

### Ajustes visuais recomendados

1. Manter logo, paleta e fontes. Refinar a densidade, não substituir identidade.
2. Tratar a piscina como imagem principal do Roof no desktop, com demais ambientes em apoio; usar `piscina.jpg` atual.
3. No Move, dar espaço suficiente a um ambiente ativo, com seletor ou galeria, em vez de depender de cinco miniaturas. Todas as imagens devem continuar acessíveis sem navegação confusa.
4. Oferecer plantas de lazer em botão/preview proporcional e visor, sem exigir que as duas pranchas dominem a rolagem. É recomendação de composição, não remoção de informação.
5. Tornar andar/direção/foto perceptíveis juntos no celular; o panorama atual mantém proporção, mas sua altura útil fica pequena.
6. Manter a barra móvel recolhida em modal/menu/campo/contato. Revalidar em aparelho físico antes de publicar.

## 8. Problemas P0, P1 e P2 com evidências

**Critério:** P0 = impede uso crítico ou induz erro grave reproduzido; P1 = corrigir nesta rodada para qualidade/clareza comercial; P2 = refinamento ou melhoria secundária. A classificação não transforma material pendente em fato disponível.

### P0

**Nenhum P0 novo reproduzido nos caminhos testados.** Permanecem como condição de lançamento a homologação operacional do atendimento e a ausência de falso sucesso. Não atribuir “aprovado em produção” a simulações locais.

### P1

| ID | Problema/evidência | Correção objetiva | Critério de aceite |
|---|---|---|---|
| **P1-01** | Referências internas e redação defensiva no texto público. `engenhariaFlow` cita “especificação aprovada da Etapa 2”; obra/clientes/formulário expõem bastidores de validação | Reescrever benefícios e notas em linguagem de comprador. Guardar fonte editorial no conteúdo/documentação; quando houver fonte pública útil, torná-la acessível. Manter limites factuais em notas concisas | Nenhum texto público cita etapa de desenvolvimento, conteúdo aprovado do site, registro interno de autorização ou “nesta etapa” do sistema. Não remover informações materiais de distância, previsão, caráter ilustrativo e confirmação posterior |
| **P1-02** | Plantas Tipo 2/3 de 423×539 e 429×539; Tipo 1 de 880×528. Ampliar funciona, mas a fonte limita leitura | Recuperar originais em alta; exibir desenho com aproveitamento de área. Acrescentar explicação funcional validada e render tipo somente após vínculo comprovado | 62/73 m² identificados corretamente; circulação e ambientes legíveis no visor; sem extrapolar geometria; fallback honesto enquanto falta fonte |
| **P1-03** | Troca de direção em `VistaAndares.tsx` preserva índice. Reproduzido 20º/mar → 19º/morros | Preservar pavimento quando disponível. Se não existir referência naquela direção, avisar e selecionar altura disponível explicitamente | Nunca mudar a altura silenciosamente. Testar interseções e ausência de andar entre as três listas; não inventar foto de pavimento |
| **P1-04** | Imagens do Move ficam pequenas; Roof em três colunas sem piscina principal no desktop. Evidência CSS/render e capturas do mesmo commit | Reorganizar galeria com um destaque e acesso claro aos demais; piscina ampla com acervo atual; rever altura padrão de pranchas | Desktop e mobile mostram pelo menos um ambiente em escala convincente; todas as fotos e plantas continuam ampliáveis; sem novo render obrigatório |
| **P1-05** | Engenharia sem foto técnica e fontes genéricas; obra mostra “data de captura a confirmar” e título “projeto está no papel” | Inserir provas reais identificadas quando fornecidas; confirmar data do vídeo; ajustar título ao avanço documentado; evitar vender cumprimento genérico como exclusividade | Benefício compreensível e evidência correspondente; boletim/mês visíveis; sem novo percentual, data ou certificado inventado |
| **P1-06** | Distância só aparece tarde; faltam vagas e correspondência final/tipo/vista para comparação de unidade | Facilitar acesso à localização ou ficha factual após plantas; obter confirmação de vagas e mapa técnico; se não houver, manter pendente e encaminhar consulta | 800 m anunciados são encontráveis sem percorrer tudo; nenhum vínculo unidade/vista/vaga é inferido; hero aprovado não precisa ser refeito |
| **P1-07** | `acessibilidadeVideosFlow` vazio; quatro players sem `<track>` nesta rodada. Legendas incorporadas não tiveram cobertura integral revisada | Fornecer/revisar legendas e transcrições dos vídeos; preencher suporte já existente | Fala acessível com som desligado e alternativa textual; revisão humana da fidelidade; sem gerar transcrição presumida |

### P2

| ID | Problema/evidência | Recomendação / aceite |
|---|---|---|
| **P2-01** | Ao trocar planta, `document.title` muda, mas canonical/OG/description permanecem do documento inicialmente carregado; rota direta é correta | Definir comportamento coerente para navegação cliente e preservar URLs diretas. Conferir geral→planta e planta A→B; não quebrar scroll/campos por navegação desnecessária |
| **P2-02** | `FlowPagina` emite ApartmentComplex/FAQ; BreadcrumbList presente na versão antiga não aparece no DOM novo | Restaurar migalhas coerentes se fizerem parte do padrão do site. Não tratar ausência como falha de indexação por si só |
| **P2-03** | Corpo e FAQ incluem expressões que envelhecem (“não representa nova medição em outubro”) | Data absoluta e fonte; não depender de reescrever a cada mês para continuar verdadeiro |
| **P2-04** | Duração dos vídeos não aparece no novo acionador; há grande presença de vídeo vertical na rolagem | Exibir duração conhecida e contexto humano curto; preservar controles e carregamento sob interação |
| **P2-05** | Copy do contato repete ações equivalentes e inclui frases de implementação | Uma ação principal de visita e uma alternativa; apresentação como opção secundária/terciária; confirmação posterior clara em uma nota |
| **P2-06** | Hero usa `preload="none"`, mas `play()` inicia download quando visível; economia de dados não está implementada por esse atributo sozinho | Se necessário, oferecer poster/opt-in sob preferência de dados; medir antes de otimizar. Não anunciar redução de tráfego sem medição |

## 9. Acervo de 91 mídias: uso e adequação

O arquivo `Inventario_91_Midias_Flow.csv` acompanha este relatório com caminho real, dimensões, tamanho e classificação de cada arquivo.

| Situação | Quantidade | Significado |
|---|---:|---|
| Referenciadas pela interface | **67** | 21 arquivos de `img/flow/`, 36 quadros selecionáveis de vista, 5 plantas selecionáveis e 5 vídeos. Não significa que 67 arquivos carregam na abertura |
| Somente dados estruturados | **1** | `img/flow-fachada-noite.jpg`, usado na imagem do ApartmentComplex; OG atual usa piscina |
| Sem uso direto na landing atual | **23** | Alternativas/versões antigas, hall, logos em outras cores, renders e slides disponíveis |
| Total conferido | **91** | Nenhuma mídia modificada em relação ao acervo auditado anteriormente |

### Arquivos efetivamente referenciados

- `site/public/video/flow/`: `abertura.mp4`, `unidade-1601.mp4`, `obra.mp4`, `augusto.mp4`, `natalia.mp4`.
- `site/public/img/flow/`: `abertura-poster.jpg`, `logo-claro.png`, `coworking.jpg`, `fitness.jpg`, `flow-store.jpg`, `playground.jpg`, `cine-flow.jpg`, `planta-flow-move.jpg`, `piscina.jpg`, `rooftop-aereo.jpg`, `salao-festas.jpg`, `pub.jpg`, `brinquedoteca.jpg`, `planta-the-roof.jpg`, `duplex-tipo23-living.jpg`, `duplex-490.jpg`, `localizacao-aereo.jpg`, quatro posters (`poster-unidade-1601`, `poster-obra`, `poster-augusto`, `poster-natalia`).
- `site/public/img/flow/vista/`: `a-00` a `a-11`, `b-00` a `b-11`, `c-00` a `c-11`, todos JPG.
- Plantas em `site/public/img/`: `flow-planta-tipo2.jpg`, `flow-planta-tipo3.jpg`, `flow-planta-tipo1.jpg`, `flow-planta-duplex-tipo23.jpg`, `flow-planta-duplex-tipo1.jpg`.

### Bom material hoje sem uso direto

`piscina-2.jpg`, `hall.jpg`, fachadas dia/noite, `suite-duplex.jpg`, `duplex-fachada.jpg`, `duplex-living-verde.jpg`, logos bronze/grafite e `flow-apto-tipo-slide.jpg`. Há versões duplicadas/alternativas no diretório `img/flow-*`; não contar cada exportação como uma perspectiva arquitetônica diferente.

**O acervo atual é suficiente para uma apresentação premium das áreas comuns.** A melhoria imediata é de curadoria, escala e sequência. As lacunas reais estão nas plantas, apartamento tipo identificado, prova técnica real e acessibilidade dos vídeos.

### Materiais adicionais realmente úteis, por prioridade

| Prioridade | Material | Resolução/formato e enquadramento | Conteúdo / local de inserção |
|---|---|---|---|
| **P1 indispensável para leitura final** | Originais Tipo 1/2/3 | PDF vetorial preferencial; exportação limpa de 2000–3000 px no lado maior, vista superior sem perspectiva | Mesmas plantas oficiais, medidas e geometria; seletor e visor. Substituir fontes, não redesenhar por IA |
| **P1 comercial** | Identificação e original limpo do living tipo existente | JPG/PNG em origem, ideal 2400 px ou mais; enquadramento horizontal mostrando integração/circulação e uma versão móvel bem composta | Confirmar se corresponde a 62 ou 73 m². Seletor/apoio da seção Plantas. Primeiro recuperar `flow-apto-tipo-slide.jpg` sem tarja; só encomendar algo novo se o original adequado não existir |
| **P1 prova** | 3–6 fotos reais de qualidade executada | Lado maior ≥2400 px; uma foto de contexto e uma de detalhe por tema; horizontal e vertical quando possível | Isolamento, impermeabilização/teste, exaustão, esquadria/assentamento/controle, apenas o que estiver executado. Data, local e identificação; cartões de engenharia |
| **P1 acessibilidade** | Legendas e transcrições revisadas | WebVTT UTF-8 e texto; não depende de novo vídeo/render | 1601, obra, Augusto e Natália; usar suporte já existente em `content/flow.ts` e `Clientes.tsx` |
| **P1 confirmação** | Data do vídeo da obra e registro recente existente | Recuperar original/metadata e validar com equipe; se houver captura recente, foto horizontal ≥2400 px e vertical de apoio | Bloco da obra. Não datar pela data do arquivo exportado nem vincular filmagem ao boletim sem comprovação |
| **P2 leitura** | Duplex por piso | PDF vetorial ou exportações oficiais separadas, 2000 px ou mais no lado maior | Visor da tipologia, mantendo prancha completa como opção; não reconstruir piso a partir de suposição |
| **P2 dados** | Quadro técnico final/tipo/unidade/orientação | Documento técnico aprovado; não é material artístico | Habilitar vínculo seguro entre unidade e referência de vista no futuro. Até receber, vistas independentes |
| **P2 opcional** | Corte de obra de 20–40 s, se já existir | Original 1080p, uma composição vertical e outra horizontal, com data | Atualizar apoio do bloco de obra. Não gerar obra fictícia e não repetir o vídeo longo se o corte nada acrescentar |

Não são necessários novos renders de piscina, pub, salão, playground, coworking ou um novo vídeo principal para corrigir a página. Também não há demanda imediata por novas rotas ou drone: melhorar a utilização das referências existentes primeiro.

## 10. SEO e desempenho

### Conferido no HTML renderizado

- H1 único da abertura com mensagem aprovada; nome Flow em texto real e alt do logotipo.
- Title geral: `Flow Aptos | 2 suítes, lazer em dois pavimentos e entrega 2027 | Bossa`.
- Description identifica bairro, cidade, 62/73 m², duas suítes, duplex, dois pavimentos e previsão novembro/2027.
- `noindex, nofollow` presente; proteção Vercel preservada na configuração lida.
- Canonical geral aponta para a URL futura no domínio Bossa; rota direta de planta apresenta canonical específico.
- OG/Twitter usam piscina; OG declara 2400 × 1412, compatível com o arquivo existente.
- JSON-LD inclui ApartmentComplex, FAQPage e Organization; sem Offer, preço ou disponibilidade inventados.
- Nenhuma imagem do `main` estava sem atributo alt no inventário DOM. Posters usam alt vazio e player com nome acessível; isso não substitui legenda/transcrição de fala.
- Imagens já carregadas examinadas não apresentaram naturalWidth zero. Isso não prova ausência de toda falha de rede futura ou de todas as URLs fora da página.

### Pendências

Coerência de metadados após troca cliente, migalhas se exigidas pelo padrão, qualidade de alt para renders vinculados a duplex e legenda/transcrição. O schema mantém a distância como `800 m`; se a copy passar a enfatizar aproximação/metodologia, revisar também o dado estruturado, sem criar precisão diferente.

### Desempenho

Há boas escolhas: `next/image`, formatos WebP/AVIF configurados, vídeos verticais inseridos apenas ao clicar e hero com pausa e observação de visibilidade. `preload="none"` não impede o download quando `play()` é chamado.

O relatório da Etapa 3 contém uma medição local curta. Ela não foi reproduzida em rede móvel real ou na prévia remota e não foi usada para atribuir pontuação nesta auditoria. Não há número novo de LCP, INP, CLS ou Lighthouse neste parecer.

Para a próxima candidata, medir com condição declarada: dispositivo/viewport, rede/CPU, cache, número de repetições e origem local/remota. Verificar bytes iniciais, vídeo do hero, fontes, imagens acima da dobra e deslocamentos de layout. Manter preview protegido/noindex durante toda a correção.

## 11. Tarefas prontas para orientar o Codex

| Tarefa | Arquivos principais | Entrega esperada / aceite |
|---|---|---|
| **A. Limpeza editorial pública** | `site/src/content/flow.ts`, `site/src/components/flow/FlowPagina.tsx` | Resolver P1-01 e copy de obra/contato/FAQ. Sem referências a etapas de desenvolvimento. Preservar distância, data do boletim, caráter ilustrativo e confirmação posterior |
| **B. Escala e curadoria do lazer** | `FlowPagina.tsx`, `site/src/styles/flow.css`, `Experiencia.tsx` | Resolver P1-04 com mídias atuais. Piscina principal desktop; Move legível; plantas de pavimento com acesso simples; sem reintroduzir percurso longo antes dos apartamentos |
| **C. Seleção de altura estável** | `site/src/components/flow/VistaAndares.tsx` | Resolver P1-03; teste de andar comum e ausente entre direções, teclado, CTA e modal. Sem interpolar imagem nem vincular unidade sem mapa técnico |
| **D. Leitura das plantas** | `PlantasFlow.tsx`, `flow.css`, ativos oficiais recebidos | Trocar fontes quando fornecidas; detalhes funcionais somente documentados; separar pisos se houver fonte; não atribuir render incorreto |
| **E. Provas e vídeos** | `content/flow.ts`, `Clientes.tsx`, `FlowPagina.tsx`, mídias reais recebidas | Inserir fotos/data/fontes confirmadas e legendas/transcrições. Se faltar material, registrar pendência e manter texto factual, sem fabricar prova |
| **F. Acesso à localização e dados da unidade** | `FlowPagina.tsx`, `content/flow.ts` | Ficha/resumo ou acesso rápido aprovado; confirmar vagas separadamente; não inserir preço/estoque de memória |
| **G. SEO e regressão final** | Rotas em `site/src/app/empreendimentos/`, `flow.ts`, `FlowPagina.tsx`, `seo.ts` se necessário | Coerência de rota direta/troca, noindex/SSO intactos, regressão de Alma/Soul/Jazz e dos formulários compartilhados |

Os caminhos curtos dessa tabela são dentro de `site/src/components/flow/`, salvo onde o prefixo completo foi dado. Não modificar a aplicação CRM da raiz, migrações, banco, Nara, Wix, DNS ou configurações de produção.

### Critérios de aceite da próxima rodada

1. As cinco tipologias mantêm nome, área, suítes, imagem correta e CTA contextual; tipos com duas suítes não se confundem com duplex.
2. A rota compartilhável abre na planta correta; recarga, voltar, troca por teclado e preservação de campos funcionam.
3. Modal permite ampliar/reduzir/ajustar, arrastar e usar teclado; foco fica contido e retorna à origem; Escape fecha.
4. Trocar direção mantém o pavimento quando disponível e comunica a alternativa quando não existe referência naquela altura. As 36 imagens continuam correspondentes aos rótulos.
5. Fotos de lazer são legíveis e desejáveis em 360/390/768/1024/1440; pelo menos uma imagem por conjunto recebe escala principal; plantas de lazer continuam acessíveis.
6. Textos públicos não mencionam etapa de especificação, aprovação interna ou estado de implementação. Benefícios são claros, sem garantias absolutas.
7. Distância anunciada é encontrável e não é convertida em rota/minutos não medidos; nenhuma disponibilidade, vaga ou vista de unidade é inferida.
8. Obra tem data do boletim e do registro visual quando confirmada; percentuais não são atualizados por suposição; vídeos têm alternativa acessível revisada.
9. Formulário só mostra registro concluído com contrato explícito de sucesso. Visita continua solicitação; apresentação não conta como download; não testar dados reais sem autorização específica.
10. Executar simulações de falha/sucesso separadas de testes operacionais. Registrar quais foram locais, remotos, simulados e reais.
11. Capturas novas da próxima candidata em desktop e celular; conferir aparelho físico/teclado virtual e Safari/iOS antes do lançamento, com limitações declaradas se não disponíveis.
12. `typecheck` e build em `site/`, regressão de componentes compartilhados e dados Alma/Soul/Jazz; lint conforme configuração efetivamente disponível. Nenhum merge/publicação automática.

## 12. Capturas e evidências do pacote

Consulte `Capturas_Indice.md`. Arquivos sem prefixo `etapa3-` são capturas aproveitáveis desta auditoria remota; os arquivos com esse prefixo vêm do relatório do Codex e representam o mesmo código da prévia, com origem identificada. O recorte móvel de plantas é área do documento, não prova de posição final de todas as barras no viewport.

- `Evidencias_Navegador_Etapa4.json`: leituras desta auditoria (plantas, 36 vistas, dimensões, formulários, vídeos, SEO e comparação). Conteúdo técnico para reprodução, sem registros de clientes.
- `Inventario_91_Midias_Flow.csv`: inventário individual do acervo.
- Capturas da Etapa 3: apoio visual e comparação; estados de sucesso simulado não foram usados como comprovação de integração real.

## 13. Referências fixas no repositório

Todos os links de código abaixo usam o commit da prévia auditada.

- [Especificação Etapa 2](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/docs/flow/fontes/Bossa_Flow_Etapa2_Especificacao_2026-10-22.md)
- [Relatório Etapa 3 atualizado no HEAD consultado](https://github.com/fabionicodemus-lang/bossa-crm/blob/ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b/site/Flow_Etapa3_Relatorio_Implementacao.md)
- [FlowPagina.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/FlowPagina.tsx)
- [PlantasFlow.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/PlantasFlow.tsx)
- [VistaAndares.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/VistaAndares.tsx)
- [Experiencia.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/Experiencia.tsx)
- [Clientes.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/Clientes.tsx)
- [Conteúdo Flow](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/content/flow.ts)
- [flow.css](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/styles/flow.css)
- [FormLead.tsx](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/FormLead.tsx)
- [API de leads do site](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/app/api/leads/route.ts)
- [Evidências locais/simuladas da Etapa 3](https://github.com/fabionicodemus-lang/bossa-crm/tree/ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b/site/docs/flow/etapa3)

**Encaminhamento:** reconciliar as correções editoriais e a composição visual propostas, executar as tarefas pequenas no PR/branch de revisão, produzir nova prévia protegida e verificar os critérios acima. Esta auditoria não autoriza merge nem publicação.
