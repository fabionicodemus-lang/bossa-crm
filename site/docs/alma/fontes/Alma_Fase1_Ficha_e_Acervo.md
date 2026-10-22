# Alma Sea Houses — Fase 1: ficha e acervo

**Data de corte da consulta:** 21/10/2026, horário de Brasília.  
**Finalidade:** base factual interna para definir os textos e a organização da página na fase 2.  
**Resultado:** organização concluída; há base suficiente para avançar na primeira versão, com pendências técnicas delimitadas. Não equivale a aprovação documental integral do empreendimento.

## 1. Escopo, versões e instruções observadas

- Repositório correto: [fabionicodemus-lang/bossa-crm](https://github.com/fabionicodemus-lang/bossa-crm), pasta `site/`, branch `main`.
- Página consultada: [Alma Seahouses](https://bossa-site-elos-os.vercel.app/empreendimentos/alma-seahouses). Resposta 200 e conteúdo HTML efetivamente obtido; consulta de conteúdo, sem auditoria visual interativa completa nem envio de formulários.
- Projeto confirmado na Vercel: `bossa-site`. Publicação consultada: `dpl_3J8Y9Ln4vZw38fK4u9HspTZMuwcF`, criada em 20/10/2026 às 12h00min49s, commit `31cd1510aeddd8ba0402f3ba09c43ffde6319f27`.
- GitHub consultado em cópia isolada no commit `d88fdd23d07f78dfe994df8e74445b9340153f14`. Comparação da pasta `site/` com o commit publicado: **sem diferenças**. Portanto, o conteúdo de `site/` analisado corresponde à versão publicada identificada, embora os commits gerais do repositório sejam diferentes.
- Lidos `README.md`, `site/README.md` e `site/CLAUDE.md` (documento datado de 19/10/2026). Não foi localizado `AGENTS.md` versionado no repositório consultado.
- Nenhuma alteração de código, variável, banco, domínio ou publicação. Nenhum contato enviado, formulário submetido ou dado de lead consultado.
- Acervo inventariado: **91 arquivos** relacionados ao Alma: 17 imagens na raiz de `public/img`, 32 arquivos diretamente em `public/img/alma`, 28 imagens de vistas, 11 imagens de estilo de vida e 3 vídeos. São arquivos, não 91 cenas diferentes: há versões alternativas do mesmo ambiente.
- Inspeção visual dos renders em prancha de contato; leitura individual das seis plantas; inspeção de quadros dos três vídeos e de suas dimensões/durações. Não se fez análise quadro a quadro nem transcrição do áudio do trajeto.

### Identidade a preservar

Assinatura: **“Sua casa na praia. feita para sua alma.”**. Paleta registrada: sálvia `#59695C`, oliva `#656635`, taupe `#696158`, pedra `#9D968D`, areia `#C4BFB6` e névoa `#D7D2CB`; fundos e variações já presentes em `alma.css`. Tipografia atual: Literata, Urbanist e Ephesis. Preservar curvas, arcos, linguagem natural dos renders e logotipos existentes. Não substituir a tipografia atual pela fonte citada no brand concept sem licença.

O objetivo editorial é comunicar acolhimento, intimidade, conforto, qualidade e vida familiar por meio do próprio projeto. A expressão “boutique familiar” fica restrita ao material interno. Os oito cases orientam a forma de demonstrar benefícios; seus atributos não comprovam nada sobre o Alma.

## 2. Fontes e critério de confirmação

| ID | Fonte efetivamente consultada | Data/versão e alcance |
| --- | --- | --- |
| F01 | `site/CLAUDE.md` | Datado de 19/10/2026; registra dados já confirmados por Fábio, orientações de marca, origem dos materiais e restrições de comunicação. É um registro de aprovação interna, não o memorial ou registro de incorporação. |
| F02 | `site/src/content/empreendimentos.ts` | Cabeçalho registra validação de Fábio em 16 e 17/10/2026; ficha, quatro plantas e edição nº 07 da obra. |
| F03 | `site/src/content/site.ts` | Conteúdo institucional aprovado na fase 4 de 17/10/2026; endereço do escritório atualizado em 20/10; acabamentos, perguntas, distâncias e estado padrão do Alma. |
| F04 | `site/src/components/alma/AlmaLanding.tsx` | Versão dos commits acima; conteúdo realmente usado na landing, lista de ambientes e de especificações, distâncias e chamadas. Aprovação da landing registrada em F01. |
| F05 | `site/src/components/SeletorPlantas.tsx`, `site/src/components/alma/Clientes.tsx`, rotas de plantas e obras | Identificação, ampliação, links de tipologia e tabela técnica de associação dos quadros de drone a andares/alturas. Configuração não é levantamento técnico. |
| F06 | `site/src/styles/alma.css` e imagens de logo | Identidade implementada e preservada. |
| F07 | Arquivos de `site/public/img/alma/`, `site/public/img/alma-*.jpg` e `site/public/video/alma/` | Inspeção local da versão GitHub; não têm revisão de projeto ou data de captura autenticada incorporada a esta ficha. Origem oficial de projeto indicada em F01, com ressalvas para lifestyle e drone. |
| F08 | HTML da página publicada e metadados da publicação Vercel | Consultados em 21/10/2026. Confirmam o que está sendo comunicado e o comportamento editorial de pré-registro; não comprovam a situação cartorial. |
| F09 | `src/data/alma-sales-table-2026-08.json` | Arquivo histórico do CRM identificado como agosto/2026 pelo nome; 48 registros de unidades, com status e preços. Não utilizado como estoque ou tabela vigente em outubro. Sem acesso aos leads. |
| F10 | `Alma_Acervo_Boutique_Familiar_8_Cases (1)(1).html`, anexado | Preparado em 21/10/2026. Referência estratégica interna, não ficha técnica do Alma. |
| F11 | `site/src/app/obras/[slug]/[mes]/page.tsx` e rotas do empreendimento | Confirmam como as edições e plantas são publicadas. A data estruturada da edição é construída como primeiro dia do mês; isso não comprova dia real de publicação ou de medição. |

**Estados usados:** “confirmada” significa sustentada pela fonte identificada, com o nível de comprovação descrito; “divergente” indica conflito entre fontes ou associação de conteúdo; “pendente” indica falta de evidência suficiente para a afirmação específica.

Preservam-se os dados explicitamente aprovados em F01–F03. O estudo F10 chama algumas áreas e o total de unidades de pendentes, mas isso não invalida a aprovação interna registrada no projeto. A ressalva documental permanece: não foram encontrados no repositório os PDFs originais `ALMA_brandconcept.pdf`, `Alma Seahouses - Folder Digital.pdf`, memorial, quadro de áreas, plantas executivas cotadas ou certidão de registro. F01 apenas informa sua origem no OneDrive/computador de Fábio, em `COMERCIAL/Material Site/Alma`. Esses originais não foram lidos nesta fase e não devem ser citados como documentos conferidos.

## 3. Ficha consolidada do empreendimento

### 3.1 Identificação e configuração

| Informação | Valor/descrição | Fonte e data/versão | Situação e limite |
| --- | --- | --- | --- |
| Nome | Marca no logo: Alma Sea Houses; nome técnico no conteúdo: Alma Seahouses | F01, F02, F06–F08 | Confirmada. Preservar logo e slug; diferença de grafia não indica outro produto. |
| Incorporadora | Bossa Empreendimentos | F01–F03, F08 | Confirmada como identificação institucional; CNPJ e documentação específica não conferidos. |
| Endereço | Rua Wilson Belber, 316, Balneário Perequê, Porto Belo/SC | F01–F04, F08 | Confirmada por aprovação interna; conferir cadastro/cartório apenas se necessário ao dossiê documental. |
| Esquina | Rua Felix Walendowsky | F04, F08 | Confirmada como conteúdo existente; sem levantamento cadastral independente nesta fase. |
| Apartamentos por andar | 2 | F01–F02, aprovação 16–17/10, F08 | Confirmada. Não deduzir silêncio, ocupação, ausência de filas ou número uniforme de moradores. |
| Total de unidades | 48 | F01–F02; F09 também contém 48 registros | Confirmada por aprovação interna, sem recalcular a partir dos 30 pavimentos. A tabela histórica não substitui o quadro de incorporação. |
| Pavimentos | 30 | F01–F02, F08 | Confirmada por aprovação interna. Não significa 30 andares com apartamentos. |
| Pavimentos de lazer | 2: pavimento de lazer/bem-estar e rooftop | F01–F02, F04 e duas plantas F07 | Confirmada. Número ordinal do primeiro pavimento de lazer depende de quadro oficial; F05 apenas o associa à altura 12,6 m. |
| Área de lazer divulgada | 850 m² em dois andares | F02 metadados, F04, F08 | Confirmada como comunicação aprovada existente. Critério de soma, áreas cobertas/descobertas e eventual inclusão de circulação: pendentes de quadro de áreas. Não dividir por ambiente. |
| Rooftop | 30º pavimento na comunicação; piso a 102 m | F01, F02 metadados, F04–F05 | Confirmada por aprovação interna; associação técnica das alturas sem levantamento independente. |
| Outras alturas | Teto a 107 m; altura total 112 m | F01; F02 e F04 citam pontos distintos | Confirmadas no registro interno. 102/107/112 m representam referências diferentes, não medidas concorrentes da mesma coisa. |
| Vagas | 2 em todas as quatro tipologias | F01–F02, F03, F08 | Confirmada por aprovação interna. Dimensões, tipo de vaga e vinculação por unidade pendentes. |
| Frente-mar | Não | F03, F08 | Confirmada. Renders e vistas não devem sugerir localização frente-mar. |

### 3.2 Tipologias e plantas

| Tipologia / identificador preservado | Área privativa divulgada | Suítes / vagas | Arquivos e comprovação | Situação |
| --- | --- | --- | --- | --- |
| Tipo 02 / `tipo-02` | 103 m² | 3 / 2 | F01–F03; `alma-planta-tipo-02.jpg` tem texto “Tipo 02 103m²” e três dormitórios com banheiros | Confirmada; sem cotas de ambientes. |
| Tipo 01 / `tipo-01` | 114 m² | 3 / 2 | F01–F03; `alma-planta-tipo-01.jpg` tem texto “Tipo 01 114m²” e três dormitórios com banheiros | Confirmada; sem cotas de ambientes. |
| Duplex Tipo 2 / `duplex-tipo-2` | 145 m² | 4 / 2 | F01–F03; usa as duas pranchas completas `alma-planta-duplex-inferior.jpg` e `alma-planta-duplex-superior.jpg` | Área e programa confirmados por aprovação interna; lado da unidade e limites a destacar pendentes. |
| Duplex Tipo 1 / `duplex-tipo-1` | 168 m² | 4 / 2 | F01–F03; usa as mesmas duas pranchas completas | Área e programa confirmados por aprovação interna; lado da unidade e limites a destacar pendentes. |

A família de plantas aprovada abrange **103, 114, 145 e 168 m²**, sem arredondar ou substituir esses valores. Não há base para áreas individuais de sala, quartos, cozinha, lavanderia ou circulação.

Living integrado à cozinha, lavabo e churrasqueira a carvão aparecem na descrição dos tipos e no texto da landing para todos os apartamentos (F02/F04). Pé-direito duplo dos duplex consta em F01/F02/F04 e nos renders; **altura em metros não foi localizada**. A frase de F02 sobre suíte master no piso superior do Duplex Tipo 1 depende da identificação técnica correta para receber setas ou comentários na imagem.

### 3.3 Áreas comuns e usos possíveis

Todos os itens abaixo são descritos no próprio projeto (F01/F04); as plantas e renders F07 sustentam a identificação visual, sem comprovar dimensões, lotação ou equipamento contratualmente incluído. Revisão original das imagens não informada.

| Pavimento | Ambientes registrados | Uso editorial permitido na fase 2 | Situação |
| --- | --- | --- | --- |
| Lazer/bem-estar | Piscina aquecida de formato orgânico, prainha, hidromassagem, jardins e garden solarium | Descansar e aproveitar a água | Confirmada por aprovação interna e renders. “Água morna o ano inteiro” é promessa operacional a revisar; aquecimento não garante operação contínua. |
| Lazer/bem-estar | Gourmet com churrasqueira junto à piscina | Reunir a família e receber amigos | Confirmada; usar imagens `gourmet-piscina*`, não `alma/gourmet.jpg`. |
| Lazer/bem-estar | Academia panorâmica e Espaço Vitalidade para yoga/funcional | Cuidar de si | Confirmada; não prometer aulas, instrutores ou serviço. |
| Lazer/bem-estar | Casa de banho sensorial com banheiras e sauna seca | Relaxar | Confirmada; não anunciar tratamentos de spa incluídos. |
| Lazer/bem-estar | Playground Casa da Árvore e pet place | Brincar e passear com o pet | Confirmada em F01/F04; playground visível em renders. Pet place não tem imagem individual inequivocamente identificada. |
| Rooftop | Salão de festas e Jantar Jardim | Receber e compartilhar refeições | Confirmada por F01/F04 e renders/implantação. |
| Rooftop | Pub View, Wine Bar e Fire Place | Conversar e conviver | Confirmada. Wine Bar não tem render próprio com identificação inequívoca; pode ser referido pelo conjunto descrito. |
| Rooftop | Brinquedoteca Floresta Encantada | Brincar | Confirmada, com render próprio. |
| Rooftop | Lounge das Pedras / terraço com jardins | Permanecer ao ar livre | Confirmada no texto e na implantação geral; sem render individual nominal. |

A indicação de rooftop com pé-direito duplo está aprovada em F01/F04. A frase “tudo tem pé-direito duplo e vista de 360°” não deve virar garantia de vista de cada ambiente ou unidade; terraços abertos e enquadramentos diferentes exigem linguagem precisa.

### 3.4 Entrega, obra e situação comercial

| Informação | Valor/descrição | Fonte e data | Situação / uso |
| --- | --- | --- | --- |
| Início da obra | Julho/2025 | F01–F03, F08 | Confirmada por aprovação interna. |
| Entrega prevista | Julho/2030 | F01–F03, F08 | Confirmada como previsão aprovada. Contrato/memorial não consultados; não prometer antecipação. |
| Última edição localizada | Nº 07, agosto/2026 | F02, F08; rota `/obras/alma-seahouses/2026-08` | Confirmada como última edição disponível nas fontes consultadas, não como última medição existente na empresa. |
| Avanço geral da edição | 10,52% | F01–F03, F08; referência agosto/2026 | Confirmada histórica. Nunca escrever “hoje 10,52%” ou atualizar sua data para outubro. |
| Avanço mensal informado | 1,92 no campo `avanco`, exibido como “+1,92% no mês” | F02/F08, agosto/2026 | Confirmado como valor publicado; método e unidade percentual versus pontos percentuais pendentes. Não recalcular sem medição. |
| Etapas da edição | Estacas hélice, blocos de fundação, cisterna/reservatórios e infraestrutura entre piso e laje a 100% | F02/F08, agosto/2026 | Confirmadas como relato datado; não equivalem a 100% da fundação em qualquer metodologia externa. |
| Próxima etapa anunciada | Concretagens de vigas baldrames e laje do térreo previstas para setembro | F02/F08, agosto/2026 | Confirmada como previsão histórica; execução efetiva posterior pendente. |
| Fotos/vídeo recentes da obra do Alma | Não localizados no acervo versionado | F07/F11 | Pendente. O vídeo `flow/obra.mp4` é do Flow e não deve ser reutilizado como Alma. |
| Estado de comunicação da página | Pré-registro; convite para registrar interesse | F03/F04 e HTML F08 de 21/10 | Confirmado como estado observado da página. Não foi necessário consultar variáveis privadas. |
| Situação cartorial atual | Registro em processo segundo conteúdo; F01 cita protocolo | F01/F03/F08 | Pendente de comprovação documental atual. Configuração `NEXT_PUBLIC_ALMA_ESTADO` e texto publicado não são certidão cartorial. |
| Estoque, preço e condições vigentes | Não determinados | F09 é tabela histórica de agosto/2026 | Pendentes. Nenhuma oferta, quantidade disponível, desconto ou correção foi validada para outubro. |
| Atendimento | WhatsApp `554792889395`; escritório na Rua São José, 163, térreo do Flow, Perequê/Porto Belo | F01/F03 e link efetivo F08 | Confirmados como canais do site. Não foi testada resposta real nem enviado contato. |

A primeira versão deve manter registro de interesse e conversa sobre projeto/planta, conforme as instruções do repositório. Uma eventual mudança para comunicação de venda depende da comprovação atual do registro e da aprovação comercial pertinente; esta fase não altera esse estado.

### 3.5 Especificações de conforto e confiança

| Grupo | Conteúdo existente | Fonte | Situação e limite |
| --- | --- | --- | --- |
| Acabamentos do apartamento | Porcelanato no living; vinílico nas suítes; forro de gesso com cortineiro; nicho revestido | F03, aprovado em 17/10; F04/F08 | Confirmados como conteúdo aprovado. Memorial e marcas/modelos não conferidos. |
| Conforto | Isolamento acústico/térmico entre lajes e paredes de divisa; churrasqueira com exaustão e damper | F03/F04/F08 | Confirmados como especificações registradas. Não prometer silêncio absoluto, desempenho numérico ou importar soluções específicas do Flow. |
| Instalações | Água quente e monocomando; infraestrutura para split e automação; área técnica com brise; serviço fechado e ventilado | F03/F04/F08 | Confirmadas como conteúdo aprovado. Infraestrutura não equivale à entrega dos aparelhos ou de automação completa. |
| Complementos da landing | Portas de 4,2 cm; sacada integrada com fechamento; janelas amplas | F04/F08; aprovação da landing em F01 | Preservar como conteúdo existente; detalhamento e abrangência devem ser conferidos no memorial antes de ampliar promessas. |
| Retorno da praia | Entrada de banhistas, ducha/lava-pés e box de praia individual | F04/F08 | Confirmados como comunicação aprovada; dimensões e objetos que cabem no box não comprovados. |
| Condomínio | Lazer mobiliado, decorado, equipado e com enxoval; hall mobiliado/decorado/sonorizado; dois elevadores de alta velocidade | F04/F08 | Confirmados como conteúdo existente; inventário de equipamentos, velocidade, lotação e contratos pendentes. |
| Sistemas prediais | Reuso de chuva, gerador de emergência, câmeras/automação e medição individual de água, energia e gás | F04/F08 | Confirmados como conteúdo existente. Não definir autonomia, cobertura do gerador, economia ou operação sem projeto/memorial. |
| Cisterna e SPDA | Reserva de 51.000 L na edição; referência de SPDA e captação a 107 m | F01/F02/F04/F08 | Confirmados como relato interno. A ligação específica entre essa cisterna e o reuso aparece na landing, sem esquema hidráulico conferido. Evitar desenvolver essa ligação como prova técnica. |
| Histórico Bossa | Jazz entregue em setembro/2019 e Soul em dezembro/2023; antecipação do Jazz e prazo do Soul registrados | F01/F03/F08 | Confirmado por aprovação interna. Habite-se, contratos e comprovações originais não consultados. Não usar o histórico como garantia de antecipação do Alma. |
| Afetação, CNPJ, registro | Sem comprovantes localizados para o Alma | F01 lista documentação entre pendências | Pendentes. Não atribuir ao Alma uma estrutura documental só por ser prática da Bossa ou de outro empreendimento. |

## 4. Conferências prioritárias e decisões para execução

### 4.1 Duplex: o que está conferido e o que falta

1. As duas tipologias apontam para **os mesmos dois arquivos**, inferior e superior. O seletor troca o título, a área e o contato, mas não destaca a unidade no desenho.
2. Cada imagem mostra um pavimento completo, duas residências e o núcleo comum de circulação/elevadores/escada. Não são duas cópias isoladas de uma única unidade.
3. Não há rótulo legível de Tipo 1/Tipo 2, área privativa ou legenda de limite de unidade nas pranchas dos duplex. Tampouco há cotas ou identificação documental de pavimentos/pares.
4. A semelhança do desenho de cada lado com os tipos pode sugerir associações, mas não foi tratada como identificação técnica aprovada. Não atribuir “esquerda = 168” ou “direita = 145” por proporção visual.
5. Os nomes dos arquivos identificam inferior/superior, porém os dois desenhos também mostram áreas de convivência/cozinha. Essa representação deve ser explicada pela engenharia antes de produzir percurso, zonas coloridas ou descrição detalhada de cada piso; não constitui, por si, prova de erro.

**Solução viável imediata:** manter pranchas inteiras, ampliação e rótulos explícitos “Pavimento completo dos duplex — referência inferior/superior conforme o arquivo”. Junto de cada aba, informar que a prancha reúne duas unidades e que a equipe pode esclarecer o desenho correspondente. Não apresentar todo o pavimento como área privativa do apartamento selecionado.

**Solução após confirmação pontual:** aplicar contorno discreto da unidade selecionada, atenuar a vizinha, preservar acesso e núcleo comum para orientação e manter opção “ver pavimento completo”. Usar a mesma identificação nos dois pisos e nas abas. A engenharia deve validar limites, lado, par de pavimentos e nomenclatura. Evitar recorte retangular que elimine partes irregulares, inverta a orientação ou altere a arquitetura.

### 4.2 Plantas cotadas e comparação

- Tipos 01/02: áreas e identificação escritas nas imagens, coerentes com a ficha; três suítes e organização social/íntima/serviço visualizáveis. Permitem apresentação qualitativa e ampliação.
- Duplex: programa e áreas aprovados no conteúdo; identificação gráfica individual pendente.
- As seis plantas disponíveis são humanizadas, sem cotas/escala utilizável para dimensionar mobiliário ou medir ambientes. Não medir pisos, camas ou pixels para converter em metros.
- É possível comparar área privativa total, suítes, vagas e número de pisos com as ressalvas acima. Não é possível comparar com precisão tamanho de cada quarto, faixa de circulação, espaço de armários ou adequação de uma nova disposição de mobiliário.
- Nenhum render de living ou suíte está vinculado, na evidência consultada, a uma das quatro tipologias de forma inequívoca. Usar “perspectiva ilustrativa de ambiente do projeto”, sem sugerir representação exata de todos os tipos.

### 4.3 Localização e distâncias

| Item | Evidência | Decisão |
| --- | --- | --- |
| Praia: 300 m | F01–F04/F08 são coerentes; valor aprovado internamente | Preservar o valor aprovado como referência informada. Método, ponto de saída/chegada e data da medição continuam pendentes. Não chamá-lo de medição auditada. |
| Menções antigas a 350 m | Não localizadas nas fontes atuais consultadas | Não substituir 300 por 350 nem afirmar que uma medição nova resolveu a questão. Se houver peça oficial antiga, comparar método e revisão. |
| Cerca de 4 minutos a pé | Texto, FAQ e selo em F02–F04/F08; não há memória de cálculo | Trata-se de estimativa publicada, não cronômetro aferido. O vídeo de 64,21 s é uma peça editada e não mede o tempo integral da caminhada. |
| Bombinhas | 10 km em F04/F08; 17 km em `distanciasAlma` de F03 | **Divergente, não resolvida numericamente.** Retirar a precisão da primeira proposta de texto ou deixar pendente até medir com os mesmos pontos e modo. |
| Itapema | 12 km nas listas do Alma; 3 min de carro em `distanciasHome` | Critérios/destinos não explicitados. Não tratar como comparação equivalente nem repetir ambos como se fossem uma medição única. |
| Demais praias, marinas e aeroportos | Valores listados no código, sem memória de trajeto ou critério | Confirmados como conteúdo existente, mas validação geográfica pendente. Evitar transformar todos em argumentos de proximidade na primeira versão. |
| Mapa incorporado e link de caminhada | Endereço buscado por texto; destino “Praia do Perequê” genérico | Não fixa sozinho o acesso específico à areia mostrado no vídeo. Definir coordenadas e chegada antes de auditar distância. |

**Critério a adotar na conferência futura:** saída de pedestre do Alma até acesso definido à areia, percurso permitido a pé, pontos/coordenadas de origem e destino, ferramenta, data e comprimento registrado. Separar linha reta, trajeto a pé, trajeto de carro e tempo estimado. Em destinos urbanos, definir o ponto de referência. Nenhum método foi presumido nesta fase.

### 4.4 Associações de imagens e outros conflitos

| Questão | Conclusão da conferência | Situação |
| --- | --- | --- |
| `img/alma/gourmet.jpg` | É o salão de festas do rooftop, como F01 e F04 indicam; não é o gourmet da piscina | Resolvida para uso editorial. |
| `img/alma-gourmet.jpg` | É outra imagem: visualmente corresponde ao gourmet junto à piscina. A distinção de diretório é essencial | Resolvida; não aplicar a legenda do arquivo anterior a este. |
| `img/alma-rooftop.jpg` | Visualmente repete a cena do gourmet/piscina, não comprova o rooftop; o nome não basta | Associação divergente. Não usar como prova do rooftop; preferir os renders e a implantação corretos de `img/alma/`. |
| 103/114 m² e 48 unidades questionados no estudo | Há aprovação interna explícita em F01/F02 e concordância das imagens dos tipos | Resolvida a prioridade de fonte; manter os valores. Documentação original continua não consultada. |
| 102/107/112 m | Piso do rooftop, teto e altura total no registro interno | Resolvida a distinção das referências. |
| 850 m² | Presente no conteúdo aprovado e na publicação, mas sem composição de áreas | Não retirar como dado sem fonte; manter com ressalva de critério e não derivar densidade/capacidade. |
| Obra “todo mês, com fotos” | Só há edição de agosto para o Alma; não se localizaram fotos de execução no acervo | Não afirmar disponibilidade de edições recentes ou galeria fotográfica que não esteja acessível. |
| Linguagem de silêncio/vista | A página usa “silêncio entre vizinhos”, “água morna o ano inteiro” e vistas amplas em renders | Reescrever na fase 2 como benefícios apoiados em especificações, sem promessa absoluta de operação, desempenho ou vista permanente. |

## 5. Mapa do acervo disponível

**Base dos caminhos abaixo:** todos começam em `site/public/`; no site, retirar esse prefixo e manter `/img/...` ou `/video/...`. A tabela apresenta cada arquivo, sua identificação e destino editorial. Datas/revisões originais não disponíveis. “Render oficial” significa material do projeto incorporado ao site, com origem descrita em F01; continua sendo perspectiva ilustrativa, não fotografia do imóvel entregue nem memorial contratual.

| Caminho / arquivo | Representação | Tipologia, ambiente ou pavimento | Natureza | Uso e ressalva | Dimensões/duração |
| --- | --- | --- | --- | --- | --- |
| `img/alma/academia.jpg` | Academia panorâmica | Lazer/bem-estar | Render oficial | Cuidar de si | 2400 × 1601 px |
| `img/alma/brinquedoteca.jpg` | Brinquedoteca Floresta Encantada | Rooftop | Render oficial | Brincar | 1980 × 2400 px |
| `img/alma/casa-de-banho.jpg` | Casa de banho com banheiras | Lazer/bem-estar | Render oficial | Relaxar | 2400 × 1600 px |
| `img/alma/duplex.jpg` | Living com pé-direito duplo de duplex | Duplex; tipo específico não identificado | Render oficial | Bloco duplex | 2400 × 2000 px |
| `img/alma/fachada-2.jpg` | Fachada externa; ângulo alternativo | Edifício | Render oficial | Galeria de arquitetura | 1920 × 2400 px |
| `img/alma/fachada-passaro.jpg` | Perspectiva aérea do edifício no entorno | Edifício/entorno | Render oficial com composição do entorno | Arquitetura; não usar como fotografia da obra pronta | 2400 × 1800 px |
| `img/alma/fachada.jpg` | Fachada externa | Edifício | Render oficial | Identificação do empreendimento e localização | 1920 × 2400 px |
| `img/alma/fireplace.jpg` | Terraço com Fire Place | Rooftop | Render oficial | Conversar ao ar livre | 2400 × 1600 px |
| `img/alma/gourmet-piscina-2.jpg` | Gourmet junto à piscina, outro enquadramento | Lazer/bem-estar | Render oficial | Receber | 2400 × 1350 px |
| `img/alma/gourmet-piscina-noite.jpg` | Gourmet junto à piscina ao entardecer | Lazer/bem-estar | Render oficial | Receber; imagem preferencial desse ambiente | 2576 × 1449 px |
| `img/alma/gourmet-piscina.jpg` | Vista da prainha e apoio gourmet | Lazer/bem-estar | Render oficial | Descansar e receber perto da piscina | 2400 × 1143 px |
| `img/alma/gourmet.jpg` | Salão de festas; não é o gourmet da piscina | Rooftop | Render oficial | Receber e reunir | 2080 × 2400 px |
| `img/alma/hall.jpg` | Hall social | Acesso comum | Render oficial | Chegada e informações de confiança | 2400 × 1411 px |
| `img/alma/jantar-jardim.jpg` | Jantar Jardim | Rooftop | Render oficial | Receber e compartilhar refeições | 2400 × 2400 px |
| `img/alma/living.jpg` | Living integrado; tipologia específica não identificada | Apartamento; living | Render oficial | Abertura do bloco de apartamentos | 2400 × 1412 px |
| `img/alma/logo-claro.png` | Logotipo claro do Alma | Marca | Identidade gráfica oficial | Abertura e fechamento em fundo escuro | 1319 × 481 px |
| `img/alma/logo-salvia.png` | Logotipo sálvia do Alma | Marca | Identidade gráfica oficial | Blocos claros e material editorial | 1319 × 481 px |
| `img/alma/piscina.jpg` | Piscina com jardins | Lazer/bem-estar | Render oficial | Descansar e aproveitar a água | 2400 × 1351 px |
| `img/alma/planta-lazer.jpg` | Pavimento completo com lazer e garagem; não só área recreativa | Lazer/bem-estar | Planta humanizada oficial | Mapa de ambientes; evitar atribuir toda a prancha à área de lazer | 2400 × 1845 px |
| `img/alma/planta-rooftop.jpg` | Implantação completa do rooftop | Rooftop | Planta humanizada oficial | Orientar ambientes e relações entre espaços | 2400 × 2000 px |
| `img/alma/playground-2.jpg` | Jardim/solarium; playground ao fundo | Lazer/bem-estar | Render oficial | Descansar; brincar como contexto | 2400 × 1351 px |
| `img/alma/playground.jpg` | Área de lazer e playground | Lazer/bem-estar | Render oficial | Brincar e conviver | 2400 × 1350 px |
| `img/alma/poster-duplex.jpg` | Capa do loop do living duplex | Duplex; tipo não identificado | Quadro ilustrativo de animação do projeto | Capa do vídeo de interiores | 1200 × 1200 px |
| `img/alma/poster-piscina.jpg` | Capa do loop da piscina | Lazer/bem-estar | Quadro ilustrativo de animação do projeto | Capa do vídeo de abertura | 1440 × 1440 px |
| `img/alma/poster-trajeto.jpg` | Capa do percurso real | Rua/entorno | Fotografia/quadro de gravação real | Capa do vídeo do trajeto | 720 × 1280 px |
| `img/alma/pub.jpg` | Pub View | Rooftop | Render oficial | Conversar e conviver | 2400 × 2000 px |
| `img/alma/sauna.jpg` | Sauna seca | Lazer/bem-estar | Render oficial | Relaxar | 2400 × 2400 px |
| `img/alma/suite-master.jpg` | Suíte master; tipologia específica não identificada | Apartamento; suíte | Render oficial | Interiores, antes do lazer; sem vincular a um tipo sem validação | 2400 × 1200 px |
| `img/alma/trajeto-avenida.jpg` | Travessia da avenida no percurso | Trajeto | Fotografia/quadro de gravação real | Explicar percurso; não certificar acessibilidade | 1080 × 1920 px |
| `img/alma/trajeto-porta.jpg` | Ponto de saída/rua junto ao empreendimento | Trajeto | Fotografia/quadro de gravação real | Sequência da porta até a praia | 1080 × 1920 px |
| `img/alma/trajeto-praia.jpg` | Chegada à praia | Trajeto | Fotografia/quadro de gravação real | Explicar percurso | 1080 × 1920 px |
| `img/alma/vida/agua.jpg` | Textura de água | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1500 px |
| `img/alma/vida/amanhecer.jpg` | Pessoa na cama diante do mar | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1333 px |
| `img/alma/vida/beira-mar.jpg` | Homem sentado à beira-mar | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1333 px |
| `img/alma/vida/caminhada-2.jpg` | Homem caminhando | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 1331 × 2000 px |
| `img/alma/vida/caminhada.jpg` | Mulher caminhando | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 1333 × 2000 px |
| `img/alma/vida/corrida.jpg` | Homem correndo | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1236 px |
| `img/alma/vida/mao-mar.jpg` | Mão na água ao pôr do sol | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1335 px |
| `img/alma/vida/passeio-cao.jpg` | Pessoa passeando com cão | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 1333 × 2000 px |
| `img/alma/vida/praia-chapeu.jpg` | Pessoa sentada diante da praia | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1333 px |
| `img/alma/vida/varanda.jpg` | Pessoa tomando café em varanda junto ao mar | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 1333 × 2000 px |
| `img/alma/vida/vento.jpg` | Pessoa de chapéu à beira-mar | Estilo de vida; sem vínculo com unidade | Fotografia ilustrativa de banco | Licença pendente; secundária, nunca prova de interior ou vista do Alma | 2000 × 1326 px |
| `img/alma/vista/r-00.jpg` | Quadro 1 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-01.jpg` | Quadro 2 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-02.jpg` | Quadro 3 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-03.jpg` | Quadro 4 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-04.jpg` | Quadro 5 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-05.jpg` | Quadro 6 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/r-06.jpg` | Quadro 7 de 7 do giro de 360° | Rooftop / 102 m conforme código | Fotografia/quadro real de drone segundo F01/F05 | Entorno; não garante vista permanente nem igual por ambiente | 1800 × 870 px |
| `img/alma/vista/v-00.jpg` | Quadro de drone associado no site a Lazer / 12,6 m | Lazer | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-01.jpg` | Quadro de drone associado no site a 6º / 17,6 m | 6º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-02.jpg` | Quadro de drone associado no site a 7º / 20,9 m | 7º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-03.jpg` | Quadro de drone associado no site a 8º / 24,1 m | 8º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-04.jpg` | Quadro de drone associado no site a 10º / 30,6 m | 10º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-05.jpg` | Quadro de drone associado no site a 11º / 33,8 m | 11º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-06.jpg` | Quadro de drone associado no site a 12º / 37,1 m | 12º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-07.jpg` | Quadro de drone associado no site a 14º / 43,6 m | 14º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-08.jpg` | Quadro de drone associado no site a 15º / 46,8 m | 15º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-09.jpg` | Quadro de drone associado no site a 16º / 50,0 m | 16º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-10.jpg` | Quadro de drone associado no site a 18º / 56,5 m | 18º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-11.jpg` | Quadro de drone associado no site a 19º / 59,8 m | 19º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-12.jpg` | Quadro de drone associado no site a 20º / 63,0 m | 20º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-13.jpg` | Quadro de drone associado no site a 21º / 66,2 m | 21º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-14.jpg` | Quadro de drone associado no site a 23º / 72,7 m | 23º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-15.jpg` | Quadro de drone associado no site a 24º / 76,0 m | 24º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-16.jpg` | Quadro de drone associado no site a 25º / 79,2 m | 25º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-17.jpg` | Quadro de drone associado no site a 27º / 85,7 m | 27º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-18.jpg` | Quadro de drone associado no site a 28º / 88,9 m | 28º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-19.jpg` | Quadro de drone associado no site a 29º / 94,3 m | 29º | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/vista/v-20.jpg` | Quadro de drone associado no site a Rooftop / 102,0 m | Rooftop | Fotografia/quadro real de drone segundo F01/F05 | Vista de referência; data, posição, orientação e calibração não conferidas; não garante vista da unidade | 1800 × 870 px |
| `img/alma/yoga.jpg` | Espaço Vitalidade | Lazer/bem-estar | Render oficial | Cuidar de si | 2400 × 2400 px |
| `img/alma-academia.jpg` | Academia panorâmica | Lazer/bem-estar | Render oficial | Cuidar de si | 2200 × 1467 px |
| `img/alma-brinquedoteca.jpg` | Brinquedoteca Floresta Encantada | Rooftop | Render oficial | Brincar | 1815 × 2200 px |
| `img/alma-casa-de-banho.jpg` | Casa de banho com banheiras | Lazer/bem-estar | Render oficial | Relaxar | 2200 × 1467 px |
| `img/alma-duplex.jpg` | Living com pé-direito duplo de duplex | Duplex; tipo específico não identificado | Render oficial | Bloco duplex | 2200 × 1833 px |
| `img/alma-fachada.jpg` | Fachada externa | Edifício | Render oficial | Identificação do empreendimento e localização | 1774 × 2165 px |
| `img/alma-fireplace.jpg` | Terraço com Fire Place | Rooftop | Render oficial | Conversar ao ar livre | 2200 × 1467 px |
| `img/alma-garden.jpg` | Jardim/solarium com playground ao fundo | Lazer/bem-estar | Render oficial | Descansar e brincar | 2200 × 1142 px |
| `img/alma-gourmet.jpg` | Cena de gourmet/piscina; nome rooftop não comprova o ambiente | Lazer/bem-estar pela inspeção visual | Render do acervo do projeto | Usar apenas após legenda correta; preferir arquivos descritivos de img/alma/ | 2200 × 1238 px |
| `img/alma-lazer.jpg` | Vista geral do lazer junto à piscina | Lazer/bem-estar | Render oficial | Visão do conjunto | 2200 × 1238 px |
| `img/alma-living.jpg` | Living integrado; tipologia específica não identificada | Apartamento; living | Render oficial | Abertura do bloco de apartamentos | 2200 × 1294 px |
| `img/alma-piscina.jpg` | Piscina com jardins | Lazer/bem-estar | Render oficial | Descansar e aproveitar a água | 2200 × 1239 px |
| `img/alma-planta-duplex-inferior.jpg` | Pavimento completo dos duplex, arquivo inferior | Duplex Tipo 1 e Tipo 2 | Planta humanizada oficial | Mostrar contexto dos dois apartamentos; contorno individual depende de confirmação técnica | 2200 × 1965 px |
| `img/alma-planta-duplex-superior.jpg` | Pavimento completo dos duplex, arquivo superior | Duplex Tipo 1 e Tipo 2 | Planta humanizada oficial | Mostrar contexto dos dois apartamentos; contorno individual depende de confirmação técnica | 2200 × 1833 px |
| `img/alma-planta-tipo-01.jpg` | Planta individual com rótulo Tipo 01 / 114 m² | Tipo 01 | Planta humanizada oficial | Seleção e ampliação; sem cotas por ambiente | 1573 × 2200 px |
| `img/alma-planta-tipo-02.jpg` | Planta individual com rótulo Tipo 02 / 103 m² | Tipo 02 | Planta humanizada oficial | Seleção e ampliação; sem cotas por ambiente | 1573 × 2200 px |
| `img/alma-pub.jpg` | Pub View | Rooftop | Render oficial | Conversar e conviver | 2200 × 1833 px |
| `img/alma-rooftop.jpg` | Cena de gourmet/piscina; nome rooftop não comprova o ambiente | Lazer/bem-estar pela inspeção visual | Render do acervo do projeto | Usar apenas após legenda correta; preferir arquivos descritivos de img/alma/ | 2200 × 1236 px |
| `video/alma/duplex.mp4` | Loop animado do living duplex | Duplex; tipo não identificado | Animação ilustrativa do projeto | Apresentação de interiores; não é apartamento pronto | 1200 × 1200 px; 2.96 s |
| `video/alma/piscina.mp4` | Loop animado da piscina | Lazer/bem-estar | Animação ilustrativa do projeto | Abertura; não é filmagem da piscina construída | 1280 × 1280 px; 3.96 s |
| `video/alma/trajeto.mp4` | Vídeo do trajeto do Alma até a praia | Trajeto | Gravação real editada | Localização; duração da peça não é tempo integral de caminhada | 540 × 960 px; 64.21 s |

As associações das 21 imagens `v-00` a `v-20` a andares e alturas foram transcritas de F05. Não constituem medição independente nem localização da câmera dentro da futura unidade. Os sete quadros `r-00` a `r-06` pertencem ao giro divulgado a 102 m. Nenhum vídeo bruto de vistas foi localizado nessa pasta.

### 5.1 Seleção preferencial para a primeira versão

- **Apartamento primeiro:** `img/alma/living.jpg`, `suite-master.jpg`, `duplex.jpg` e `video/alma/duplex.mp4`. São os materiais que mostram a vida dentro da residência; anteceder o longo passeio pelo lazer e entorno. Não afirmar tipologia específica desses renders sem confirmação.
- **Plantas:** os dois tipos individualizados e as duas pranchas integrais dos duplex, com aviso claro sobre o pavimento compartilhado. Preservar os identificadores de URL existentes.
- **Receber:** `gourmet-piscina-noite.jpg`, `gourmet.jpg` (salão do rooftop), `jantar-jardim.jpg` e `pub.jpg`, com legendas precisas.
- **Brincar:** `playground.jpg`, `playground-2.jpg` e `brinquedoteca.jpg`. Distinguir playground no lazer e brinquedoteca no rooftop.
- **Relaxar/cuidar de si:** piscina, casa de banho, sauna, academia e yoga. As duas plantas gerais ajudam a mostrar onde cada ambiente fica.
- **Localização:** trajeto real, quadros do percurso e mapa. Vistas de drone podem complementar com ressalva de posição e data; não dominar a demonstração da planta.
- **Confiança:** edição de agosto identificada com mês/ano e histórico institucional aprovado; fotos recentes da obra quando fornecidas.

Não há material individual inequívoco de pet place, box de praia, acesso de banhistas ou Wine Bar. Esses itens podem ser descritos com a fonte interna existente, sem rotular uma imagem de outro espaço. Imagens `vida/` não são necessárias para executar a primeira versão; a licença permanece pendente e os renders próprios têm prioridade.

## 6. O que já pode ser definido na fase 2

| Melhoria | Base já disponível | Definição que pode avançar | Dependência limitada |
| --- | --- | --- | --- |
| Abertura mais clara | Assinatura, piscina, logo, ficha aprovada | Explicar produto e localização com três/quatro suítes, dois por andar e entrega prevista; dar acesso às plantas e ao registro de interesse | Distância pode manter referência aprovada de 300 m sem alegar medição nova; evitar tempo exato não aferido. |
| Interiores mais cedo | Living, suíte master, duplex e loop | Antecipar convivência, espaço íntimo e organização das tipologias antes do longo bloco de destino/lazer | Não atribuir render a Tipo 01/02 específico. |
| Identificação das plantas | Dois tipos rotulados, quatro tipologias e links próprios | Título, área, suítes, vagas, ampliação e contato contextual por tipologia | Destacar lado individual dos duplex somente após confirmação; versão inicial pode mostrar pavimento completo identificado. |
| Lazer pelos usos da família | Lista aprovada, renders e duas implantações | Agrupar reunir, brincar, relaxar e cuidar de si, indicando pavimento e ambiente | Não inventar área/capacidade por ambiente; não prometer serviços ou exclusividade operacional. |
| Confiança e obra | Edição nº 07, início, prazo e histórico Bossa | Bloco de acompanhamento datado com link da edição, especificações aprovadas e acesso à equipe | Manter agosto como data histórica; atualização recente depende da engenharia. |
| Contato contextualizado | WhatsApp, seletor e formulários existentes | Conhecer esta planta, esclarecer diferenças, conversar sobre necessidades e agendar apresentação do projeto no escritório | Manter comunicação de pré-registro; não sugerir visita a apartamento pronto do Alma. |
| Localização útil | Endereço, vídeo real, mapa e quadros | Mostrar o trajeto e a relação com a praia | Demais distâncias numéricas sem método e divergências de destinos podem ficar fora da primeira redação. |
| Identidade preservada | F01/F06 e logotipos | Reordenar narrativa e hierarquia dentro das cores, fontes e curvas atuais | Nenhuma troca de marca ou novo conceito visual é necessária. |

**Sequência de trabalho liberada para a fase 2:** abertura e ficha essencial → vida dentro do apartamento → tipos e duplex → áreas comuns por uso e pavimento → trajeto/localização → confiança e obra datada → conversa contextual e perguntas frequentes. A ordem exata e os textos serão definidos na próxima fase; este documento não substitui essa redação.

O estudo de cases orienta: demonstrar benefício com material do próprio produto; explicar privacidade pela planta e dois apartamentos por andar; usar o percurso real; oferecer escolha compreensível e provas datadas. Não transferir certificações, soluções acústicas, dimensões, rentabilidade ou regras de uso dos cases para o Alma.

## 7. Pendências objetivas para Fábio e equipe

Não é necessário responder a tudo para iniciar a redação. Os pontos abaixo bloqueiam apenas as afirmações ou melhorias correspondentes.

| ID / prioridade | Resposta ou material necessário | Responsável sugerido | O que resolve | Conduta enquanto pendente |
| --- | --- | --- | --- | --- |
| P01 — alta | Marcar nas duas pranchas dos duplex o Tipo 1/168 m² e Tipo 2/145 m², limites de cada unidade, acesso, piso e par de pavimentos; esclarecer a representação de convivência nos dois arquivos | Engenharia / arquitetura, com Fábio | Destaque correto da unidade selecionada e comentários dos pisos | Mostrar pavimentos completos identificados; não substituir arquivos nem inventar associação esquerda/direita. |
| P02 — alta | Última medição/boletim do Alma, com mês de referência, percentual, responsável e fotos/vídeo datados; confirmar se setembro/outubro já têm edição | Engenharia | Atualização real da seção de obra | Preservar 10,52% **em agosto/2026**; não anunciar como situação de outubro. |
| P03 — alta para mudança comercial | Registro de incorporação atual, número/data/cartório ou confirmação formal de que segue em processo | Fábio / jurídico / responsável documental | Estado atual da comunicação comercial | Manter registrar interesse e avisos existentes. Não usar a configuração técnica como comprovação. |
| P04 — média | Confirmar medição de praia: saída, acesso à areia, modo e data; explicar eventual peça anterior com 350 m e a estimativa de quatro minutos | Marketing / equipe local | Distância auditável e coerência entre mídias | Preservar referência aprovada de 300 m sem alegar novo levantamento; enfatizar vídeo real. |
| P05 — média | Unificar destinos e método das distâncias, em especial Bombinhas 10/17 km e Itapema 12 km/3 min | Marketing / equipe local | Tabela de localização confiável | Não escolher um valor por conveniência; omitir números divergentes na nova proposta. |
| P06 — média | Quadro/memorial que compõe os 850 m², separando lazer, circulação, áreas cobertas/descobertas e excluindo garagem conforme critério oficial | Engenharia | Definição precisa da área total divulgada | Manter dado aprovado sem desdobramentos; a planta de lazer inclui garagem no desenho. |
| P07 — evolução | Plantas cotadas e revisão vigente, de preferência PDF legível, para tipos e duplex; quadro de áreas por ambiente | Engenharia / arquitetura | Comparação precisa, mobiliário e circulação | Comparação apenas de áreas totais, programa e organização qualitativa. |
| P08 — média | Identificar a tipologia/pavimento representados em living, suíte master e render/vídeo duplex | Arquitetura / marketing | Legendas específicas e correspondência entre render e planta | Usar legenda de perspectiva do projeto, sem identificação individual presumida. |
| P09 — evolução | Memorial vigente e confirmação das especificações destacadas, abrangência do gerador, reuso/cisterna, equipamentos e infraestrutura | Engenharia | Dossiê técnico verificável de conforto e entrega | Preservar descrições aprovadas sem ampliar ou quantificar desempenho. |
| P10 — opcional para primeira versão | Licença de uso das onze imagens de `vida/`, com autorização da agência para web/anúncios | Marketing / agência | Uso regular de fotos ilustrativas | Priorizar renders oficiais; não depender dessas imagens na nova narrativa. |
| P11 — só se houver oferta autorizada | Estoque e tabela vigentes, data de corte, correção, condições aprovadas | Comercial | Informações de disponibilidade e pagamento | Não publicar preços/status de F09 como atuais. |
| P12 — evolução | Estimativa profissional de condomínio; política aprovada de personalização; documentos de uso/locação quando existirem | Gestão / engenharia / jurídico | Responder objeções específicas com lastro | Não prometer condomínio baixo, alteração livre, homogeneidade dos moradores ou proibição de temporada. |

## 8. Materiais que podem ficar para evolução posterior

1. Guia de plantas cotadas, quadro de áreas por ambiente e comparação de circulação/mobiliário em escala.
2. Novas propostas de mobiliário ou usos alternativos das suítes, validados tecnicamente e apresentados como sugestões, sem alterar projeto aprovado.
3. Destaques gráficos definitivos dos duplex após P01. Não é necessário produzir um novo render para explicar que a prancha reúne duas unidades.
4. Filmagem bruta de drone em melhor resolução, com data, ponto, orientação e calibração por altura; os quadros atuais já existem e dispensam promessa de vista permanente.
5. Fotografias autorizadas de rotina, novos vídeos narrados, imagens específicas de pet place/acesso de praia/box e outros espaços sem registro próprio.
6. Dossiê completo com memorial, documentação, comprovação do histórico de entrega e especificações de conforto por solução.
7. Estimativa de condomínio, política de personalização e comparações comerciais com estoque datado, quando aplicáveis.

**Exceção de prioridade:** a medição recente da obra não precisa impedir a reformulação da página, mas deve ser solicitada agora. Até chegar, a página pode usar o boletim histórico com data explícita.

## 9. Handoff e critérios para encerrar a fase 2

Esta ficha deve acompanhar o pedido da fase 2. Os textos devem preservar os valores aprovados e sinalizar P01–P12 onde forem relevantes. Antes de preparar a implementação:

- Cada número novo precisa de fonte, data e responsável; nenhuma pendência vira afirmação por repetição.
- Cada imagem precisa de legenda correta e de distinção entre render, foto real e lifestyle; a vista do render não garante vista contratual.
- A prancha de um pavimento não pode parecer a área privativa integral de uma única unidade.
- A última atualização de obra deve carregar mês/ano; previsões antigas não podem aparecer como execução concluída.
- Contato deve levar à conversa sobre a planta, uso e projeto, preservando o pré-registro observado até comprovação e revisão autorizada.
- Silêncio absoluto, aquecimento permanente, vista garantida, valorização, baixo condomínio e restrições de locação não entram sem evidência própria suficiente.
- Cores, tipografia, curvas, linguagem das imagens e assinatura permanecem as atuais.

**Conclusão operacional:** a consulta e a organização da fase 1 estão concluídas. A base para textos, hierarquia e seleção de imagens da fase 2 está pronta. A identificação individual dos duplex, a atualização de obra, a verificação documental e as medições pendentes permanecem expressamente delimitadas; nenhuma delas foi preenchida com suposição.
