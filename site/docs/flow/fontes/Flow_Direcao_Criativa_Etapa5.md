Fonte: https://chatgpt.com/space/page_311a3538ff8481919eb38b3a68d302a9
Leitura integral em 22/10/2026. Implementação autorizada pela solicitação atual de Fábio; este documento é referência de conteúdo e composição.

A decisão criativa é elevar o Flow de uma página predominantemente informativa para uma apresentação arquitetônica e comercial demonstrativa: primeiro o apartamento, depois a experiência dos dois pavimentos de lazer, em seguida a escolha de altura, as provas construtivas e a visita.

**Status:** especificação de direção criativa para implementação futura. Não autoriza merge, publicação, mudança de código, CRM, banco, DNS ou proteção da Vercel.

**Base auditada:** PR #130 em feat/flow-posicionamento-2026; HEAD ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b, código da prévia b98cc77f2cc70969287f1250ddd7a92c2e78d0d7. Auditoria da Etapa 4, de 22/10/2026, com nota editorial 7,3/10. Especificação de Etapa 2 e relatório de Etapa 3 considerados. São avaliações editoriais, não resultados de conversão medidos.

# 1. Decisão de arte e arquitetura

## Identidade visual intocável

- Logotipo oficial Flow e assinatura exata **“No ritmo da nossa vida.”**

- Mensagem principal exata **“Seu apartamento é só o começo.”**

- Grafite #4E4D5B; sálvia #B0B5AC; névoa #EDEDED; bronze #A88E69 apenas como detalhe.

- Saira para leitura e títulos; Michroma para micronavegação, rótulos e pequenos numerais. Não adotar serifas, dourado dominante, elementos genéricos de luxo ou um novo logotipo.

- Fotografia e render comandam o ritmo da página. Texto explica um benefício por vez. Notas técnicas ficam junto da informação que qualificam, sem repetir advertências a cada imagem.

## Gramática visual

- Desktop: conteúdo em grade editorial de 12 colunas, largura útil até 1320 px; imagens de desejo ocupam 7 a 12 colunas, e texto de apoio 3 a 5. Um bloco visual principal por capítulo. Intervalos de 80 a 112 px entre capítulos, ajustados em QA.

- Mobile 360/390 px: leitura em uma coluna, margens de 16–20 px, alvo de toque de pelo menos 44 px, títulos fluidos sem quebra abrupta, imagens com intenção editorial e botões sem empilhamento desnecessário.

- Não usar cinco fotos iguais e pequenas para ambientes diferentes. Uma imagem principal, depois uma seleção de duas a quatro imagens de apoio; todas ampliáveis.

- Movimento: transições de 250–450 ms e revelação suave apenas quando útil. Evitar parallax pesado, autoplay com som, carrossel automático e transições que mudem a altura sem indicação. Respeitar prefers-reduced-motion.

- Render = “Perspectiva ilustrativa”; drone = “Referência real de drone”; obra = “Registro real” acompanhado de data validada; histórico Jazz/Soul = foto real quando comprovada.

- Não usar imagem IA como prova de construção nem render de duplex como se fosse living de 62/73 m².

## Nova ordem da página

1. Hero e navegação.

2. Apartamentos tipo de 62 e 73 m² — experiência principal de escolha.

3. Duplex — dentro do capítulo de apartamentos, sem duplicação posterior.

4. Faixa factual curta com 800 m divulgados e link de localização.

5. The Roof — grande ápice visual; piscina antes de mosaico de apoio.

6. Flow Move — conveniência diária em galeria editorial.

7. Vistas e comparação de alturas.

8. Engenharia demonstrada.

9. Obra datada, entregas anteriores e depoimentos.

10. Localização aprofundada.

11. Conversão prioritária para visita.

12. FAQ enxuta e nota legal.

A antiga seção isolada “A vida acontece dentro e fora do apartamento” deixa de repetir dois renders e vira a transição textual entre apartamentos e lazer. Mantêm-se todos os ambientes acessíveis, sem a duplicação longa.

# 2. Especificação por seção

## 0. Cabeçalho e navegação

**Objetivo comercial:** dar orientação sem competir com imagens e CTA.

**Textos finais de interface:** “Plantas” · “Lazer” · “Alturas” · “Engenharia” · “Localização” · “Agendar visita”.

**Desktop:** manter cabeçalho global Bossa. Navegação Flow em linha fina abaixo dele apenas após a abertura, com indicação da seção ativa e CTA “Agendar visita” destacado em grafite. Sem duas faixas de igual peso.

**Mobile:** manter MENU global; transformar a navegação Flow numa ação compacta “Explorar o Flow” que abre lista de âncoras, sem barra de rolagem horizontal aparente. A barra inferior contextual aparece só após a primeira dobra, com “Plantas” e “Agendar visita”; recolhe quando modal, menu ou teclado estiver aberto e na seção final de contato.

**Mídia:** nenhuma.

**Interação:** âncoras corretas e foco visível; offset de rolagem não esconde título nem planta; navegação por teclado.

**CTA/destino:** “Agendar visita” → #visita. “Plantas” → #opcoes-flow. “Localização” → #localizacao-flow.

**Comprovação:** preservar a barra global e os comportamentos de acessibilidade atuais.

**Aceite:** nenhuma terceira barra redundante; sem trilho de rolagem horizontal visível no 360/390; nenhuma sobreposição de CTA com campos ou com o controle flutuante de acessibilidade.

## 1. Hero

**Objetivo comercial:** criar desejo imediato e dar escala do produto, sem vender a distância como atributo central.

**Sobremarca:** FLOW APTOS · NO RITMO DA NOSSA VIDA.

**H1 definitivo:** Seu apartamento é só o começo.

**Texto definitivo:** “Apartamentos de 62 e 73 m² com duas suítes. Duplex com três suítes. Flow Move no 5º pavimento e The Roof no 24º para ampliar as possibilidades de cada dia, no Balneário Perequê, em Porto Belo.”

**Fatos discretos:** “57 apartamentos” · “Lazer em dois pavimentos” · “Entrega prevista: novembro de 2027”.

**Desktop:** vídeo da fachada em tela ampla, conteúdo na porção esquerda inferior com largura de leitura de 520–650 px; logotipo uma única vez em destaque, H1 em duas ou três linhas, texto máximo de quatro linhas no desktop e uma hierarquia clara de botões. Preservar o contraste nos trechos claros do vídeo e conferir cookie banner em 1440 × 900.

**Mobile:** versão visual com torre/fachada reconhecível no enquadramento, gradiente legível, texto 15–20% mais conciso que o atual em altura de dobra, botão primário visível sem o usuário ter de procurar. O segundo botão pode ficar em texto/link discreto se a altura disponível for curta. A primeira seção deve ser perceptível após a rolagem.

**Mídia real:** site/public/video/flow/abertura.mp4 e site/public/img/flow/abertura-poster.jpg. Nenhum vídeo novo obrigatório.

**Interação:** vídeo sem som, pausa manual persistente, poster no modo de movimento reduzido e opção de carregar apenas poster conforme preferência de economia de dados; medir antes de afirmar ganho de performance.

**CTA/destino:** “Explorar as plantas” → #opcoes-flow; “Agendar visita” → #visita. “Ver a obra” permanece na navegação, não como terceiro botão hero.

**Comprovar:** poster e enquadramento móvel, direitos de uso do vídeo, data da previsão de entrega na fonte de empreendimento.

**Aceite:** leitura integral do H1 e CTA nos cinco breakpoints; sem vídeo que obstrua texto ou tome dados sem opção de pausa.

## 2. Apartamentos tipo — vitrine principal

**Objetivo comercial:** permitir imaginar a rotina dentro de 62/73 m² e entender diferenças reais de tipologia antes do contato.

**Rótulo:** OS APARTAMENTOS

**H2 definitivo:** O espaço certo para o seu jeito de viver.

**Texto definitivo:** “Nos apartamentos tipo, são duas suítes e configurações que acompanham rotinas diferentes. Compare as plantas, a orientação solar informada no projeto e escolha o desenho que mais combina com você.”

**Aba de cada tipo e microcopy obrigatória:**

- Tipo 2 · 62 m² · 2 suítes — “Sol da manhã.”

- Tipo 3 · 62 m² · 2 suítes — “Sol da tarde.”

- Tipo 1 · 73 m² · 2 suítes — “Sol da manhã no living e da tarde nas suítes.”

**Desktop:** seletor à esquerda ou acima, claramente organizado em “Apartamentos tipo” e “Duplex”; painel principal com planta oficial grande em uma metade e, na outra, área, suítes, orientação e três pontos destacados somente se realmente observáveis no desenho oficial. Dar maior prioridade visual ao desenho e a um eventual render validado de living. Não usar cinco cartões gigantes e idênticos como primeira interface.

**Mobile:** seletor de tipologia em chips/tabs grandes, rotulados e acessíveis, sem ícones minúsculos; planta em quadro quase na largura total, depois área, orientação, CTA e ampliação. A imagem não deve virar miniatura de 150 px. O visitante consegue selecionar 62 ou 73, entender a diferença e abrir a planta em alta com um toque.

**Mídias reais:** site/public/img/flow-planta-tipo2.jpg; flow-planta-tipo3.jpg; flow-planta-tipo1.jpg. Render potencial: site/public/img/flow-apto-tipo-slide.jpg, somente após confirmar correspondência e recuperar original sem tarjas. Não usar img/flow/apto-living.jpg como tipo sem prova.

**Interações:** troca de planta atualiza título, alt, URL compartilhável e contexto de atendimento; ampliação com zoom/pinça/teclado e retorno de foco. Se houver render de tipo comprovado, alternar “Planta” e “Ambiente”, sem usar a imagem do outro tipo.

**CTA/destino:** “Quero conhecer esta planta” → WhatsApp contextual com Tipo, área e suítes, sem disponibilidade presumida; ação secundária “Ampliar” e ícone “Compartilhar planta”. No painel, só um CTA comercial principal.

**Comprovar:** originais em alta; orientação aprovada; eventuais destaques geométricos por planta; vagas e unidade/final não comprovados permanecem omitidos.

**Aceite:** cada uma das três plantas lê-se sem pixelização grosseira em ampliação; 62/73 e 2 suítes nunca se misturam com duplex; rota direta, voltar, teclado, zoom e compartilhamento preservados.

## 3. Duplex — produto especial, no capítulo de apartamentos

**Objetivo comercial:** aumentar desejo pelo produto de três suítes sem prejudicar a escolha dos tipos.

**H2 definitivo:** Dois níveis. Outra forma de morar.

**Texto definitivo:** “Os duplex do Flow reúnem três suítes, living com pé-direito duplo e uma organização em dois níveis. Conheça as opções de 93 e 117,7 m².”

**Rótulos:** “Duplex Tipo 2 e 3 · 93 m² · 3 suítes” e “Duplex Tipo 1 · 117,7 m² · 3 suítes”. No segundo, detalhe aprovado: “Living com 4,90 m de pé-direito.”

**Desktop:** duas vitrines editoriais com render amplo por variante; comparação objetiva dos dois produtos e acesso às respectivas pranchas. Vídeo real da unidade 1601 como acionador compacto, sem fazer a página rolar por vários metros de player vertical.

**Mobile:** uma variante por vez, com render 4:5 ou 3:4 ajustado à composição, um botão de planta e um preview do vídeo. Evitar duas pranchas de pisos minúsculas lado a lado.

**Mídia real:** site/public/img/flow/duplex-tipo23-living.jpg, duplex-490.jpg, suite-duplex.jpg (opcional após validar tipologia), site/public/video/flow/unidade-1601.mp4 e poster-unidade-1601.jpg; pranchas em site/public/img/flow-planta-duplex-tipo23.jpg e flow-planta-duplex-tipo1.jpg.

**Interações:** alternar 93/117,7; abrir imagem; ver piso inferior/superior separadamente apenas se forem recebidos exports oficiais; vídeo acionado pelo visitante.

**CTA/destino:** “Ver a planta de 93 m²” / “Ver a planta de 117,7 m²” → seletor e rota da tipologia; “Conversar sobre este duplex” → WhatsApp contextual.

**Comprovar:** correspondência dos dois renders com variantes; medidas e pisos; data e identificação da unidade filmada. Vídeo 1601 é registro daquela unidade, não estoque disponível.

**Aceite:** 3 suítes e pé-direito corretos, sem render atribuído indevidamente; modal legível e vídeo acessível com legenda revisada.

## 4. Faixa factual antecipada

**Objetivo comercial:** remover a sensação de que a distância foi escondida, sem quebrar a narrativa.

**Texto definitivo:** “Balneário Perequê, Porto Belo · Aproximadamente 800 m da Praia do Perequê, conforme distância divulgada · Entrega prevista para novembro de 2027.”

**Desktop:** faixa horizontal fina após apartamentos; três informações separadas por linha discreta, sem fundo de alerta ou parágrafo de justificativa.

**Mobile:** duas linhas de dados claros; “Ver localização” aparece sem precisar percorrer o restante do site.

**Mídia:** nenhuma.

**CTA/destino:** “Ver localização” → #localizacao-flow.

**Comprovar:** distância continua sendo o dado comercial divulgado; não transformar em rota medida.

**Aceite:** localização encontrável no início da jornada; nenhuma promessa de minutos a pé.

## 5. The Roof — grande capítulo emocional

**Objetivo comercial:** fazer da piscina e dos encontros no 24º pavimento a imagem memorável do Flow.

**Rótulo:** THE ROOF · 24º PAVIMENTO

**H2 definitivo:** Lá em cima, o dia ganha outro ritmo.

**Texto definitivo:** “Piscina com infraestrutura para aquecimento, salão de festas, pub, brinquedoteca e espaço gourmet formam um pavimento para encontros, descanso e bons momentos.”

**Desktop:** abrir diretamente com piscina em peça editorial ampla, aproximadamente 8–12 colunas de largura; título e rótulo fora da área mais importante da fotografia ou com overlay de alto contraste. Depois, mosaico assimétrico: salão e pub com imagens médias; brinquedoteca e vista geral como apoio. Não repetir a piscina em miniatura logo acima.

**Mobile:** imagem inicial ocupa largura total do conteúdo e altura suficiente para reconhecer piscina/deck/ambiente; usar crop manual aprovado, não object-fit destrutivo. Demais ambientes em cards de largura relevante, um ou dois por tela, não cinco miniaturas concorrentes.

**Mídia real:** site/public/img/flow/piscina.jpg (principal); piscina-2.jpg (secundária se acrescentar perspectiva); salao-festas.jpg, pub.jpg, brinquedoteca.jpg, rooftop-aereo.jpg; planta-the-roof.jpg no visor. O render rooftop-aereo é vista geral, nunca legenda de ambiente gourmet específico.

**Interações:** galeria por toque/seta com controle explícito, sem autoavanço; abertura e zoom; link “Ver distribuição do 24º pavimento” revela a planta em modal ou expansão curta. Animação de entrada sutil.

**CTA/destino:** “Quero conhecer o The Roof” → #visita; CTA secundário técnico “Ver planta do pavimento” → visor de planta.

**Comprovar:** nomenclatura dos ambientes; infraestrutura para aquecimento, não piscina já aquecida; render ilustrativo; gourmet representado apenas onde o acervo permitir identificação correta.

**Aceite:** piscina é a maior imagem do lazer no desktop e tem escala convincente no 360/390; todas as áreas atuais permanecem acessíveis; planta não ocupa uma seção longa por padrão.

## 6. Flow Move — conveniência diária

**Objetivo comercial:** mostrar o benefício cotidiano do 5º pavimento, complementar ao desejo gerado pelo rooftop.

**Rótulo:** FLOW MOVE · 5º PAVIMENTO

**H2 definitivo:** Mais espaço para o dia acontecer.

**Texto definitivo:** “Coworking, fitness, Flow Store, lavanderia, Cine Flow e ambientes para brincar e pausar ampliam as possibilidades da rotina, dentro do próprio edifício.”

**Desktop:** painel principal de fitness ou coworking em 7–8 colunas, com conteúdo de uso ao lado; quatro miniaturas secundárias maiores em grade 2 × 2 ou seleção. Não repetir cinco fotos em colunas de 200 px. A lavanderia pode estar representada na planta sem precisar de render inexistente.

**Mobile:** uma imagem ativa em formato confortável e trilho de cartões com miniaturas legíveis; cada ambiente tem nome e benefício de até cinco palavras. Evitar galerias de duas colunas com cards de 145–160 px como exibição principal.

**Mídia real:** site/public/img/flow/fitness.jpg, coworking.jpg, flow-store.jpg, playground.jpg, cine-flow.jpg e planta-flow-move.jpg.

**Interações:** seleção de ambiente e legenda; visor ampliável; planta do pavimento via controle recolhível. Manter teclado e movimento reduzido.

**CTA/destino:** “Quero visitar o Flow” → #visita; “Ver planta do Flow Move” → visor da planta.

**Comprovar:** funcionalidade arquitetônica dos ambientes; não prometer horários, equipe, operação ou serviços específicos da lavanderia/loja.

**Aceite:** ao menos um ambiente é mostrado em grande escala; os outros continuam fáceis de encontrar; menos rolagem do que a sequência atual, sem excluir fotos.

## 7. Vistas — escolha da altura

**Objetivo comercial:** ajudar a comparar perspectivas reais e entender por que andar e posição na torre são atributos relevantes, sem inventar preço ou vista da unidade.

**Rótulo:** REFERÊNCIAS REAIS DE DRONE

**H2 definitivo:** Cada altura revela uma perspectiva.

**Texto definitivo:** “Explore referências reais de drone em diferentes direções e alturas. Compare o que se vê em cada posição e escolha as perspectivas sobre as quais deseja conversar com a Bossa.”

**Desktop:** imagem panorâmica grande à esquerda, painel enxuto à direita. Primeiro selecionar direção: “Para o mar”, “Para a baía” ou “Para os morros”; depois selecionar um pavimento realmente fotografado. O andar ativo aparece sobre a imagem e junto ao CTA. Modo opcional “Comparar duas alturas” mostra dois quadros da mesma direção, ambos com rótulo e altura reais.

**Mobile:** manter a foto em sua proporção panorâmica, sem corte; oferecer toque para ampliar. Colocar direção, pavimento atual e opções imediatamente abaixo da imagem. Para comparar, dois quadros empilhados legíveis, não duas fotos pequenas lado a lado. Não usar um slider solitário que o usuário precise interpretar sem saber o andar.

**Mídia real:** site/public/img/flow/vista/a-00.jpg até a-11.jpg; b-00.jpg até b-11.jpg; c-00.jpg até c-11.jpg. São 36 quadros, três direções, com listas de alturas distintas.

**Interação obrigatória:** ao mudar direção, preservar exatamente o pavimento se houver foto correspondente. Se não houver, selecionar a referência real mais próxima apenas com aviso visível e anunciado: “Não há foto do 20º para os morros. Exibindo o 19º.” Nunca mapear apenas pelo índice do array, como no código atual. Exibir o estado correto por teclado e leitores de tela. O modo comparar não inventa fotos intermediárias.

**CTA/destino:** “Quero conhecer opções nesta altura” → WhatsApp com direção + pavimento de referência selecionado, nunca unidade ou disponibilidade presumida. A visita pode ser sugerida na mensagem, mas não agendada automaticamente.

**Comprovar:** quadro de unidades, finais, orientação e vistas oficiais antes de relacionar foto a apartamento específico; condições comerciais/andares por unidade vêm da fonte autorizada, não do drone.

**Aceite:** 36 fotos continuam correspondentes aos rótulos; teste 20º/mar → morros não altera silenciosamente para 19º; a referência é claramente distinta da janela de uma unidade; comparação é funcional em 390/1440 e por teclado.

## 8. Engenharia — benefício ligado à prova

**Objetivo comercial:** aumentar percepção de valor pela qualidade executada e pelo histórico de engenharia da Bossa.

**Rótulo:** ENGENHARIA · JEITO BOSSA

**H2 definitivo:** O conforto começa antes dos acabamentos.

**Texto definitivo:** “Há decisões de projeto e execução que fazem diferença no uso diário. Conheça as soluções previstas para acústica, impermeabilização, esquadrias e exaustão no Flow.”

**Desktop:** três narrativas de prova em módulos editoriais: foto real grande de contexto + detalhe com legenda, benefício para morador e um dado técnico verificável. O quarto tema pode aparecer como faixa curta com acesso ao memorial. Evitar quatro caixas apenas com texto e referências internas.

**Mobile:** alternar uma foto real e um texto curto por tema; legenda visível sem abrir modal; fonte técnica acessível em “Ver detalhe”. Fotos devem mostrar a execução do Flow, e não imagem genérica de obra ou de IA.

**Temas e copy curta:**

- “Acústica: cuidado entre os ambientes.” — “As soluções especificadas entre lajes e divisas integram o projeto de conforto do Flow.”

- “Áreas molhadas: atenção antes do revestimento.” — “O boletim de setembro detalha impermeabilização e assentamento do box.”

- “Churrasqueira: exaustão prevista em projeto.” — “O sistema inclui coifa, damper e exaustão, conforme detalhamento a validar.”

- “Esquadrias: projeto e instalação.” — “Conheça a especificação e o estágio de execução das aberturas.”

**Mídia real:** fotos ainda não identificadas no acervo atual; reservar slots futuros em site/public/img/flow/engenharia/ sem mostrar placeholders vazios ao comprador. Na ausência delas, usar versão compacta factual e remeter ao boletim datado. Não usar renders como prova. Referência de boletim: /obras/flow-aptos/2026-09, conforme rota vigente.

**Interação:** zoom de foto real com legenda de data/local/etapa; “Ver etapa no boletim” para informação existente. Sem microanimação de medição ou selo fictício.

**CTA/destino:** “Conhecer a obra e os acabamentos” → #visita.

**Comprovar:** memorial aprovado, solução realmente executada e seu estágio, fotos originais com data/pavimento/serviço; não declarar norma ou desempenho sem documento. Nunca prometer isolamento absoluto, porcelanato infalível ou churrasqueira sem fumaça.

**Aceite:** nenhuma expressão como “aprovado na Etapa 2” ou “conteúdo do site” aparece ao cliente; cada benefício tem evidência ou é claramente descrito como previsão de projeto.

## 9. Obra, histórico e pessoas reais

**Objetivo comercial:** transformar informação de avanço em confiança para agendar visita.

**Rótulo:** ACOMPANHE A OBRA

**H2 definitivo:** A obra avança. Você acompanha cada etapa.

**Texto definitivo:** “O Flow tem entrega prevista para novembro de 2027. A Bossa publica boletins para acompanhar o andamento dos serviços e mostrar como o empreendimento está sendo executado.”

**Painel datado:** “57,87% · boletim nº 25 · setembro de 2026” e, no detalhamento desse boletim, “Estrutura concluída”, “Alvenaria: 94,55%”, “Esquadrias metálicas: 18%”. Não transformar esses percentuais em avanço de outubro.

**Desktop:** à esquerda painel de avanço datado e link de boletim; à direita imagem real ou vídeo de obra com data validada. Em seguida uma faixa visual menor “Bossa já entregou” com fotos reais de Jazz e Soul, e dois depoimentos acionáveis. Tirar os vídeos verticais de fluxo obrigatório longo.

**Mobile:** números e data no topo, vídeo com capa e duração, uma faixa horizontal de fotos das entregas e cartões compactos de depoimentos. A obra não deve parecer um vídeo sem contexto inserido ao final da página.

**Mídia real:** site/public/video/flow/obra.mp4, site/public/img/flow/poster-obra.jpg; /img/jazz-1.jpg e /img/soul-3.jpg; vídeos augusto.mp4 e natalia.mp4 e posters correspondentes.

**Interações:** “Ler boletim”; player acionado pelo usuário; depoimentos com duração conhecida e legenda/transcrição humanas revisadas; nenhum autoplay vertical.

**CTA/destino:** “Agendar visita para conhecer o Flow” → #visita. “Ler boletim de setembro de 2026” → /obras/flow-aptos/2026-09. Links de Jazz e Soul levam às suas páginas próprias.

**Comprovar:** data real do vídeo da obra, legendas, transcrições, identificação correta de clientes e direitos de uso; fotos reais das entregas e datas Jazz setembro/2019 e Soul dezembro/2023.

**Aceite:** medição sempre com data; sem “o projeto está no papel”; sem “data a confirmar” como destaque público; sem afirmação de obra fechada se esquadrias estavam em 18% no boletim citado.

## 10. Localização — resposta madura aos 800 metros

**Objetivo comercial:** informar a característica que mais gera objeção de forma transparente e oferecer a experiência completa para avaliação.

**Rótulo:** LOCALIZAÇÃO

**H2 definitivo:** Balneário Perequê. O endereço do Flow.

**Texto definitivo:** “Na Rua São José, 163, em Porto Belo, o Flow está a aproximadamente 800 metros da Praia do Perequê, conforme distância divulgada. O percurso efetivo depende do acesso utilizado.”

**Texto complementar curto:** “Conheça o endereço, os ambientes do edifício e a posição do apartamento para decidir o que faz mais sentido para a sua rotina.”

**Desktop:** imagem aérea ampla com marcador do empreendimento apenas se a posição estiver validada; painel com endereço, distância divulgada e botão para mapa. Sem mapa de tempo pedonal inventado.

**Mobile:** título e dado 800 m visíveis antes da imagem; botão de mapa claro, sem esperar até o rodapé. Não incluir promessas de “poucos minutos a pé”.

**Mídia real:** site/public/img/flow/localizacao-aereo.jpg. Se houver marcador, ele deve corresponder à localização aprovada.

**Interações:** abrir busca do endereço no Google Maps (não “rota medida”); link direto da faixa factual inicial para este bloco.

**CTA/destino:** “Ver endereço no mapa” → busca existente em https://www.google.com/maps/search/?api=1&query=Rua%20S%C3%A3o%20Jos%C3%A9%2C%20163%2C%20Porto%20Belo%20SC. CTA alternativo “Conversar sobre o Flow” → WhatsApp contextual.

**Comprovar:** endereço oficial, acesso São José/Santa Terezinha antes de nomeá-lo; distância apenas como divulgação comercial, não medição independente.

**Aceite:** 800 m claramente visível e acessível também pela navegação; nenhuma linguagem de desculpa, compensação universal ou comparação não comprovada com concorrentes.

## 11. Contato e visita — conversão principal

**Objetivo comercial:** transformar o interesse específico em pedido real de visita, sem confundir solicitação com confirmação.

**Rótulo:** CONHEÇA DE PERTO

**H2 definitivo:** Vamos conhecer o Flow de perto?

**Texto definitivo:** “Escolha a planta que mais chamou sua atenção e converse com a equipe Bossa. Vamos combinar uma visita e esclarecer as condições atuais para as opções de seu interesse.”

**Texto do formulário:** “Deixe seu contato. Nossa equipe retorna para combinar data e horário.” Campos essenciais: nome, telefone com DDI, consentimento obrigatório; sem data que o banco não registra.

**Desktop:** bloco editorial 40/60: uma boa imagem existente à esquerda (preferir detalhe arquitetônico/obra com legenda correta) e painel de contato à direita. Um único formulário padrão em destaque; WhatsApp como alternativa clara; “Solicitar apresentação do Flow” como link terciário que alterna o formulário, sem virar segundo CTA idêntico.

**Mobile:** um único caminho principal, “Solicitar visita”, seguido dos campos; WhatsApp secundário. A barra inferior fixa desaparece quando a área de contato está visível ou há foco no campo. Retornar a este bloco mantém a planta escolhida no contexto quando tecnicamente suportado.

**Mídia:** reaproveitar imagem validada já usada no site, sem criar render novo.

**CTA/destino:** “Solicitar visita” → FormLead visita (pedido); “Conversar pelo WhatsApp” → wa.me com contexto; “Solicitar apresentação” → FormLead book com mensagem de solicitação, não download instantâneo.

**Mensagens finais:** sucesso de visita: “Recebemos seu pedido. Nossa equipe entrará em contato para combinar a visita.” Sucesso de apresentação: “Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar a apresentação do Flow.”

**Integração desejada:** levar para atendimento, com segurança, origem Flow, ação de interesse, planta, área, direção e altura de drone quando selecionados. No WhatsApp, indicar “referência de drone” em vez de “vista da unidade”. Não afirmar que o formulário já grava todos esses atributos sem contrato validado; implementar somente nos campos realmente suportados ou usar mensagem contextual. Nara e encaminhamento humano exigem homologação operacional separada.

**Comprovar:** HTTP 2xx + ok=true + gravado=true antes de sucesso; consentimento, DDI, UTM e deduplicação quando autorizada; nenhuma visita confirmada automaticamente; evento request_material ≠ download_material.

**Aceite:** nenhum falso sucesso; falha mantém dados e oferece WhatsApp; UI apresenta um único CTA primário por estado; nenhum formulário fica sob barra fixa ou teclado.

## 12. FAQ e rodapé legal

**Objetivo comercial:** responder objeções remanescentes sem repetir toda a página.

**Título definitivo:** O que vale saber antes de visitar.

**Perguntas e respostas definitivas:**

1. **A que distância fica da Praia do Perequê?** — “A distância divulgada é de aproximadamente 800 metros. O percurso depende do acesso utilizado. Você pode consultar o endereço no mapa.”

2. **Quais apartamentos existem?** — “As plantas tipo têm 62 ou 73 m² e duas suítes. Os duplex têm 93 ou 117,7 m² e três suítes.”

3. **Como funcionam as áreas de lazer?** — “O Flow Move fica no 5º pavimento e o The Roof no 24º. Ambos reúnem os ambientes descritos nesta página.”

4. **Quando está prevista a entrega?** — “Novembro de 2027. A equipe pode esclarecer o cronograma e as condições contratuais da unidade de interesse.”

5. **Como acompanho a construção?** — “Pelos boletins divulgados pela Bossa. A edição nº 25, de setembro de 2026, registrou avanço geral de 57,87%.”

6. **Como confirmo unidade, andar, vagas e condições comerciais?** — “A equipe consulta as informações atuais da unidade de seu interesse e apresenta os detalhes confirmados.”

7. **Posso visitar?** — “Sim. Solicite uma visita; nossa equipe combina data, horário e as condições de acesso.”

**Desktop/mobile:** acordeão legível, seis ou sete itens no máximo, um aberto por vez se implementado sem prejudicar acessibilidade. Notas legais finais separadas e concisas; renders identificados como ilustrativos.

**Mídia:** nenhuma.

**Interação:** teclado, foco e anúncio de expansão; FAQ structured data coerente com o texto efetivamente mostrado.

**CTA/destino:** link “Solicitar visita” → #visita após o acordeão, sem novos formulários.

**Aceite:** sem frases que envelhecem como “não representa medição em outubro”; datas absolutas, nenhum dado não confirmado de preço/estoque/vagas.

# 3. Materiais visuais e dependências

## Acervo existente — maior retorno editorial

| Prioridade | Mídia real no repositório | Uso proposto |
|---|---|---|
| Máxima | site/public/img/flow/piscina.jpg | Imagem de grande impacto no The Roof |
| Alta | site/public/video/flow/abertura.mp4 e img/flow/abertura-poster.jpg | Abertura preservada, enquadramento refinado |
| Alta | site/public/img/flow-planta-tipo1.jpg, flow-planta-tipo2.jpg, flow-planta-tipo3.jpg | Seletor principal, substituir por originais quando recebidos |
| Alta | site/public/img/flow/fitness.jpg e coworking.jpg | Visuais principais do Flow Move |
| Alta | site/public/img/flow/salao-festas.jpg, pub.jpg, brinquedoteca.jpg, rooftop-aereo.jpg | Mosaico do The Roof |
| Alta | site/public/img/flow/vista/{a,b,c}-{00..11}.jpg | 36 referências reais de direção/altura |
| Alta | site/public/img/flow/duplex-tipo23-living.jpg e duplex-490.jpg | Vitrine do duplex, associação a conferir |
| Média | site/public/img/flow/planta-flow-move.jpg e planta-the-roof.jpg | Visor sob demanda |
| Média | site/public/video/flow/obra.mp4, augusto.mp4, natalia.mp4 | Obra e prova humana, com data/transcrição |
| Média | site/public/img/flow/localizacao-aereo.jpg | Localização transparente |
| Média | site/public/img/flow/piscina-2.jpg e hall.jpg | Avaliar após curadoria, sem aumentar a página por obrigação |

## Material adicional realmente necessário

1. **Essencial para nota 9+ nas plantas:** originais de Tipo 1, 2 e 3 em PDF vetorial ou 2000–3000 px no lado maior. Recuperar sem modificar geometria.

2. **Essencial para desejo no produto tipo:** identificar qual living pertence ao tipo de 62 e qual ao de 73 m²; recuperar o original limpo de flow-apto-tipo-slide.jpg se corresponder. Se não houver render validado, não inventá-lo.

3. **Muito importante para confiança:** 3–6 fotos reais do Flow (uma de contexto e uma de detalhe por frente, com data, pavimento, atividade e referência documental). Preferir isolamento/acústica, impermeabilização/teste, exaustão/esquadrias ou acabamento que já tenha sido executado.

4. **Acessibilidade e obra:** legendas WebVTT e transcrições fiéis de 1601, obra, Augusto e Natália; data comprovada do vídeo da obra.

5. **Opcional para visualização comercial futura:** mapa técnico aprovado final/unidade/planta/orientação, com vagas e dados reais, para vincular visualizador e oferta. Sem ele, fotos de drone permanecem referência independente.

**Não encomendar agora:** novos renders de piscina, pub, salão, coworking, novos drones, vídeo de fachada ou cenas de obra por IA. Há acervo suficiente de lazer; o gargalo é seleção e escala.

# 4. Priorização de implementação

| Prioridade | Alteração no PR existente | Arquivos candidatos | Resultado de aceite |
|---|---|---|---|
| P1 editorial | Remover bastidores, ressalvas repetitivas e título de obra inadequado | content/flow.ts, FlowPagina.tsx | Copy final clara, sem falsas garantias |
| P1 forte | Redesenhar plantas tipo e leitura móvel | PlantasFlow.tsx, flow.css | Tipo correto, painel grande, zoom e URL preservados |
| P1 forte | Piscina dominante e Flow Move em galeria editorial | FlowPagina.tsx, Experiencia.tsx, flow.css | Foto principal impactante em 360/390/1440 |
| P1 forte | Consertar direção/andar e comparação de alturas | VistaAndares.tsx | Andar jamais muda silenciosamente |
| P1 forte | Reduzir dupla navegação/barras e contato redundante | FlowPagina.tsx, flow.css | Hierarquia e CTA sem interferência móvel |
| P1 forte | Ficha factual 800 m antecipada | FlowPagina.tsx | Informação fácil de encontrar, sem medição inventada |
| P1 prova | Engenharia real e obra datada | content/flow.ts, FlowPagina.tsx, Clientes.tsx | Fotos/fontes válidas ou fallback factual |
| P1 prova | Render tipo validado e plantas em alta | Assets oficiais e PlantasFlow.tsx | Sem identidade de tipologia presumida |
| P1 acesso | Legendas e transcrições fiéis | content/flow.ts, Clientes.tsx, arquivos VTT | Vídeos compreensíveis sem áudio |
| P2 | SEO em troca SPA, duração, breadcrumbs e limpeza de CSS legado isolada | rotas, seo.ts, flow.css | Metadados coerentes, sem regressão |
| Gate de lançamento | Homologar recebimento de lead e Nara com autorização específica | Site e operação CRM, escopo separado | Pedido rastreável até atendimento real |

Não tocar a raiz do CRM, banco, migrações, Nara, produção, Wix, DNS, Vercel Authentication, robots, noindex ou trabalhos paralelos do Alma durante a direção criativa.

# 5. Critérios globais de aceite para buscar 9+

- **Clareza:** duas suítes dos tipos, três dos duplex, prazo previsto, 800 m divulgados, distinção entre áreas comuns e privativas; copy sem jargões internos.

- **Desejo:** ao menos um living tipo comprovado ou apresentação de planta suficientemente legível, piscina em destaque cinematográfico e Flow Move/rooftop sem miniaturas diminutas.

- **Diferenciação:** prova construtiva identificada e facilitação de comparação de alturas reais.

- **Confiança:** data do boletim, dados de obra, fonte de especificação e fotos reais; sem supor preço, vaga, disponibilidade, retorno financeiro ou vista garantida.

- **Mobile:** QA real em 360, 390, 768, 1024, 1440; sem barra de rolagem horizontal aparente, overlays, campo escondido; testar 200% de texto, teclado, zoom, leitor de tela e aparelho físico/Safari-iOS quando disponível.

- **Conversão:** visite como ação prioritária, WhatsApp contextual e registros honestos; sem tratar pedido como agendamento ou download.

- **Performance:** imagens responsivas, evitar download desnecessário de vídeo, lazy load fora da primeira tela, ausência de CLS visível; medir LCP/INP/CLS em condições declaradas antes de divulgar números.

- **Regressão:** build, typecheck, rotas das cinco tipologias, 36 vistas, eventos e formulários simulados; Alma/Soul/Jazz inalterados no conteúdo e no funcionamento compartilhado.

- **Produção:** manter preview protegido/noindex e PR em rascunho. Nova auditoria independente antes de qualquer decisão de merge/publicação.

**Critério editorial de chegada:** alcançar pelo menos 9/10 em clareza, desejo, diferenciação, confiança, mobile e conversão na nova avaliação, sem P0 reproduzido e com pendências operacionais explicitamente separadas. Uma nota 9+ não pode ser afirmada de antemão. Sem as plantas em alta e a prova visual real de qualidade, o ganho de layout provavelmente ficará limitado apesar das melhorias.

# 6. Fontes vinculadas

- [PR #130](https://github.com/fabionicodemus-lang/bossa-crm/pull/130)

- [Especificação Etapa 2](https://github.com/fabionicodemus-lang/bossa-crm/blob/ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b/site/docs/flow/fontes/Bossa_Flow_Etapa2_Especificacao_2026-10-22.md)

- [Relatório de implementação Etapa 3](https://github.com/fabionicodemus-lang/bossa-crm/blob/ca17fb8049757a2acfddcb20ca49ecd4d99ecc2b/site/Flow_Etapa3_Relatorio_Implementacao.md)

- [FlowPagina](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/FlowPagina.tsx), [PlantasFlow](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/PlantasFlow.tsx), [VistaAndares](https://github.com/fabionicodemus-lang/bossa-crm/blob/b98cc77f2cc70969287f1250ddd7a92c2e78d0d7/site/src/components/flow/VistaAndares.tsx)

- Auditoria Etapa 4 de 22/10/2026: Bossa_Flow_Etapa4_Auditoria.md, nota editorial 7,3/10.

**Encaminhamento:** aprovar esta direção como documento de referência; implementar futuramente em pequenas etapas no mesmo PR protegido, receber material visual crítico e submeter a nova auditoria independente. Nenhum merge/publicação é autorizado por este texto.
