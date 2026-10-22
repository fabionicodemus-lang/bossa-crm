# Alma Sea Houses — Especificação estratégica, editorial e funcional da página

**Fase:** 2 de 6 · **Versão:** 1.1 — aprovação registrada · **Data:** 21 de outubro de 2026, horário de Brasília.  
**Entrega:** conteúdo final e regras de experiência para implementar a primeira versão em prévia.  
**Destino:** `fabionicodemus-lang/bossa-crm`, pasta `site/`, projeto Vercel `bossa-site`.  
**Página:** `/empreendimentos/alma-seahouses`.  
**Base factual:** `Alma_Fase1_Ficha_e_Acervo.md`, de 21/10/2026.  
**Estado editorial desta entrega:** sequência da página, tom dos textos e prioridades de produção aprovados por Fábio em 21/10/2026. Especificação liberada para implementação da prévia na fase 3. A publicação em produção permanece para a fase correspondente, após revisão da prévia funcional.

**Registro da aprovação:** “Sequência ok. Tom ok. Prioridade ok sugerida.” A versão 1.1 registra essa decisão; o conteúdo e as regras da especificação permanecem iguais aos da versão entregue para revisão.

## 0. Decisão central e instruções de uso

A nova página apresenta primeiro a casa e as possibilidades de uso, depois amplia a experiência para o edifício, o lazer e o entorno. O visitante encontra as plantas desde a abertura e chega ao atendimento com uma dúvida ou tipologia definida. A percepção de acolhimento e qualidade vem do projeto, das imagens oficiais, da clareza e do cuidado com a navegação.

O eixo editorial é **“Tempo juntos. Espaço para cada um.”** A assinatura principal continua **“Sua casa na praia. feita para sua alma.”**. O conceito interno de boutique familiar orienta as escolhas; a expressão não entra nos textos públicos, metadados, nomes acessíveis ou eventos.

Os blocos identificados como **Texto público** são redação final. Instruções técnicas, códigos de fontes, prioridades e pendências não aparecem no site. Os títulos públicos, botões, legendas e mensagens deste documento substituem as versões anteriores nos blocos correspondentes. O Codex pode ajustar quebras de linha e organização responsiva, preservando o significado, os números e a hierarquia.

**Condições da primeira versão:** comunicação de pré-registro; dados aprovados na fase 1; acervo oficial existente e espaços nomeados para novos materiais autorizados por Fábio; plantas humanizadas sem medidas de ambientes; pranchas dos duplex apresentadas como pavimentos completos; boletim de obra de agosto/2026 com data visível. Nenhuma característica dos oito cases é transferida para o Alma.

**Observação incorporada de Fábio:** novos materiais de foto e vídeo podem ser produzidos. A prévia da fase 3 deve mostrar os espaços M01–M08 com nome e proporção previstos, conforme §18. Eles representam necessidades de produção, não arquivos já existentes. A lista de produção traz o conteúdo, o formato e a prioridade. A página deve manter uma alternativa funcional com o acervo disponível enquanto os novos materiais são preparados.

### 0.1 Hierarquia das fontes

| Código | Fonte | Uso nesta especificação |
| --- | --- | --- |
| B1 | `Alma_Fase1_Ficha_e_Acervo.md`, 21/10/2026, especialmente §§3–9 | Dados, identificação dos arquivos, fontes F01–F11 e pendências P01–P12. “Confirmado” preserva o grau de comprovação descrito na ficha. |
| B2 | `Alma_Acervo_Boutique_Familiar_8_Cases (1)(1).html`, 21/10/2026 | Referências de apresentação, demonstração dos benefícios e atendimento. Não comprova especificações ou resultados comerciais do Alma. |
| T1–T7 | Componentes, rotas e contratos do site consultados em 21/10/2026; relação no §17 | Reaproveitamento e limites funcionais. Consulta de código; não foi realizado envio de formulário nem verificação de configuração privada ou de dados do CRM. |
| A1–A3 | Orientações W3C relacionadas no §17 | Referências para contraste, controles e ampliação em modal. Esta especificação não constitui certificação de acessibilidade. |

Em conflito entre o estudo e a ficha, prevalece B1 para os dados do Alma. Uma pendência de B1 só muda de estado com evidência nova aprovada e registrada. Se o código tiver mudado quando começar a fase 3, o Codex deve reconciliar as diferenças com esta especificação antes de aplicar alterações sobre trabalho recente.

### 0.2 Regras de linguagem

- Usar frases concretas, títulos curtos e linguagem de conversa respeitosa. A emoção fica nos títulos, nas imagens e nas situações de uso.
- Falar em família sem pressupor número de filhos, composição familiar ou uso exclusivo como moradia principal. Casa de praia e outras finalidades continuam possíveis.
- Expressar privacidade por configuração e organização dos ambientes; não prometer silêncio absoluto, baixa ocupação ou lazer vazio.
- Usar “entrega prevista”, “perspectiva ilustrativa”, “referência de vista” e datas junto às informações a que se referem.
- Tratar o acesso a materiais e a conversa como ajuda à escolha. Omitir contagem regressiva, urgência artificial, suposta reserva e escassez sem estoque vigente.
- Evitar excesso de palavras como exclusivo, único, incomparável e sofisticado. Não usar superlativos para substituir evidências.
- Não identificar renders de living, suíte ou duplex com um tipo específico enquanto P08 estiver aberta.

## 1. Arquitetura da página e navegação

### 1.1 Sequência definitiva

| Ordem | Âncora | Título público | Função | Ação principal |
| --- | --- | --- | --- | --- |
| 01 | `#inicio` | Sua casa na praia. feita para sua alma. | Identificar o produto e dar acesso imediato às plantas | Explorar plantas |
| 02 | `#apartamentos` | Tempo juntos. Espaço para cada um. | Mostrar os interiores e situações de convivência | Explorar as plantas |
| 03 | `#plantas` | Encontre a planta que faz sentido para você. | Entender, comparar e consultar as quatro opções | Conversar sobre esta planta / este duplex |
| 04 | `#posicao` | Dois apartamentos por andar. Conheça o conjunto. | Explicar configuração e contextualizar vistas | Explorar as vistas |
| 05 | `#lazer` | Espaços para os dias que vocês querem viver. | Apresentar lazer por uso e pavimento | Ver os dois pavimentos |
| 06 | `#localizacao` | A praia faz parte do caminho. | Mostrar endereço e percurso real | Ver o trajeto até a praia |
| 07 | `#conforto` | O cuidado também está no que você usa todos os dias. | Traduzir especificações em benefícios compreensíveis | Consultar as especificações |
| 08 | `#obra` | Conheça quem constrói. Acompanhe o que acontece. | Sustentar confiança com histórico e obra datada | Ver boletim de agosto de 2026 |
| 09 | `#duvidas` | Algumas respostas antes da nossa conversa. | Esclarecer dúvidas de produto e uso | Conversar com a equipe |
| 10 | `#contato` | Conte como você imagina viver aqui. | Iniciar atendimento ou registrar interesse geral | Conversar sobre o Alma |

Essa ordem vale no computador e no celular. A posição e as vistas não antecedem a apresentação das plantas. A assinatura e a seção de interiores são compactas o suficiente para que o seletor seja o terceiro bloco de conteúdo, sem intercalar manifesto, destino e passeio extenso pelo lazer.

### 1.2 Navegação local

Manter o cabeçalho institucional e acrescentar/reorganizar a navegação local do Alma com: **Apartamentos · Plantas · Lazer · Localização · Obra**. Os rótulos levam às âncoras da tabela. As seções de posição, conforto e dúvidas continuam no fluxo, sem aumentar o menu principal.

No computador, a navegação local pode ficar fixa sob o cabeçalho após a abertura. No celular, deve ser uma faixa compacta de links com rolagem própria apenas quando necessária; a página inteira não pode ganhar rolagem horizontal. O foco do teclado e a indicação da seção ativa precisam ser visíveis. Reservar espaço para que o cabeçalho não esconda títulos após navegação por âncora.

**Barra inferior no celular:** dois controles, **Plantas** e **Conversar**. “Plantas” leva a `#plantas`; “Conversar” abre o WhatsApp com o contexto permitido no §12. Mostrar a barra depois de os botões da abertura saírem da tela. Recolher durante ampliação, menu aberto, teclado do formulário e quando os controles de contato final estiverem visíveis. Preservar a área segura inferior do aparelho. No Alma, essa barra substitui o botão flutuante duplicado de WhatsApp no celular; o comportamento do Flow continua independente.

O contato contextual do seletor abre diretamente a conversa. Os links editoriais “Conversar com a equipe” que apenas orientam para as opções de contato levam a `#contato`; identificar esses destinos na seção correspondente.

### 1.3 Identidade e composição

| Elemento | Regra |
| --- | --- |
| Paleta | Preservar sálvia `#59695C`, oliva `#656635`, taupe `#696158`, pedra `#9D968D`, areia `#C4BFB6`, névoa `#D7D2CB` e fundos já existentes em `alma.css`. Ajustar combinações de texto e fundo para contraste sem trocar a identidade. |
| Tipos | Literata nos títulos; Urbanist na leitura, dados e controles; Ephesis apenas nos acentos de assinatura já existentes. Dados de planta e botões não usam escrita cursiva. |
| Formas | Reutilizar arcos, curvas e cantos existentes. Plantas e diagramas usam contêiner que preserve o desenho inteiro. |
| Ritmo | Imagens amplas, grupos curtos de texto, uma ideia dominante por bloco. Alternar fundos existentes com parcimônia. |
| Ênfase | Primeiro o produto e a imagem; depois os dados que ajudam a escolher; por último detalhes consultáveis. |
| Fotografias | Renders oficiais e gravação real do trajeto. Imagens de banco não são necessárias nesta versão. |
| Movimento | Reaproveitar efeitos discretos existentes, com alternativa estática e respeito à preferência por movimento reduzido. |

## 2. S01 — Abertura

### 1. Objetivo

Apresentar o Alma com clareza e acolhimento, mantendo o reconhecimento da marca e oferecendo acesso imediato às plantas. Base: B1 §§3.1–3.2, 3.4 e 6.

### 2. Título final

**Texto público — identificação:** ALMA SEA HOUSES · PEREQUÊ, PORTO BELO

**Texto público — H1:**

> Sua casa na praia.  
> feita para sua alma.

### 3. Subtítulo e texto final

> Em Perequê, apartamentos de 3 suítes e duplex de 4 suítes, com duas vagas e dois apartamentos por andar. Conheça os espaços para a vida em família, os encontros e os dias perto da praia.

**Faixa de dados:**

> 103 a 168 m² privativos · 2 vagas · Entrega prevista para julho de 2030

Não acrescentar manifesto ou um segundo parágrafo longo nesta abertura. A faixa resume a amplitude das quatro opções; a seção de plantas apresenta suas áreas exatas.

### 4. Microtextos e legendas

**Apoio aos botões:** “Conheça o projeto e registre seu interesse.”  
**Legenda da mídia:** “Perspectiva ilustrativa da piscina do projeto.”  
**Controle de animação:** “Pausar animação” / “Reproduzir animação”.  
**Nome acessível do logo:** “Alma Sea Houses”.

### 5. Imagens e vídeos

| Arquivo público | Uso | Alternativa textual |
| --- | --- | --- |
| `/video/alma/piscina.mp4` | Loop existente, sem áudio; manter a composição atual da abertura | A identificação da cena fica no pôster e na legenda |
| `/img/alma/poster-piscina.jpg` | Pôster, carregamento e alternativa estática | “Perspectiva da piscina do Alma, com jardins e área de descanso.” |
| `/img/alma/logo-claro.png` ou `/img/alma/logo-salvia.png` | Variante existente adequada ao fundo | “Alma Sea Houses”; decorativa se o mesmo nome já tiver alternativa acessível adjacente |

### 6. Organização visual

Preservar a imagem dominante, o logo, a assinatura e a atmosfera atual. Organizar texto em coluna curta com fundo ou tratamento existente que assegure contraste. O botão de plantas tem maior destaque. A descrição do produto e a previsão de entrega precisam permanecer legíveis sem depender de uma imagem em movimento.

### 7. Botões

| Hierarquia | Texto | Destino |
| --- | --- | --- |
| Principal | Explorar plantas | `#plantas` |
| Secundário | Conversar sobre o Alma | WhatsApp; mensagem geral, salvo contexto de uma rota de tipologia |

### 8. Interações

O acesso às plantas desloca para o início útil do seletor, com título visível. Abrir o site não seleciona uma preferência comercial. O vídeo pode repetir silenciosamente conforme o comportamento existente, com controle acessível; sem suporte, movimento reduzido ou falha de mídia, mostrar o pôster.

### 9. Celular

Empilhar assinatura, descrição, dados e ações. Não impor altura fixa de tela inteira que esconda os controles em aparelhos pequenos. Garantir leitura sem corte em 320 CSS px de largura. O recorte do vídeo pode variar dentro da mesma cena, sem distorção. Manter os dois botões claramente distintos.

### 10. Critérios de aceite

- Marca, localização, programa e entrega prevista aparecem em texto real.
- O primeiro botão leva ao seletor em uma ação.
- O loop não inicia áudio e tem alternativa estática.
- O cabeçalho não cobre conteúdo nem os controles.
- O contato não afirma interesse em 103 m² por causa da seleção visual inicial.

## 3. S02 — A vida dentro do apartamento

### 1. Objetivo

Fazer os interiores participarem da percepção do empreendimento antes do lazer, mostrando convivência e recolhimento por meio do acervo oficial. Base: B1 §§3.2, 4.2 e 5.1.

### 2. Título final

**Texto público — H2:** “Tempo juntos. Espaço para cada um.”

### 3. Subtítulo e textos finais

**Subtítulo:** “A casa acompanha tanto os encontros quanto as pausas do dia.”

**Abertura:**

> Living integrado à cozinha, lavabo e opções com três ou quatro suítes. Conheça a organização dos ambientes e imagine como a sua rotina pode acontecer aqui.

**Bloco living — título:** “O encontro acontece aqui.”

> Cozinhar e conversar podem fazer parte do mesmo momento. O living integrado aproxima a cozinha da vida da casa.

**Bloco suítes — título:** “Cada um no seu ritmo.”

> Três ou quatro suítes para acomodar a família e receber pessoas próximas, conforme a planta escolhida.

**Bloco duplex — título:** “Uma outra forma de viver a casa.”

> Quatro suítes e pé-direito duplo em opções de 145 e 168 m². Veja as pranchas e converse com a equipe sobre a organização de cada planta.

### 4. Microtextos e legendas

Legenda de cada imagem: **“Perspectiva ilustrativa de ambiente do projeto.”**  
Legenda do vídeo: **“Animação ilustrativa de um living duplex do projeto.”**  
Controle complementar: **“Ver o living duplex em movimento”**.

### 5. Imagens e vídeos

| Arquivo | Uso | Texto alternativo |
| --- | --- | --- |
| `/img/alma/living.jpg` | Imagem principal | “Perspectiva de living integrado à cozinha no projeto do Alma.” |
| `/img/alma/suite-master.jpg` | Bloco íntimo | “Perspectiva de uma suíte do projeto do Alma.” |
| `/img/alma/duplex.jpg` | Bloco duplex | “Perspectiva de living duplex com pé-direito duplo no projeto do Alma.” |
| `/video/alma/duplex.mp4` e `/img/alma/poster-duplex.jpg` | Vídeo opcional por ação do visitante | Usar a legenda específica acima |

### 6. Organização visual

Uma composição editorial com living em destaque e duas imagens de apoio. Reservar no destaque o espaço **M01 — Imagem humanizada: família no living do Alma**, em 16:9. Na prévia, identificar o espaço; na versão pública sem o novo material, usar `/img/alma/living.jpg`. A nova cena deve partir da perspectiva aprovada, com arquitetura e proporções preservadas, e ter legenda de cena ilustrativa. Os três conteúdos pertencem à mesma seção; não criar três capítulos de altura integral antes das plantas. O bloco duplex pode abrir a animação no mesmo quadro, mantendo acesso a pausar e voltar à imagem.

### 7. Botões

**Principal:** “Explorar as plantas” → `#plantas`.  
**Complementar de mídia:** “Ver o living duplex em movimento” → vídeo, sem redirecionar nem escolher automaticamente um duplex.

### 8. Interações

Imagens ampliáveis com a legenda preservada. Clicar na imagem não atribui uma tipologia nem registra preferência. A animação é acionada pelo visitante, com controles e sem áudio automático. O acesso às plantas mantém a opção que já estiver em consulta.

### 9. Celular

Living primeiro; os dois blocos de apoio em sequência compacta, com texto associado à sua imagem. Usar imagens proporcionais e evitar carrossel automático. O botão final permanece próximo do conteúdo, sem um grande intervalo vazio.

### 10. Critérios de aceite

- Os interiores aparecem antes do seletor e do lazer.
- Nenhum render é anunciado como representação exata do Tipo 01, Tipo 02 ou de um duplex específico.
- Não são sugeridos móveis novos ou dimensões de circulação sem planta cotada.
- A seção tem uma leitura clara mesmo sem reprodução de vídeo.

## 4. S03 — Apartamentos e plantas

### 1. Objetivo

Permitir comparar as opções comprovadas e conversar sobre uma planta sem confundir imagem, área ou tipologia. Base: B1 §§3.2, 4.1–4.2 e P01/P07/P08; T2/T3.

### 2. Título final

**Texto público — H2:** “Encontre a planta que faz sentido para você.”

### 3. Subtítulo e textos finais

**Subtítulo:** “Quatro opções para começar a imaginar a sua vida no Alma.”

**Introdução:**

> Compare as áreas privativas, o número de suítes e a configuração de cada opção. Amplie as plantas e converse com a equipe sobre o que é importante para a sua rotina.

| Rótulo de seleção | Título do painel | Texto final | ID preservado |
| --- | --- | --- | --- |
| 103 m² · 3 suítes | 103 m² · 3 suítes | Apartamento Tipo 02, com três suítes, lavabo, living integrado à cozinha e churrasqueira a carvão. Duas vagas de garagem. | `tipo-02` |
| 114 m² · 3 suítes | 114 m² · 3 suítes | Apartamento Tipo 01, com três suítes, lavabo, living integrado à cozinha e churrasqueira a carvão. Duas vagas de garagem. | `tipo-01` |
| 145 m² · Duplex | 145 m² · Duplex de 4 suítes | Duplex Tipo 2, com quatro suítes, lavabo, churrasqueira a carvão e pé-direito duplo. Duas vagas de garagem. | `duplex-tipo-2` |
| 168 m² · Duplex | 168 m² · Duplex de 4 suítes | Duplex Tipo 1, com quatro suítes, lavabo, churrasqueira a carvão e pé-direito duplo. Duas vagas de garagem. | `duplex-tipo-1` |

Apresentar “Área privativa”, “Suítes”, “Vagas” e “Tipologia” como campos de consulta. Os textos semelhantes entre tipos são intencionais: a ficha não permite afirmar em quais ambientes se distribui a diferença de área.

**Texto da comparação:**

> Veja as informações de cada opção lado a lado. Para comparar medidas de ambientes e possibilidades de mobiliário, converse com a equipe sobre os desenhos técnicos disponíveis.

| Informação pública | Tipo 02 | Tipo 01 | Duplex Tipo 2 | Duplex Tipo 1 |
| --- | --- | --- | --- | --- |
| Área privativa | 103 m² | 114 m² | 145 m² | 168 m² |
| Suítes | 3 | 3 | 4 | 4 |
| Vagas | 2 | 2 | 2 | 2 |
| Configuração | Apartamento | Apartamento | Duplex | Duplex |
| Desenho apresentado | Planta do apartamento | Planta do apartamento | Pranchas gerais do pavimento | Pranchas gerais do pavimento |

Não publicar rankings de planta, capacidade em pessoas, “ideal para família de quatro”, sala maior, armários maiores ou medidas inferidas dos pixels.

### 4. Microtextos e legendas

**Tipos 01/02:** “Planta humanizada ilustrativa. Consulte a equipe sobre o detalhamento do projeto.”

**Título da galeria dos duplex:** “Plantas gerais do pavimento dos duplex”.

**Aviso obrigatório dos duplex, junto às imagens e dentro da ampliação:**

> Estas pranchas mostram duas unidades e a circulação comum do pavimento. O desenho completo não corresponde à área privativa de um único apartamento. Converse com a equipe para identificar o duplex de seu interesse.

**Rótulos públicos provisórios:** “Prancha 1 — pavimento completo” e “Prancha 2 — pavimento completo”. Os arquivos mantêm os nomes inferior/superior no acervo. A nomenclatura técnica dos pisos e a associação individual dependem de P01; não narrar uma distribuição social/íntima por piso enquanto ela não for validada.

**Compartilhamento:** “Compartilhar planta”; após cópia confirmada, “Link copiado.”; falha, “Não foi possível compartilhar. Você pode copiar o link abaixo.”; cancelamento pelo visitante não gera mensagem de erro.

**Comparação:** “Comparar as quatro opções” / “Fechar comparação”.

### 5. Imagens

| Tipologia/painel | Arquivo | Texto alternativo |
| --- | --- | --- |
| 103 m² | `/img/alma-planta-tipo-02.jpg` | “Planta humanizada do Tipo 02 do Alma, com 103 m² e três suítes.” |
| 114 m² | `/img/alma-planta-tipo-01.jpg` | “Planta humanizada do Tipo 01 do Alma, com 114 m² e três suítes.” |
| Duplex, prancha 1 | `/img/alma-planta-duplex-inferior.jpg` | “Prancha geral dos duplex, arquivo inferior, com duas unidades e circulação comum. Limites da tipologia selecionada não destacados.” |
| Duplex, prancha 2 | `/img/alma-planta-duplex-superior.jpg` | “Prancha geral dos duplex, arquivo superior, com duas unidades e circulação comum. Limites da tipologia selecionada não destacados.” |

### 6. Organização visual

Quatro opções visíveis, com área e programa antes do nome técnico. No computador, linha de opções e painel com desenho amplo à esquerda e ficha curta à direita. No celular, seletor em duas colunas. A imagem aparece inteira, sem corte decorativo.

Nos duplex, apresentar duas abas internas: “Prancha 1 — pavimento completo” e “Prancha 2 — pavimento completo”, começando pela primeira. A nota sobre duas unidades fica fora das abas, antes da imagem, e acompanha o visor. Alternar a prancha preserva a tipologia em consulta. Não usar contorno, seta, escurecimento da unidade vizinha ou recorte de uma unidade enquanto P01 estiver pendente.

A comparação expande um bloco dentro da seção, não um segundo modal sobre o visor. Mostrar as quatro opções e um botão “Ver esta planta” por coluna/cartão. Abaixo dela, reservar **M05 — Vídeo: conheça as plantas de 103 e 114 m²**, 16:9, dentro de um bloco consultável. O vídeo só ganha controle de reprodução após o arquivo aprovado existir; na versão pública sem ele, recolher esse bloco e manter a comparação completa em texto.

### 7. Botões

| Hierarquia | Texto | Comportamento |
| --- | --- | --- |
| Principal do painel tipo | Conversar sobre esta planta | WhatsApp com atributos da planta em exibição |
| Principal do painel duplex | Conversar sobre este duplex | WhatsApp com tipologia, área e quatro suítes |
| Utilitário | Ampliar planta | Visor com identificação e legenda |
| Utilitário | Compartilhar planta | Compartilhar/copiar URL da tipologia |
| Secundário da seção | Comparar as quatro opções | Expansão no mesmo bloco |
| Dentro da comparação | Ver esta planta | Selecionar a opção e retornar ao seu painel |

### 8. Interações e estado

1. Na página geral, começar exibindo 103 m² (`tipo-02`) por ordem crescente de área. Isso é apenas exibição inicial, sem preferência atribuída ao visitante.
2. A escolha de outra opção atualiza título, atributos, desenho, aviso, URL e mensagem contextual em conjunto, mantendo o visitante no mesmo ponto da seção.
3. No link de uma tipologia, iniciar a opção correspondente. O nome da opção em consulta não implica unidade disponível ou reserva.
4. Fechar comparação ou ampliação preserva a opção atual. Trocas rápidas não deixam atributos de opções diferentes misturados.
5. O visor abre a imagem inteira, permite aproximar/reduzir/ajustar, fechar por botão ou Escape e devolve o foco ao acionador. Não depender só de gesto de pinça.
6. Compartilhar a rota existente da tipologia com `#plantas`; nunca compartilhar somente o JPG ou um link genérico sem seleção. O link deve funcionar após recarregar e em outra janela. Preservar nomes de rota do §12.
7. Links compartilhados abrem com a opção correta e acesso direto ao seletor. Há um link “Conhecer o Alma” para `#inicio` e a possibilidade imediata de escolher outra planta.
8. Não incluir nome, telefone, código de visitante ou dados de formulário na URL compartilhada.

### 9. Celular

Quatro opções legíveis em grade 2 × 2; desenho e ficha em coluna. Comparação em quatro cartões com os mesmos campos, evitando tabela ilegível ou rolagem horizontal de página. No visor, o botão de fechar e a identificação ficam acessíveis durante a aproximação; as notas dos duplex continuam disponíveis. Nenhuma barra fixa pode cobrir a imagem ou seus controles.

### 10. Critérios de aceite

- As quatro áreas, programas e IDs correspondem à ficha.
- Os dois tipos usam suas imagens individuais; duplex usam pranchas completas com aviso inequívoco em todos os caminhos.
- Abrir cada link em outra janela seleciona corretamente a planta e a mensagem de contato.
- A comparação usa somente atributos comprovados.
- Exibir a opção padrão não equivale a declarar interesse nem dispara exposição antes de a planta estar visível.
- A sequência escolher → ampliar → fechar → compartilhar → conversar preserva a mesma tipologia.
- Teclado, foco e leitor de tela identificam a seleção e os controles.

## 5. S04 — Posição, configuração e vistas

### 1. Objetivo

Explicar a escala do conjunto com números reais e oferecer uma consulta contextualizada às imagens de drone. Base: B1 §§3.1, 4.1 e mapa de imagens; P01/P08 e pendências de data, posição e altura das vistas.

### 2. Título final

**Texto público — H2:** “Dois apartamentos por andar. Conheça o conjunto.”

### 3. Subtítulo e textos finais

**Subtítulo:** “A configuração do edifício também participa da sua escolha.”

> O Alma reúne 48 apartamentos, com duas unidades por andar. Conheça as plantas e explore os registros do entorno para conversar com a equipe sobre as características de cada opção.

**Subbloco de vistas — título:** “Perequê, de outros pontos de vista.”

> Explore os registros de drone associados a diferentes alturas no material do projeto. Eles ajudam a conhecer o entorno; a vista de cada apartamento depende da posição e do pavimento.

### 4. Microtextos e legendas

**Antes do seletor:** “Vistas de referência do entorno.”  
**Campo:** “Referência de altura”.  
**Legenda dinâmica:** “Referência do projeto: {pavimento} · {altura} m”.  
**Nota:** “Registros de drone. A posição de captura pode diferir da posição do apartamento. As imagens não garantem vista permanente nem vista idêntica em todas as unidades.”  
**Giro:** “Explorar o giro do rooftop”.  
**Retorno:** “Voltar às plantas”.

Não inventar data de captura, orientação solar, ponto de câmera ou posição dentro de uma futura unidade. Manter esses dados como pendência interna até haver fonte. Usar “referência” nos rótulos existentes de altura, sem alegar calibração independente.

### 5. Imagens

- `/img/alma/fachada.jpg`: apoio à configuração; alt “Perspectiva ilustrativa da fachada do Alma Sea Houses.”.
- `/img/alma/vista/v-00.jpg` a `/img/alma/vista/v-20.jpg`: sequência existente, com associação de alturas conforme a tabela do componente e B1.
- `/img/alma/vista/r-00.jpg` a `/img/alma/vista/r-06.jpg`: sete quadros do giro do rooftop, referência de piso a 102 m.

Para cada quadro: alt “Registro de drone do entorno do Alma associado à referência {pavimento} e {altura} m no projeto.” Não transformar arquivo em comprovação de vista de uma tipologia.

### 6. Organização visual

Bloco curto de configuração, acompanhado de uma fachada. O explorador de vistas fica recolhido inicialmente sob um botão com imagem de capa e descrição. Essa escolha preserva a ferramenta existente e impede que dezenas de quadros interrompam o caminho entre planta e lazer.

Reservar **M06 — Imagem técnica: pavimento, acessos e duas unidades**, 4:3, junto do resumo de configuração. Não desenhar um pavimento tipo novo a partir das plantas individuais. A comprovação gráfica adicional de acessos, circulação e lados das unidades depende de planta oficial adequada e identificação validada. Na versão pública sem esse material, manter o resumo textual e a fachada; recolher a área técnica.

### 7. Botões

**Principal:** “Explorar as vistas” → expandir explorador.  
**Dentro do explorador:** “Explorar o giro do rooftop” → sete quadros.  
**Link de retorno:** “Voltar às plantas” → `#plantas`, preservando a consulta anterior.

### 8. Interações

Reutilizar a ferramenta existente de alturas e giro. As mudanças são locais; selecionar altura não escolhe um apartamento, não altera a planta e não cria um filtro de estoque. Mostrar botão anterior/próximo e alternativa de seleção por teclado, além do gesto de arrastar que já existir. A legenda acompanha cada quadro.

### 9. Celular

Capa proporcional, botão de abertura e seletor acessível com nomes legíveis. Evitar muitos rótulos minúsculos em um único controle. O visitante consegue fechar o explorador e continuar para o lazer sem perder a posição na página.

### 10. Critérios de aceite

- As vistas permanecem vinculadas a referências de altura, sem associação automática a unidades ou plantas.
- Não aparecem promessas de silêncio, ocupação ou vista permanente.
- Os sete quadros são apresentados como giro por imagens, sem prometer vídeo bruto inexistente.
- 102 m, quando usado, identifica o piso do rooftop; não misturar com teto a 107 m ou altura total de 112 m.
- Todos os controles funcionam por teclado e toque.

## 6. S05 — Áreas comuns por uso

### 1. Objetivo

Apresentar o lazer como ambientes que participam da rotina e dos encontros, com identificação clara de espaços e pavimentos. Base: B1 §§3.3, 5 e 6; referências B2 de uso residencial e comunicação com clareza.

### 2. Título final

**Texto público — H2:** “Espaços para os dias que vocês querem viver.”

### 3. Subtítulo e textos finais

**Subtítulo:** “850 m² de lazer distribuídos em dois pavimentos.”

**Introdução:**

> Do banho de piscina ao encontro com os amigos, o Alma reúne ambientes para diferentes momentos da vida em família. Conheça os espaços do pavimento de lazer e do rooftop.

**Grupo 1 — Estar junto**  
**Título:** “A água, o jardim e um tempo juntos.”

> Piscina aquecida com prainha e hidromassagem, cercada pelos jardins. Um convite para fazer uma pausa e aproveitar a companhia de quem está com você.

**Ambientes:** “Piscina · Prainha · Hidromassagem · Jardins e solarium”.  
**Pavimento:** “Lazer e bem-estar”.

**Grupo 2 — Brincar**  
**Título:** “O brincar também tem seu lugar.”

> O playground Casa da Árvore fica no pavimento de lazer. No rooftop, a brinquedoteca Floresta Encantada oferece outro ambiente para as brincadeiras.

**Ambientes:** “Casa da Árvore — lazer e bem-estar” e “Floresta Encantada — rooftop”.

**Grupo 3 — Receber**  
**Título:** “Deixe a conversa se estender.”

> Um almoço junto à piscina, uma comemoração no salão ou um encontro no Jantar Jardim. O Alma reúne ambientes para receber e compartilhar esses momentos.

**Ambientes:** “Gourmet junto à piscina — lazer e bem-estar” e “Salão de festas · Jantar Jardim · Pub View · Wine Bar · Fire Place — rooftop”.

**Grupo 4 — Cuidar de si**  
**Título:** “Cuidar de você também faz parte.”

> Academia, Espaço Vitalidade, casa de banho e sauna seca compõem os ambientes de bem-estar. Espaços para movimento e descanso, no ritmo que fizer sentido para você.

**Ambientes:** “Academia · Espaço Vitalidade · Casa de banho · Sauna seca”.  
**Pavimento:** “Lazer e bem-estar”.

**Complemento compacto — Um sábado no Alma**

> Imagine um dia com tempo para estar junto.

| Momento | Texto público |
| --- | --- |
| De manhã | Um banho de piscina e uma pausa perto do jardim. |
| À tarde | Tempo de brincar na Casa da Árvore ou na Floresta Encantada. |
| Ao anoitecer | Uma refeição no Jantar Jardim e uma conversa que pode durar mais. |

Esses três textos são situações imaginadas de uso, sem horários, serviços ou agenda de atividades prometidos. Não acrescentar uma segunda galeria extensa nesse complemento.

### 4. Microtextos e legendas

**Abertura dos grupos:** “Conhecer os ambientes” / “Recolher ambientes”.  
**Mapa:** “Veja em qual pavimento fica cada ambiente.”  
**Abas de implantação:** “Lazer e bem-estar” e “Rooftop”.  
**Nota da planta de lazer:** “A prancha mostra o pavimento completo, incluindo áreas de apoio e garagem.”  
**Legenda comum dos renders:** “Perspectiva ilustrativa do projeto.”  
**Legenda das implantações:** “Planta humanizada ilustrativa do pavimento.”

Os 850 m² são o total divulgado e aprovado em B1, sem decomposição técnica. Não usar a área de toda a prancha como área recreativa, nem calcular área por família, capacidade ou ocupação.

### 5. Acervo e associação definitiva

| Grupo | Arquivo público | Identificação/alt |
| --- | --- | --- |
| Estar junto, capa | `/img/alma/piscina.jpg` | “Perspectiva da piscina e dos jardins no pavimento de lazer do Alma.” |
| Estar junto, apoio | `/img/alma/gourmet-piscina.jpg` | “Perspectiva da prainha e do apoio gourmet junto à piscina.” |
| Brincar, capa | `/img/alma/playground.jpg` | “Perspectiva da Casa da Árvore no pavimento de lazer do Alma.” |
| Brincar, apoio | `/img/alma/brinquedoteca.jpg` | “Perspectiva da brinquedoteca Floresta Encantada no rooftop.” |
| Receber, capa | `/img/alma/gourmet-piscina-noite.jpg` | “Perspectiva do gourmet junto à piscina ao entardecer.” |
| Receber, salão | `/img/alma/gourmet.jpg` | “Perspectiva do salão de festas do rooftop do Alma.” |
| Receber, jantar | `/img/alma/jantar-jardim.jpg` | “Perspectiva do Jantar Jardim no rooftop.” |
| Receber, pub | `/img/alma/pub.jpg` | “Perspectiva do Pub View no rooftop.” |
| Receber, externo | `/img/alma/fireplace.jpg` | “Perspectiva do terraço com Fire Place no rooftop.” |
| Cuidar de si, capa | `/img/alma/academia.jpg` | “Perspectiva da academia no pavimento de lazer do Alma.” |
| Cuidar de si, movimento | `/img/alma/yoga.jpg` | “Perspectiva do Espaço Vitalidade no pavimento de lazer.” |
| Cuidar de si, descanso | `/img/alma/casa-de-banho.jpg` | “Perspectiva da casa de banho do projeto do Alma.” |
| Cuidar de si, sauna | `/img/alma/sauna.jpg` | “Perspectiva da sauna seca do projeto do Alma.” |
| Implantação | `/img/alma/planta-lazer.jpg` | “Planta humanizada do pavimento de lazer, incluindo garagem e áreas de apoio.” |
| Implantação | `/img/alma/planta-rooftop.jpg` | “Planta humanizada do rooftop do Alma.” |

**Ambientes sem imagem individual inequívoca:** pet place, Wine Bar e Lounge das Pedras constam na relação textual. Não lhes atribuir foto de outro ambiente.

**Texto público final da relação por pavimento, junto às implantações:**

**Lazer e bem-estar:**

> Piscina aquecida, prainha, hidromassagem, jardins e solarium, gourmet junto à piscina, playground Casa da Árvore, pet place, academia, Espaço Vitalidade, casa de banho e sauna seca.

**Rooftop:**

> Salão de festas, Jantar Jardim, Pub View, Wine Bar, Fire Place, brinquedoteca Floresta Encantada e Lounge das Pedras.

### 6. Organização visual

Quatro grupos com uma imagem principal, título, parágrafo e identificação de pavimento. No computador, grade de dois grupos por linha; no celular, sequência vertical. As imagens complementares ficam em expansão por grupo, mantendo a capa visível. Não usar carrossel automático.

Ao final, apresentar “Um sábado no Alma” como três pequenas situações e, depois, a consulta às duas implantações. Não repetir piscina, spa e rooftop em capítulos autônomos que recriem a extensão atual. O rooftop permanece reconhecível pelo nome nas legendas, pelo conjunto de ambientes e pela planta.

### 7. Botões

**Principal da seção:** “Ver os dois pavimentos” → expandir mapa de ambientes.  
**Por grupo:** “Conhecer os ambientes” → galeria e relação daquele grupo.  
**Por planta geral:** “Ampliar planta do pavimento” → visor com legenda.

### 8. Interações

Expansões mantêm o visitante no grupo e têm estado acessível. Trocar a implantação não muda a tipologia de apartamento escolhida. Ampliar render preserva nome do ambiente e pavimento. Pet place entra no pavimento de lazer; Wine Bar e Lounge das Pedras, no rooftop. Não desenhar pontos clicáveis sobre posições não confirmadas na planta; a lista textual identifica o pavimento sem inventar geometria.

### 9. Celular

Uma capa por grupo, com textos curtos e ação de consulta. Carregar imagens complementares sob demanda. A implantação abre inteira; o visor permite ampliar mantendo legenda e controles. Os três momentos do sábado ficam em blocos curtos, sem novas telas integrais.

### 10. Critérios de aceite

- Cada ambiente está no grupo e pavimento corretos.
- `alma/gourmet.jpg` identifica o salão do rooftop; não confundir com `alma-gourmet.jpg`.
- `alma-rooftop.jpg` não é usado como prova visual de rooftop, conforme divergência registrada em B1.
- Não há promessas de aulas, tratamentos, monitoria, uso exclusivo, aquecimento ininterrupto ou disponibilidade permanente.
- As pranchas não apresentam garagem/circulação como lazer adicional.
- Todos os grupos são compreensíveis sem abrir cada galeria.

## 7. S06 — Localização e vida cotidiana

### 1. Objetivo

Mostrar o caminho real e o endereço, aproximando a localização da experiência cotidiana sem inventar conveniências ou tempos. Base: B1 §§3.1, 4.3 e P04/P05.

### 2. Título final

**Texto público — H2:** “A praia faz parte do caminho.”

### 3. Subtítulo e textos finais

**Subtítulo:** “Perequê, Porto Belo.”

> O Alma fica na Rua Wilson Belber, 316, em Perequê, a aproximadamente 300 m da praia. Veja o percurso real e conheça a relação do endereço com a orla.

**Endereço em texto:** “Rua Wilson Belber, 316 · Balneário Perequê · Porto Belo, SC”.

**Apoio:**

> Para planejar sua rotina, comece pelo que importa para você: a praia, os deslocamentos e os caminhos que pretende fazer no dia a dia.

### 4. Microtextos e legendas

**Vídeo:** “Trajeto do Alma até a praia”.  
**Legenda:** “Gravação real do percurso, apresentada em edição de vídeo.”  
**Distância:** “Distância de referência informada para o empreendimento.”  
**Três quadros:** “Na rua do empreendimento” · “A travessia da avenida” · “A chegada à praia”.

A referência de 300 m segue B1; não representa nova medição desta fase. Omitir “quatro minutos”, Bombinhas 10/17 km, Itapema 12 km/3 min e outras comparações sem critério uniforme. Não usar a duração do vídeo editado como tempo de caminhada.

### 5. Imagens e vídeos

| Arquivo | Uso | Alternativa textual |
| --- | --- | --- |
| `/video/alma/trajeto.mp4` | Percurso real, sob demanda | Descrição textual do percurso abaixo |
| `/img/alma/poster-trajeto.jpg` | Capa do vídeo | “Quadro do vídeo do trajeto entre o Alma e a praia.” |
| `/img/alma/trajeto-porta.jpg` | Saída | “Registro da rua junto ao empreendimento.” |
| `/img/alma/trajeto-avenida.jpg` | Travessia | “Registro da travessia da avenida no percurso até a praia.” |
| `/img/alma/trajeto-praia.jpg` | Chegada | “Registro da chegada à Praia do Perequê.” |

**Descrição textual de apoio ao vídeo:** “O percurso apresentado parte da rua do empreendimento, passa pela travessia da avenida e chega à Praia do Perequê.” Não certificar acessibilidade, condição atual das calçadas ou segurança de toda a rota com base nos quadros.

**Novo espaço:** M08 — “Vídeo: uma manhã em família no Perequê”, complementar ao percurso, conforme §18. Sua ausência não impede a publicação do trajeto já existente.

### 6. Organização visual

Uma única seção de localização, reunindo vídeo, quadros e endereço. Vídeo vertical com largura adequada, acompanhado do texto no computador; sem recortar o vídeo para simular um formato horizontal. Os três quadros funcionam como sequência legível. O mapa atual pode ser mantido para localizar o endereço, em área de consulta, sem misturar distâncias de origens diferentes.

Reservar M08 no final do bloco como faixa editorial 16:9. O novo vídeo mostra vida cotidiana real no entorno; não substitui a prova do trajeto. Na versão pública sem M08, recolher essa faixa.

### 7. Botões

**Principal:** “Ver o trajeto até a praia” → reproduzir o vídeo no seu quadro.  
**Secundário:** “Abrir endereço no mapa” → endereço do empreendimento no serviço de mapas existente. Informar abertura em nova aba no nome acessível.

### 8. Interações

Vídeo só inicia após ação e possui controles. Se houver fala relevante, fornecer legendas revisadas a partir do áudio; não inventar transcrição. Na falta do arquivo de vídeo, manter as três imagens, o endereço e a descrição textual, sem botão de reprodução inativo. O mapa não deve anunciar que seu destino genérico coincide com um acesso à areia medido e validado.

### 9. Celular

Título e endereço, vídeo vertical, sequência de quadros e link do mapa. Mapa recolhido ou carregado sob demanda para preservar leitura e desempenho. Os quadros podem ser empilhados; manter os rótulos na ordem do percurso. M08 usa o recorte mobile próprio se for produzido.

### 10. Critérios de aceite

- Endereço e referência de praia estão coerentes em toda a página e metadados.
- Nenhum tempo de caminhada deriva dos 64 segundos do vídeo editado.
- Não há comércio, escola, farmácia ou serviço local nomeado sem levantamento próprio.
- O mapa abre o endereço correto; a página funciona mesmo com o serviço externo indisponível.
- A localização não se repete em outro capítulo da landing.

## 8. S07 — Conforto e diferenciais

### 1. Objetivo

Relacionar características aprovadas do projeto à vida doméstica e permitir consulta técnica sem uma longa lista inicial. Base: B1 §3.5 e P06/P09/P12.

### 2. Título final

**Texto público — H2:** “O cuidado também está no que você usa todos os dias.”

### 3. Subtítulo e textos finais

**Subtítulo:** “Acabamentos, espaços de apoio e infraestrutura fazem parte da experiência de morar.”

**Introdução:**

> Além dos ambientes que você vê nas imagens, o projeto reúne soluções para conforto e rotina. Conheça as especificações e converse com a equipe sobre os detalhes da entrega.

| Título do bloco | Texto público final |
| --- | --- |
| Conforto entre os ambientes | Isolamento acústico e térmico entre lajes e paredes de divisa: uma escolha de projeto voltada ao conforto dentro de casa. |
| Materiais para diferentes momentos | Porcelanato no living e piso vinílico nas suítes acompanham os diferentes usos da casa, da convivência aos momentos de descanso. |
| Um apoio para a rotina | Área de serviço fechada e ventilada para as tarefas do dia a dia, além de área técnica com brise. |
| A volta da praia | Entrada de banhistas, ducha/lava-pés e box de praia individual dão apoio ao retorno do mar. |
| Infraestrutura para suas escolhas | Infraestrutura prevista para split e automação permite planejar a instalação desses recursos, conforme o projeto. |
| O condomínio no conjunto | Medição individual de água, energia e gás para acompanhar os consumos da unidade. Dois elevadores e lazer previsto mobiliado e equipado completam o conjunto. |

**Conteúdo final da consulta “Especificações do projeto”:**

| Grupo | Lista pública |
| --- | --- |
| Apartamento | Living integrado à cozinha; lavabo; churrasqueira a carvão com exaustão e damper; porcelanato no living; vinílico nas suítes; forro de gesso com cortineiro; nicho revestido. |
| Conforto e instalações | Isolamento acústico e térmico nas lajes e paredes de divisa conforme o projeto; água quente e monocomando; infraestrutura para split e automação; área técnica com brise; área de serviço fechada e ventilada. |
| Apoio à praia | Entrada de banhistas, ducha/lava-pés e box de praia individual. |
| Áreas comuns e sistemas | Dois elevadores; hall mobiliado, decorado e sonorizado; lazer mobiliado, decorado, equipado e com enxoval; medição individual de água, energia e gás; previsão de gerador de emergência e reuso de água da chuva. |

**Nota pública da consulta:** “Resumo das especificações divulgadas para o projeto. Consulte a equipe sobre o detalhamento dos sistemas e as condições aplicáveis à entrega. Infraestrutura para equipamentos não significa fornecimento dos aparelhos.”

Não anunciar economia de energia, autonomia do gerador, marcas, desempenho acústico em decibéis, valor de condomínio ou vínculo técnico entre cisterna e reuso sem documentação adicional. Não chamar esse resumo de memorial contratual disponível para download.

### 4. Microtextos e legendas

**Consulta:** “Consultar as especificações” / “Recolher especificações”.  
**Imagem de apoio existente:** “Perspectiva ilustrativa do hall do projeto.”  
**Novo espaço:** “M07 — Imagem: o apoio na volta da praia”.

### 5. Imagens

`/img/alma/hall.jpg` como imagem de apoio geral, alt “Perspectiva ilustrativa do hall social do Alma.” Não usar o render como prova visível de uma solução acústica ou de equipamento oculto.

Reservar M07, em 4:3, junto ao bloco “A volta da praia”. Deve ser render baseado no espaço realmente projetado ou material técnico ilustrado aprovado. Na ausência de M07, manter o bloco textual, sem atribuir a ele foto de outro local.

### 6. Organização visual

Seis itens curtos, em duas ou três colunas no computador e uma coluna no celular. Uma imagem de apoio, sem exigir render para cada especificação. Resumo técnico em expansão no final. O retorno da praia recebe destaque por ligar localização e uso, sem esconder os demais itens.

### 7. Botões

**Principal:** “Consultar as especificações” → expansão.  
**Ao final da consulta:** “Tirar uma dúvida com a equipe” → `#contato`.

### 8. Interações

A expansão mantém o conteúdo textual acessível e indexável na página. Não mostrar botão “Baixar memorial” sem arquivo validado e disponível. O controle não altera a seleção de planta. Novos materiais só entram com identificação de natureza: render, fotografia real ou esquema técnico.

### 9. Celular

Blocos curtos com títulos claros, sem ícones minúsculos como única identificação. A lista expandida permanece em uma coluna com separações por grupo. M07 tem proporção reservada e não empurra controles para fora da área visível durante carregamento.

### 10. Critérios de aceite

- Cada característica consta de B1; nenhum atributo do Flow ou dos cases é incorporado.
- Não há promessa de silêncio, economia, desempenho numérico ou fornecimento de aparelhos a partir de infraestrutura.
- O resumo é consultável sem ser chamado de memorial integral.
- As imagens não são apresentadas como evidência de características invisíveis.

## 9. S08 — Bossa e acompanhamento da obra

### 1. Objetivo

Oferecer provas proporcionais de confiança: quem realiza, entregas anteriores e atualização de obra identificada pelo mês. Base: B1 §§3.4–3.5, F11 e P02/P03/P09.

### 2. Título final

**Texto público — H2:** “Conheça quem constrói. Acompanhe o que acontece.”

### 3. Subtítulo e textos finais

**Subtítulo:** “O Alma é um empreendimento da Bossa Empreendimentos.”

**Apresentação:**

> Conhecer a construtora faz parte da escolha da sua próxima casa. Veja as entregas anteriores da Bossa e consulte os registros disponíveis sobre a construção do Alma.

**Cartões de entregas:**

- **Jazz** — “Entregue em setembro de 2019.”
- **Soul** — “Entregue em dezembro de 2023.”

**Título da obra:** “A construção do Alma, em cada registro.”

**Bloco de dados:**

> Último boletim publicado: **agosto de 2026**  
> Avanço geral informado nessa edição: **10,52%**  
> Boletim nº 07

**Texto da edição:**

> A edição de agosto registra os serviços de fundação, reservatórios e infraestrutura descritos no boletim. Consulte o registro completo para conhecer as etapas informadas naquele período.

**Linha de prazo:** “Início da obra: julho de 2025 · Entrega prevista: julho de 2030.”

**Apoio:** “Para informações mais recentes, converse com a equipe Bossa.”

Sem nova fonte, agosto/2026 continua sendo a referência. O texto não declara execução posterior das atividades antes previstas para setembro. Não usar “atualizado todo mês”, “hoje 10,52%”, antecipação garantida, risco zero ou afetação comprovada sem documentação correspondente.

### 4. Microtextos e legendas

**M02:** “Fábio apresenta o Alma”.  
**M03:** “Obra do Alma · registros de {mês e ano confirmados}”.  
**M04 Jazz:** “Jazz · fotografia do empreendimento entregue”.  
**M04 Soul:** “Soul · fotografia do empreendimento entregue”.

As chaves acima são variáveis editoriais a preencher com material real; não aparecem literalmente ao público. Na prévia, usar os nomes M02/M03/M04 do §18. Toda foto de obra recebe data de captura quando conhecida; a data da medição pode ser diferente e deve permanecer identificada separadamente.

### 5. Acervo existente e espaços reservados

Não foram localizadas fotos de execução do Alma na ficha. Por isso, o núcleo do bloco funciona com dados e link ao boletim existente.

- **M02 — Vídeo: Fábio apresenta o Alma**, 16:9, reprodução sob demanda.
- **M03 — Fotos e vídeo: obra do Alma em {mês/ano}**, galeria 16:9, data a confirmar.
- **M04A — Foto real: Jazz entregue** e **M04B — Foto real: Soul entregue**, cartões 4:3.

Não usar vídeo do Flow como obra do Alma nem render de fachada como fotografia de construção. Na ausência dos novos materiais, os respectivos espaços são identificados na prévia; a versão pública usa os cartões textuais e o boletim real.

### 6. Organização visual

Primeiro a Bossa, com dois cartões de entregas e o vídeo de apresentação em bloco compacto. Em seguida, a obra do Alma com mês/ano tão visível quanto o percentual. M03 é galeria de apoio ao registro, não pano de fundo genérico. O boletim pode continuar na rota existente; a landing contém apenas seu resumo datado.

### 7. Botões

**Principal da obra:** “Ver boletim de agosto de 2026” → `/obras/alma-seahouses/2026-08`.  
**Após M02 existir:** “Ouvir Fábio sobre o Alma” → vídeo.  
**Link de apoio:** “Conversar com a equipe Bossa” → `#contato`.

### 8. Interações

Os dados de mês, percentual e rota precisam vir da mesma edição. Uma nova medição validada substitui o conjunto, mantendo acesso à edição anterior na estrutura de obras. Foto nova não atualiza automaticamente o percentual. Pedido de informação não cadastra o visitante em uma assinatura de boletim inexistente.

### 9. Celular

Apresentar cartões de Jazz e Soul com nome e data legíveis; manter o percentual e o mês no mesmo quadro. Vídeos carregam ao solicitar reprodução. Fotos ampliam com legenda e data. A leitura do resumo de obra funciona sem abrir mídia.

### 10. Critérios de aceite

- 10,52% e agosto/2026 aparecem no mesmo componente e na resposta relacionada da FAQ.
- Link do boletim abre a edição correta.
- Nenhum texto infere situação cartorial a partir da configuração do site.
- Toda mídia de entrega/obra é real e corresponde ao empreendimento identificado.
- A atualização da edição não exige alterar manualmente números divergentes em vários blocos.

## 10. S09 — Dúvidas frequentes

### 1. Objetivo

Resolver dúvidas de compreensão e orientar a conversa sem transformar pendências em promessas. Base: B1 §§3–4 e P01–P12.

### 2. Título final

**Texto público — H2:** “Algumas respostas antes da nossa conversa.”

### 3. Subtítulo e respostas finais

**Subtítulo:** “Informações para conhecer o projeto com mais clareza.”

**1. Quais são as opções de apartamento do Alma?**

> O Alma tem apartamentos de 103 e 114 m² privativos, com três suítes, e duplex de 145 e 168 m² privativos, com quatro suítes. Todas as quatro tipologias têm duas vagas de garagem.

**2. Como comparar os apartamentos de 103 e 114 m²?**

> Os dois têm três suítes e duas vagas. Você pode ampliar as plantas para conhecer a organização de cada opção. Para comparar medidas de ambientes e possibilidades de mobiliário, converse com a equipe sobre os desenhos técnicos disponíveis.

**3. Por que as plantas dos duplex mostram dois apartamentos?**

> As imagens disponíveis são pranchas gerais do pavimento, com duas unidades e a circulação comum. O desenho completo não representa a área privativa de um único duplex. Nossa equipe pode orientar a identificação da opção que você deseja conhecer.

**4. Quantos apartamentos há por andar?**

> São dois apartamentos por andar, em um empreendimento com 48 unidades no total.

**5. O Alma fica de frente para o mar?**

> Não. O Alma fica na Rua Wilson Belber, 316, em Perequê, com distância de referência de aproximadamente 300 m da praia. Você pode assistir ao vídeo do percurso e abrir o endereço no mapa nesta página.

**6. Quais ambientes de lazer estão previstos?**

> São 850 m² de lazer distribuídos em dois pavimentos. O projeto reúne piscina, espaços para brincar, receber e cuidar de si, incluindo playground, brinquedoteca, gourmet, salão de festas, academia, casa de banho e sauna. Veja a seção de lazer para conhecer os ambientes e seus pavimentos.

**7. Qual é a previsão de entrega?**

> A entrega do Alma está prevista para julho de 2030. A construção teve início em julho de 2025.

**8. Como posso acompanhar a obra?**

> Consulte os boletins de obra disponíveis no site. A edição de agosto de 2026 informa avanço geral de 10,52% naquele período. Para informações mais recentes, converse com a equipe Bossa.

Essa resposta deve ser vinculada à mesma edição da seção de obra. Quando houver atualização validada, mês e percentual mudam juntos.

**9. As imagens mostram a vista do meu futuro apartamento?**

> As imagens de drone são referências do entorno em alturas associadas ao projeto. A vista de cada apartamento depende da posição e do pavimento e pode mudar com o entorno. Os renders são perspectivas ilustrativas.

**10. Posso conhecer o projeto pessoalmente?**

> Você pode solicitar uma apresentação à equipe Bossa no escritório da Rua São José, 163, térreo do Flow, em Perequê, Porto Belo. O dia e o horário são combinados e confirmados pela equipe. A apresentação é do projeto do Alma.

**11. Posso conversar sobre personalização ou mobiliário?**

> Conte à equipe o que você imagina para sua rotina. Possibilidades de alteração dependem de avaliação técnica e das condições aplicáveis ao projeto. As plantas e imagens desta página não representam uma autorização de personalização.

**12. Já existe um valor de condomínio informado?**

> A página ainda não apresenta uma estimativa de condomínio. Converse com a equipe para conhecer as informações disponíveis sobre a futura operação do empreendimento.

**13. Quais cuidados de conforto estão previstos nos apartamentos?**

> O projeto prevê isolamento acústico e térmico entre lajes e paredes de divisa, porcelanato no living, vinílico nas suítes e área de serviço fechada e ventilada. Também há infraestrutura para split e automação, que não significa fornecimento dos aparelhos. Consulte a seção de conforto e converse com a equipe sobre o detalhamento das especificações.

### 4. Microtextos

**Fechamento:** “Ficou alguma dúvida sobre o que faz sentido para você?”  
**Controle:** a própria pergunta é o botão de expandir; estado aberto/fechado é anunciado.  
**CTA:** “Conversar com a equipe”.

### 5. Imagens

Nenhuma imagem nova. A seção é textual, com espaço e contraste adequados, para facilitar consulta.

### 6. Organização visual

Lista de perguntas em uma coluna. Todas as respostas ficam no documento da página, em controles de expansão acessíveis. Começar com as perguntas recolhidas; permitir mais de uma aberta para comparação. Sem contadores ou badges que apresentem dúvidas como obstáculo comercial.

### 7. Botões

**Principal:** “Conversar com a equipe” → `#contato`.  
Links úteis dentro de respostas: “Ver plantas” → `#plantas`; “Ver o trajeto” → `#localizacao`; “Ver os ambientes” → `#lazer`; “Ver boletim” → rota da edição.

### 8. Interações

Abrir pergunta não altera planta ou finalidade de contato. O evento de abertura usa um identificador estável da pergunta, sem copiar texto livre do usuário. A FAQ não deve receber respostas de simulação financeira ou compra enquanto o estado continuar em pré-registro.

### 9. Celular

Pergunta inteira é uma área confortável de toque, com ícone de expansão separado da leitura. Texto da resposta não pode ficar em fonte menor que o restante do conteúdo apenas para caber. Espaçamento suficiente entre perguntas e links.

### 10. Critérios de aceite

- As 12 perguntas e respostas estão presentes com redação final.
- Datas, áreas, vagas e nomes coincidem com as demais seções.
- A obra usa a mesma fonte de edição do bloco S08.
- Acessibilidade de expansão e foco conferida por teclado.
- Não há reserva, preço histórico, simulação inexistente ou promessa de personalização incluída.

## 11. S10 — Conversa e próximo passo

### 1. Objetivo

Oferecer atendimento consultivo e uma alternativa simples de registro de interesse. Preservar o contexto da planta no WhatsApp e manter os formulários coerentes com o que o servidor realmente registra. Base: B1 §§3.4, 6 e 9; T1/T4/T5.

### 2. Título final

**Texto público — H2:** “Conte como você imagina viver aqui.”

### 3. Subtítulo e textos finais

**Subtítulo:** “Uma conversa pode ajudar a encontrar a opção que combina com a sua rotina.”

**Texto:**

> Quer morar perto da praia, ter um lugar para reunir a família ou entender melhor as plantas? Conte o que é importante para você. Nossa equipe apresenta o projeto e ajuda a comparar as opções.

**Contexto junto ao WhatsApp, quando houver:** “Você está conhecendo: {área} · {suítes} suítes · {tipo}”.  
**Ação de contexto:** “Alterar planta” → `#plantas`. Esse rótulo identifica consulta, não reserva ou preferência definitiva.

**Apresentação presencial — texto:**

> Você também pode solicitar uma apresentação do projeto no escritório da Bossa. O dia e o horário são combinados com a equipe.

**Endereço do escritório:** “Rua São José, 163 · Térreo do Flow · Perequê, Porto Belo”.

**Alternativa do formulário — título:** “Prefiro receber um contato.”

**Texto do formulário:**

> Deixe seu nome e WhatsApp para conversar com a Bossa sobre o Alma.

### 4. Microtextos completos do formulário

| Elemento | Texto público |
| --- | --- |
| Campo obrigatório | Nome |
| Campo obrigatório | WhatsApp |
| Ajuda do telefone | No Brasil, informe DDD e número. Para outro país, comece com + e o código do país. |
| Campo opcional | Como você imagina usar o Alma? — opcional |
| Primeira opção vazia | Selecione, se quiser |
| Opções | Morar; Casa de praia; Investir; Ainda estou conhecendo |
| Consentimento, desmarcado inicialmente | Aceito receber contato da Bossa por WhatsApp sobre este assunto. Veja a Política de Privacidade. |
| Link de privacidade | Política de Privacidade → `/privacidade` |
| Envio | Registrar meu interesse |
| Enviando | Registrando… |
| Sucesso comprovado | Seu interesse no Alma foi registrado. A equipe Bossa entrará em contato pelo número informado. |
| Falha geral | Não foi possível concluir o registro. Tente novamente ou converse com a equipe pelo WhatsApp. |
| Falha de conexão | Sem conexão no momento. Seus dados continuam aqui. Tente novamente quando a conexão voltar. |
| Erro de nome | Escreva seu nome para sabermos com quem falar. |
| Erro de telefone | Confira o DDD e o número. Para outro país, informe também + e o código do país. |
| Erro de aceite | Precisamos do seu aceite para entrar em contato sobre este assunto. |

Na primeira versão, esse formulário registra interesse geral no Alma e a finalidade opcional. Não expor campos que a integração atual descarta, como mensagem livre, planta ou data de apresentação, até que sua persistência seja implementada e verificada conforme §12. O contexto da planta permanece explícito no caminho de WhatsApp, que é a ação principal.

### 5. Imagens

Usar o logo sálvia ou claro conforme o fundo. O bloco funciona sem fotografia adicional; evitar repetir fachada, piscina e imagens ilustrativas de família só para preencher espaço. O espaço M02 já permite aproximar a equipe do cliente na seção anterior.

### 6. Organização visual

Uma única área de contato no final, com WhatsApp em destaque. O formulário aparece após “Prefiro receber um contato”, em expansão no mesmo bloco. “Solicitar uma apresentação” é ação secundária textual, que abre WhatsApp com pedido específico. Não criar três formulários concorrentes para interesse, book e visita.

O pedido de apresentação é consultivo; não mostrar calendário com horários supostamente livres nem data que o servidor não persistirá. Pedido de material vai para o mesmo atendimento, quando necessário, sem anunciar download automático inexistente.

### 7. Botões e destinos

| Hierarquia | Texto | Destino |
| --- | --- | --- |
| Principal, sem contexto | Conversar sobre o Alma | WhatsApp geral |
| Principal, com contexto | Conversar sobre esta planta | WhatsApp contextual; em duplex, usar “Conversar sobre este duplex” |
| Secundário | Prefiro receber um contato | Abrir formulário |
| Secundário | Solicitar uma apresentação | WhatsApp, solicitação a confirmar pela equipe |
| Dentro do formulário | Registrar meu interesse | Envio de interesse geral |
| Após falha | Conversar pelo WhatsApp | Canal de atendimento, preservando contexto de consulta quando houver |

### 8. Interações

Ao abrir o formulário, mover o foco para seu título ou primeiro campo, sem perder conteúdo digitado ao alternar planta. Nenhum campo de finalidade vem pré-marcado como “Morar”. Não exigir e-mail, documento, renda, prazo de compra ou outros dados para este primeiro contato.

Sucesso só aparece após confirmação de registro efetivo no serviço. HTTP bem-sucedido com `gravado: false` não é sucesso comercial. Preservar os dados em falhas e bloquear envio duplicado enquanto uma solicitação estiver em andamento. Usar a mensagem “Sem conexão no momento” apenas quando a aplicação identificar falta de conexão; erro de servidor, rejeição ou causa indeterminada usam a mensagem geral de falha. Mensagem de WhatsApp é apenas preparada; o envio depende do visitante.

### 9. Celular

Campos em uma coluna, rótulos visíveis e teclado de telefone adequado. A barra inferior recolhe quando o formulário/teclado ou o contato final estiver visível. Erros ficam junto ao campo e o foco permite corrigi-los. O botão de envio e a Política de Privacidade não ficam encobertos.

### 10. Critérios de aceite

- WhatsApp usa a planta em consulta quando a ação justificar o contexto; sem escolha/contexto, a mensagem é geral.
- O formulário não sugere que guarda uma tipologia ou uma data que o contrato não recebe.
- `gravado: false`, erro de validação ou erro de rede não geram mensagem de sucesso nem evento de lead confirmado.
- Finalidade opcional começa vazia; consentimento começa desmarcado.
- Código internacional informado é preservado no fluxo de validação; não prefixar indiscriminadamente 55.
- Pedido de apresentação não é chamado de agendamento confirmado.

## 12. Contrato da jornada: planta, compartilhamento e contato

### 12.1 Rotas e estado da consulta

Preservar as rotas individuais já existentes. O compartilhamento usa o domínio efetivo do ambiente, a rota abaixo e a âncora `#plantas`; a produção usa o domínio público configurado no projeto, sem fixar o endereço temporário de prévia no conteúdo.

| Opção | Rota preservada |
| --- | --- |
| 103 m² · Tipo 02 | `/empreendimentos/alma-seahouses/plantas/tipo-02#plantas` |
| 114 m² · Tipo 01 | `/empreendimentos/alma-seahouses/plantas/tipo-01#plantas` |
| 145 m² · Duplex Tipo 2 | `/empreendimentos/alma-seahouses/plantas/duplex-tipo-2#plantas` |
| 168 m² · Duplex Tipo 1 | `/empreendimentos/alma-seahouses/plantas/duplex-tipo-1#plantas` |

A página geral começa com o Tipo 02 visível no seletor. Isso não torna o Tipo 02 uma preferência declarada. O estado da experiência deve distinguir **opção em exibição**, **origem em link de uma tipologia** e **escolha explícita no seletor**. Não é necessário expor esses estados técnicos ao visitante.

| Situação | Exibição do seletor | WhatsApp dentro do painel | WhatsApp geral, da barra ou do contato final |
| --- | --- | --- | --- |
| Chegada pela página geral, sem interação | 103 m² como ponto de partida | Fala sobre a opção exibida, pois o botão identifica “esta planta” | Mensagem geral sobre o Alma |
| Chegada por uma rota de tipologia | Opção da rota | Mensagem sobre a opção da rota | Pode citar a opção em consulta, sem dizer que o visitante a escolheu para comprar |
| Escolha explícita no seletor ou na comparação | Opção selecionada | Mensagem da opção selecionada | Mantém a opção em consulta |
| Abertura de FAQ, lazer ou localização | Preserva opção | Preserva opção | Preserva contexto anterior |
| Recarga de uma rota individual | Restaura opção da rota | Restaura opção da rota | Contexto de consulta, sem atribuir preferência definitiva |

Título, área, suítes, imagens, nota dos duplex, URL, compartilhamento e mensagem de atendimento derivam de uma única seleção. Não atualizar apenas o texto visível da barra por manipulação isolada do elemento, deixando o link com uma opção anterior. A implementação pode reutilizar o estado existente ou ajustá-lo no componente Alma, sem exigir mudança no CRM.

Atualizar a URL substituindo a entrada atual do histórico, sem recarregar a página, remontar a landing ou mover a rolagem. Mudar a opção não deve obrigar o visitante a atravessar todas as plantas ao usar “Voltar”. Navegar para outra página e voltar deve restaurar a opção representada na rota. Rotas inválidas mantêm a resposta de página não encontrada; não transformá-las silenciosamente em uma tipologia válida.

Compartilhar gera um endereço limpo. Remover parâmetros de formulário, nome, telefone, identificador de visitante e demais dados pessoais. Não anexar o código interno de atendimento ao link compartilhado da planta. A identificação de atendimento já usada pelo componente de WhatsApp permanece restrita a esse fluxo existente.

### 12.2 Mensagens de WhatsApp prontas

Reaproveitar `LinkWhatsApp` e a origem única do telefone em `site.ts`. O número identificado em B1 é `554792889395`; não duplicá-lo manualmente em cada botão. A implementação deve preservar o canal vigente e a formatação já usada pelo site.

**Mensagem geral:**

> Olá! Quero conhecer melhor o Alma Sea Houses e entender as opções do projeto.

**Mensagem de planta:**

> Olá! Estou conhecendo o Alma Sea Houses e gostaria de conversar sobre a opção de {área} m², {nome da tipologia}, com {número} suítes.

Exemplo completo, para 114 m²:

> Olá! Estou conhecendo o Alma Sea Houses e gostaria de conversar sobre a opção de 114 m², Tipo 01, com 3 suítes.

Exemplo completo, para 168 m²:

> Olá! Estou conhecendo o Alma Sea Houses e gostaria de conversar sobre a opção de 168 m², Duplex Tipo 1, com 4 suítes.

**Mensagem para solicitar apresentação, sem contexto de planta:**

> Olá! Gostaria de solicitar uma apresentação do projeto do Alma Sea Houses. Podemos combinar um dia e horário?

**Mensagem para solicitar apresentação, com contexto:**

> Olá! Gostaria de solicitar uma apresentação do projeto do Alma Sea Houses e entender melhor a opção de {área} m², {nome da tipologia}, com {número} suítes. Podemos combinar um dia e horário?

As variáveis são preenchidas com os quatro registros aprovados. O visitante pode editar a mensagem no WhatsApp. O site abre o canal; não envia mensagens automaticamente, não confirma recebimento pela equipe e não agenda uma apresentação por conta própria.

A finalidade do formulário não precisa ser copiada para essas mensagens na primeira versão. Se houver uso futuro desse campo no atendimento contextual, transmitir apenas uma resposta realmente escolhida pelo visitante e deixar isso claro na interface. Não inferir “Morar” da ausência de resposta.

### 12.3 Formulário: limite verificado e comportamento obrigatório

**Evidência de código:** o formulário atual transmite mais informações do que a rota registra. A rota consultada recebe os campos básicos e encaminha uma finalidade curta; não há persistência de planta ou data nesse contrato. Há um caminho que responde HTTP 200 com `gravado: false` quando a integração de banco não está configurada. Isso é uma possibilidade no código, não um diagnóstico de falha em produção. Não foi realizado envio real de lead nesta fase. Fontes: T1 e T5.

**Decisão para a primeira versão:** manter um único formulário de interesse geral no Alma, com nome, telefone, finalidade opcional e aceite. O atendimento sobre uma planta usa o WhatsApp contextual. Essa decisão permite entregar uma jornada verdadeira com os recursos atuais; a ampliação do contrato de persistência fica identificada como evolução, sem esconder dados de planta em outros campos.

Regras para a fase 3:

1. Usar o tipo de formulário existente para interesse e o identificador existente do Alma; preservar integração, rastreio de origem e proteção contra preenchimento automático já implementados.
2. Exibir sucesso e emitir o evento de registro confirmado somente com HTTP 2xx, `ok: true` e `gravado: true` simultaneamente no contrato atual. Campos ausentes, resposta sem JSON válido ou confirmação incompleta são falhas recuperáveis. Se a equipe mudar esse contrato, documentar e verificar o equivalente antes de alterar o critério.
3. Qualquer erro de rede, validação, integração ou `gravado: false` mantém os campos preenchidos, oferece nova tentativa e apresenta a alternativa de WhatsApp. Não mostrar mensagem de sucesso, disparar `lead_submit` ou limpar os dados nesses casos.
4. Finalidade começa vazia. Os rótulos propostos são curtos e cabem no limite observado de 40 caracteres; a integração deve aceitar ausência de resposta. Não usar esse campo para armazenar texto livre, planta, datas ou origem.
5. Validar telefone sem destruir código de país. O prefixo `+` identifica entrada internacional; número brasileiro sem prefixo usa DDD e número. Não adicionar `55` quando o usuário já informou outro código de país. Conferir normalizador, API e destino do registro. Suporte internacional de ponta a ponta ainda não foi verificado nesta fase. Se houver restrição no destino e a correção ultrapassar o escopo do site, impedir o envio incorreto e oferecer WhatsApp com a mensagem “Para contato com número de outro país, converse com a equipe pelo WhatsApp.” Registrar essa limitação na entrega da prévia; não transformar o número em um telefone brasileiro.
6. Consentimento começa desmarcado. O texto e o link de privacidade ficam junto do envio. Não converter o aceite de atendimento em promessa de participação em campanhas indefinidas.
7. O estado “Registrando…” impede cliques simultâneos no mesmo envio. Uma nova tentativa após falha é ação do visitante; não repetir automaticamente em segundo plano sem confirmação do resultado anterior.
8. Não incluir campos de data, mensagem livre, unidade ou planta enquanto não existir um destino verificado para eles. Não enviar esse contexto por UTMs ou campos sem relação com seu significado.
9. Validar os estados de sucesso e falha em ambiente isolado ou com respostas controladas. Evitar leads e mensagens de teste no atendimento real. A integração real pode ser conferida na fase de validação com identificação e procedimento apropriados.

### 12.4 Apresentação do projeto, materiais e pré-registro

“Solicitar uma apresentação” significa combinar atendimento com a equipe, no escritório ou pelo canal acordado. Não equivale a visita a um apartamento pronto do Alma. “Registrar interesse” não equivale a reserva de unidade.

Preservar os avisos existentes de pré-registro e de perspectivas ilustrativas, inclusive os componentes que os exibem no rodapé. Não alterar a configuração de estágio comercial, retirar avisos ou criar preço, estoque, reserva, pagamento e financiamento nesta fase. A referência documental continua sendo P03; a configuração técnica não comprova a situação de incorporação.

Não criar “Baixar book” se a ação apenas solicita contato. Se um arquivo oficial de book vier a ser disponibilizado, o botão, o arquivo, a versão e o evento de download devem ser definidos e verificados em conjunto. O pedido de material por atendimento pode ser atendido pelo fluxo atual, com nome coerente com a ação.

### 12.5 Metadados de apresentação e compartilhamento

Preservar a estrutura de SEO e de rotas existente, com conteúdo coerente com a página. Textos finais:

| Página | Título | Descrição |
| --- | --- | --- |
| Geral | Alma Sea Houses em Perequê \| Bossa Empreendimentos | Apartamentos de 3 suítes e duplex de 4 suítes em Perequê, Porto Belo. Conheça as plantas, os espaços de convivência e o projeto do Alma. |
| Tipo 02 | Alma Sea Houses: 103 m², 3 suítes \| Bossa | Conheça o Tipo 02 do Alma: 103 m² privativos, 3 suítes e 2 vagas. Amplie a planta e converse com a equipe sobre o projeto. |
| Tipo 01 | Alma Sea Houses: 114 m², 3 suítes \| Bossa | Conheça o Tipo 01 do Alma: 114 m² privativos, 3 suítes e 2 vagas. Amplie a planta e converse com a equipe sobre o projeto. |
| Duplex Tipo 2 | Alma Sea Houses: duplex de 145 m² \| Bossa | Conheça a opção de 145 m², com 4 suítes e 2 vagas. Consulte as pranchas gerais do pavimento e converse sobre o Duplex Tipo 2. |
| Duplex Tipo 1 | Alma Sea Houses: duplex de 168 m² \| Bossa | Conheça a opção de 168 m², com 4 suítes e 2 vagas. Consulte as pranchas gerais do pavimento e converse sobre o Duplex Tipo 1. |

Para a miniatura compartilhada da página geral e das duas rotas duplex, usar a fachada oficial, com identificação do Alma. Não usar a prancha de duas unidades como miniatura que pareça representar a área de um único duplex. Os tipos 01/02 podem manter a própria planta na miniatura, associada ao título correto. Não inserir preço, estoque, estrela de avaliação ou oferta em dados estruturados sem fonte autorizada. Manter os endereços canônicos de cada rota sem incluir a âncora ou parâmetros de visitante.

## 13. Eventos e leitura de conversão

### 13.1 Usar o contrato de eventos existente

O projeto já possui uma lista permitida de eventos e de atributos em `site/src/lib/eventos.ts`. Um nome novo não é aceito automaticamente. Na primeira versão, usar os nomes abaixo e os atributos já suportados, reaproveitando a instrumentação de `rastreio.ts` e `LinkWhatsApp`. Fontes: T2, T4, T6 e T7.

| Evento existente | Quando registrar | Atributos permitidos relevantes | Limite de interpretação |
| --- | --- | --- | --- |
| `view_project` | Identificação principal do Alma efetivamente exibida; uma vez por entrada na página | `empreendimento`, `estagio` | Exposição ao projeto |
| `view_floorplan` | Desenho da planta efetivamente visível por pelo menos 1 segundo, com a página ativa | `empreendimento`, `planta`, `metragem`, `suites` | Consulta visual; não preferência declarada |
| `switch_floorplan` | Troca explícita pelo visitante no seletor ou na comparação | `empreendimento`, `de`, `para`, `ordem` | Comparação/interesse em consultar |
| `floorplan_zoom` | Abertura efetiva do visor de uma planta | `empreendimento`, `planta` | Busca de detalhe |
| `gallery_interact` | Expansão da comparação, interação real com galeria ou ação de compartilhamento concluída | `empreendimento`, `planta`, `tema`, `botao`, `ambiente` quando aplicável | Interação; compartilhar não comprova entrega a outra pessoa |
| `video_play` | Início de reprodução solicitado pelo visitante | `empreendimento`, `video` | Interesse na peça; excluir animações automáticas |
| `view_location` | Conteúdo central de endereço/trajeto visível | `empreendimento` | Consulta à localização |
| `click_route` | Acionamento do link para abrir o endereço no mapa | `empreendimento`, `botao` | Abertura do serviço; não comprova visita presencial |
| `view_construction` | Resumo datado da obra efetivamente visível | `empreendimento`, `edicao` | Consulta à edição informada |
| `faq_open` | Abertura de uma resposta | `empreendimento`, `pergunta` | Dúvida consultada |
| `click_whatsapp` | Clique real em um link de WhatsApp | `empreendimento`, `planta` quando houver contexto, `botao` | Intenção de conversa; não comprova mensagem enviada ou lead recebido |
| `form_start` | Primeiro preenchimento significativo do formulário | `empreendimento`, `formulario` | Início de registro; simples foco ou abertura não basta |
| `lead_submit` | Registro confirmado conforme §12.3 | `empreendimento`, `formulario`, `interesse` quando respondido | Interesse efetivamente registrado pelo contrato do site |

**Exposição das plantas:** observar o quadro do desenho, não o componente inteiro montado fora da tela. A condição deve exigir visibilidade por 1 segundo, pelo menos metade da menor altura entre o quadro e a área útil da tela e pelo menos metade da largura do quadro. Pausar a contagem quando a aba estiver oculta. Contar uma exposição por tipologia por entrada na página; nova escolha que volte à mesma opção não duplica sua exposição naquela entrada. A inicialização de um link individual não é `switch_floorplan`.

Os demais eventos de exposição contam uma vez por seção por entrada, após conteúdo central visível por 1 segundo. Reutilizar o mecanismo existente quando ele satisfizer o critério, sem disparar dois eventos pelo mesmo gesto. Trocar a planta substituindo a URL não gera uma nova entrada, não reinicia a contagem de exposição e não emite um novo `page_view`. Eventos automáticos já emitidos na montagem do seletor precisam ser alinhados a essa regra. Essa mudança altera a comparabilidade histórica da métrica: registrar a data de início da nova versão.

Um link com `#plantas` pode levar diretamente ao seletor sem exibir a abertura. Por isso, `view_project`, com o critério acima, mede exposição à identificação principal e não é o total de entradas na landing. Taxas gerais usam as visitas/page views já disponíveis, incluindo as quatro rotas individuais. A verificação deve cobrir acessos pela página geral e por links compartilhados, sem criar denominadores que excluam essas entradas.

### 13.2 Identificadores de interação

Manter os nomes de evento existentes e usar valores estáveis para distinguir as ações:

| Ação | `tema` ou identificador | `botao` sugerido |
| --- | --- | --- |
| Abrir comparação | `tema: comparacao_plantas` | `abrir_comparacao` |
| Copiar link com sucesso | `tema: compartilhar_planta` | `copiar_link` |
| Compartilhamento nativo concluído | `tema: compartilhar_planta` | `compartilhar_nativo` |
| WhatsApp da abertura | — | `alma_abertura` |
| WhatsApp da planta | — | `alma_planta` |
| WhatsApp da barra móvel | — | `alma_barra_mobile` |
| WhatsApp do contato final | — | `alma_contato` |
| Solicitar apresentação | — | `alma_solicitar_apresentacao` |
| Abrir endereço | — | `alma_endereco` |

Usar os IDs das quatro plantas definidos no §4. Perguntas frequentes usam IDs estáveis de 01 a 13 na ordem editorial, sem incluir texto digitado pelo visitante. Vídeos usam nomes de acervo estáveis, como `trajeto`, `duplex` ou `fabio_apresenta_alma`, somente quando o material existir.

Cancelamento de compartilhamento não é sucesso nem falha de formulário. A resposta da API de compartilhamento indica conclusão da ação no aparelho, não leitura por um destinatário. Um espaço M01–M08 ainda sem mídia não dispara visualização/reprodução de conteúdo inexistente.

### 13.3 Conversões, consentimento e o que fica para depois

Separar nos relatórios **consulta à planta**, **intenção de conversar**, **interesse registrado** e **apresentação efetivamente combinada**. Não somar cliques de WhatsApp e registros de formulário como pessoas únicas sem identificação e deduplicação adequadas. A taxa de contato pode ser acompanhada, mas uma alteração visual não garante aumento de vendas.

O mapeamento atual associa `request_visit` a `Schedule` na Meta. Como a primeira versão apenas solicita uma apresentação pelo WhatsApp, registrar o clique como `click_whatsapp` e não disparar `request_visit`/`Schedule` como se houvesse horário confirmado. Usar essa conversão apenas após existir confirmação verificável de agenda em uma evolução específica.

Não disparar `download_material` em pedido de book sem entrega de arquivo, nem `view_price` ou `simulate_payment` nesta comunicação de pré-registro. O formulário de interesse geral não deve registrar uma planta como se ela tivesse sido gravada no cadastro do lead. O caminho contextual do WhatsApp possui sua própria informação de planta.

Preservar o funcionamento vigente de preferências de privacidade e a condição de consentimento para GA4 e Meta. Não transmitir nome, telefone, texto livre ou dados de contato nos eventos, nas URLs de compartilhamento ou nos nomes de mídia. As regras de rastreio interno existentes não são autorização para ampliar coleta nesta tarefa. Não trocar fornecedor de análise nem criar um novo painel de CRM na primeira versão.

**Leitura inicial após publicação:** acompanhar acesso às plantas, comparação, ampliação, clique contextual e registro confirmado; observar diferenças entre celular e computador quando a ferramenta já oferecer essa dimensão. Comparar períodos equivalentes, documentar mudanças na origem do tráfego e confrontar os sinais do site com a qualidade das conversas informada pelo comercial. Taxas de atendimento, apresentações realizadas e vendas dependem dos registros reais do processo comercial.

## 14. Acessibilidade, leitura e carregamento

### 14.1 Conteúdo e controles

- Um H1 na abertura; H2 por seção; H3 nos grupos internos. A ordem de leitura acompanha a ordem visual, inclusive no celular.
- Urbanist em corpo legível, com referência inicial de 16 px e entrelinha confortável. Não usar texto pequeno para esconder condição de obra, nota dos duplex ou limitações de vista.
- Contraste de texto de pelo menos 4,5:1, ou 3:1 para texto grande segundo os critérios da referência A1. A paleta é preservada por combinações adequadas de texto e fundo; não é necessário alterar as cores da marca.
- Adotar área de toque de pelo menos 44 × 44 px como meta de projeto para controles principais e utilitários. Essa escolha corresponde à referência ampliada A2, sem afirmar que 44 px é o mínimo universal de todo nível de conformidade.
- Seleção, erro, seção ativa e estados de expansão identificados por texto/forma e sem depender apenas da cor. Foco sempre visível.
- Textos alternativos identificam o conteúdo útil; logotipos repetidos e adornos são decorativos quando já houver identificação equivalente. Não descrever uma perspectiva ilustrativa como fotografia de imóvel pronto.
- O seletor oferece controles por teclado com estado selecionado anunciado. Definir um padrão acessível coerente, sem misturar funções de abas, links e botões de forma ambígua.
- Conteúdo essencial não depende de passar o mouse. Carrosséis não avançam sozinhos e possuem botões além do gesto de arrastar.

### 14.2 Ampliação, vídeo e formulários

O visor de plantas, lazer e imagens deve ter nome acessível, foco inicial dentro dele, navegação de foco contida enquanto estiver aberto, fechamento por Escape e retorno ao acionador. O conteúdo de fundo deixa de ser interativo durante o modal. A nota de pavimento completo dos duplex acompanha a imagem e permanece alcançável. Referência A3.

Vídeos com fala recebem legendas revisadas e resumo/transcrição do conteúdo. Vídeos de ambiente sem fala possuem descrição do que mostram. Respeitar movimento reduzido; loops da abertura e do duplex oferecem pausa e alternativa estática. Nenhum vídeo reproduz áudio automaticamente. Uma miniatura sem vídeo não recebe botão de reprodução.

Campos têm rótulo persistente, identificação de obrigatoriedade e erro associado ao campo. Sucesso e falha são anunciados sem exigir que o visitante procure uma mensagem fora da tela. Não limpar dados quando houver erro. A seleção de finalidade é opcional; o aceite não vem marcado. O link de privacidade permanece acessível.

### 14.3 Celular e desempenho percebido

Verificar leitura a partir de 320 px de largura e com ampliação de texto de 200%, sem perda de conteúdo ou rolagem horizontal da página. A comparação vira cartões. O visor pode mover a imagem ampliada, mantendo seus controles alcançáveis. Barras fixas respeitam a área segura, o teclado, o título da âncora e o contato final.

Reutilizar o tratamento de imagens do projeto. Priorizar o pôster e o conteúdo da abertura; carregar imagens distantes e vídeos consultáveis sob demanda. Não baixar todos os frames de drone e todos os vídeos na chegada. Reservar proporções dos arquivos para evitar saltos no layout. Usar tamanhos responsivos e recortes que não ocultem plantas ou alterem o significado dos renders.

A página funciona com pôsteres e texto quando o vídeo demora, não é suportado ou foi desativado pela preferência do visitante. O vídeo real do trajeto permanece acionado pelo usuário. Nada exige uma conexão rápida para encontrar a planta e o canal de contato.

## 15. Primeira versão, recursos preservados e entrega ao Codex

### 15.1 O que será reaproveitado

| Recurso existente | Decisão de implementação |
| --- | --- |
| `site/src/components/alma/AlmaLanding.tsx` | Reorganizar a landing do Alma conforme os dez blocos; aproveitar componentes e conteúdo verificado |
| `site/src/styles/alma.css` e carregamento das fontes | Preservar identidade, curvas e recursos de composição; ajustar responsividade e contraste |
| Conteúdo do Alma e arquivo de configurações do site | Manter fonte única dos dados e do canal de atendimento; não criar uma segunda tabela comercial |
| `SeletorPlantas.tsx` e rotas individuais | Reutilizar seleção, imagens e deep links; acrescentar comparação, ampliação acessível e compartilhamento conforme especificação |
| `LinkWhatsApp.tsx` | Manter destino centralizado, rastreio existente e referência de atendimento; tornar todas as ações do Alma coerentes com o contexto atual |
| `FormLead.tsx` e `/api/leads` | Reutilizar contrato de interesse geral; corrigir a confirmação de sucesso e os estados de falha necessários para esta jornada |
| `eventos.ts` e `rastreio.ts` | Usar eventos e atributos permitidos, respeitando consentimento e sem duplicação |
| Galerias, vídeos, vistas de drone e visor já presentes | Reaproveitar acervo e mecanismos que atendam aos critérios, corrigindo rótulos e exposição quando necessário |
| Rota do boletim `/obras/alma-seahouses/2026-08` | Manter acessível; landing resume a edição com sua data real |
| Cabeçalho, rodapé, privacidade e avisos comerciais | Preservar navegação institucional e avisos; remover apenas duplicação de contato dentro da experiência do Alma |
| Página do Flow e demais rotas | Preservar comportamento ao modificar componentes compartilhados; verificar efeitos concretos das mudanças comuns |

Os arquivos públicos de mídia deste documento correspondem a `site/public` no repositório. Por exemplo, `/img/alma/living.jpg` corresponde a `site/public/img/alma/living.jpg`. Caminhos de novos materiais do §18 são propostas de destino e só entram como arquivos reais após produção e aprovação.

### 15.2 Lista exata do que entra na versão inicial

1. Os dez blocos na ordem definida, com a redação final deste documento e a identidade atual.
2. Acesso às plantas na abertura, navegação local e barra inferior contextual no celular.
3. Interiores oficiais antes do lazer, em uma seção curta, com a posição M01 identificada na prévia.
4. Quatro opções visíveis, comparação de atributos aprovados, ampliação, compartilhamento e rotas preservadas.
5. Duas pranchas completas dos duplex com os avisos obrigatórios, sem contornos individuais inventados.
6. Configuração com dois apartamentos por andar e 48 apartamentos; consulta de vistas sob demanda, com suas limitações.
7. Lazer em quatro grupos de uso, todos os ambientes identificados com o pavimento correto, duas implantações e a versão breve de “Um sábado no Alma”.
8. Endereço, vídeo real do trajeto, quadros do percurso, mapa e referência aprovada de distância, sem números divergentes.
9. Benefícios de conforto sustentados pela ficha e consulta expandida às especificações aprovadas.
10. Histórico Bossa, entregas Jazz/Soul e boletim do Alma de agosto/2026 com 10,52% sempre acompanhado da data.
11. Treze perguntas frequentes com respostas completas.
12. WhatsApp contextual, solicitação de apresentação por conversa e um formulário curto de interesse geral, com confirmação verdadeira de gravação.
13. Instrumentação coerente com o contrato de eventos e com o que cada ação realmente comprova.
14. Espaços M01–M08 nomeados na prévia, com proporções e alternativas definidas; novos materiais aprovados podem entrar antes da publicação sem reabrir a estrutura editorial.
15. Leitura e navegação verificadas no celular, teclado, redução de movimento, modais, formulários e principais rotas individuais.

Não há, nesta entrega, novo aplicativo, integração de agenda, comparador de preço, simulador financeiro, mapa interativo de unidades disponíveis ou reforma do CRM. Esses recursos não são necessários para a jornada especificada.

### 15.3 Critérios de aceite integrados da prévia

| ID | Verificação | Resultado esperado |
| --- | --- | --- |
| A01 | Abertura no celular e no computador | Identificação, produto e acesso às plantas sem atravessar outras seções |
| A02 | Abrir as quatro rotas individuais, recarregar e compartilhar | Opção, imagens, atributos, nota e WhatsApp correspondentes em todos os casos |
| A03 | Trocar rapidamente entre tipos e duplex; voltar da comparação/visor | Nenhuma mistura de imagem, título, área, aviso ou mensagem |
| A04 | Consultar e ampliar ambos os duplex | Pavimentos completos com aviso visível; sem atribuição esquerda/direita ou social/íntimo não comprovada |
| A05 | Compartilhar, copiar, cancelar e simular indisponibilidade de compartilhamento | Link correto, retorno verdadeiro e alternativa copiável; cancelamento sem erro falso |
| A06 | Entrar na página geral e acionar contato sem escolher planta | Mensagem geral; a seleção padrão não é tratada como preferência |
| A07 | Selecionar opção e acionar botão do painel, barra móvel e contato final | Mesma tipologia em todos os caminhos contextuais |
| A08 | Formulário com registro confirmado, falha, HTTP 200 com `gravado: false` e rede indisponível | Sucesso e evento somente no registro confirmado; campos preservados nos demais |
| A09 | Nome, finalidade vazia, aceite desmarcado e telefone internacional | Validação compreensível; sem finalidade presumida nem código de país corrompido |
| A10 | Plantas fora da tela, efetivamente vistas e selecionadas | Sem exposição na simples montagem; sem troca artificial na inicialização; sem duplicação |
| A11 | Obra e novos registros fotográficos | Percentual mantém agosto/2026 até nova medição; fotos usam sua própria data real |
| A12 | Lazer, localização e conforto | Nomes, pavimentos, imagens e números coincidem com a ficha; sem promessas novas |
| A13 | Teclado, foco, Escape, controles de zoom, barras fixas e texto ampliado | Conteúdo e ações essenciais alcançáveis; sem controles encobertos |
| A14 | Espaços M01–M08 sem arquivos produzidos | Prévia identifica o material; nenhuma imagem quebrada, play falso ou evento de mídia inexistente |
| A15 | Preparação da versão pública sem todos os novos materiais | Cada espaço usa sua alternativa definida ou é recolhido; nenhum aviso interno de produção vai ao visitante |
| A16 | Componentes compartilhados e rota do Flow | Sem alteração involuntária de conteúdo, planta, formulário, navegação ou contato do outro empreendimento |
| A17 | Estágio comercial e links institucionais | Avisos e comunicação de pré-registro preservados; privacidade e boletim acessíveis |

O Codex deve registrar a verificação realizada, os pontos que não conseguiu testar e os materiais novos ainda pendentes. A entrega da fase 3 é uma prévia revisável, acompanhada de imagens das principais seções em celular e computador; a publicação permanece para a fase correspondente do plano.

## 16. Pendências herdadas e evoluções futuras

### 16.1 Pendências da fase 1, sem renumeração

| Código | Material ou confirmação necessária | Responsável indicado na ficha | Tratamento na primeira versão |
| --- | --- | --- | --- |
| P01 | Identificação dos duplex, limites, acesso, pisos e par de pavimentos; explicação dos dois desenhos | Engenharia/arquitetura, com Fábio | Mostrar duas pranchas completas, sem associação individual inventada |
| P02 | Última medição/boletim, mês, percentual, responsável e fotos/vídeos datados | Engenharia | Preservar agosto/2026 e 10,52%; produzir M03 sem confundir data de captura com medição |
| P03 | Situação documental atual do registro de incorporação | Fábio e responsável documental | Manter pré-registro e avisos existentes; sem oferta ou reserva |
| P04 | Medição do trajeto à praia: saída, chegada, modo e data | Marketing/equipe local | Vídeo real e referência aprovada de aproximadamente 300 m, sem alegar nova medição |
| P05 | Conciliação dos demais destinos e distâncias | Marketing/equipe local | Omitir números divergentes, especialmente Bombinhas e Itapema |
| P06 | Composição oficial dos 850 m² de lazer | Engenharia | Usar total aprovado, sem decompor a área a partir das imagens ou somar garagem |
| P07 | Plantas cotadas, revisão vigente e quadro de áreas por ambiente | Engenharia/arquitetura | Comparar totais e programa; sem medidas por ambiente ou comprovação de mobiliário |
| P08 | Tipologia/pavimento representados nos renders de living, suíte e duplex | Arquitetura/marketing | Usar perspectivas do projeto sem vincular a uma opção específica |
| P09 | Memorial vigente, abrangência de sistemas e equipamentos | Engenharia | Manter descrições aprovadas sem quantificar desempenho ou equipamentos além do documento |
| P10 | Licença das onze imagens de `vida/` | Marketing/agência | Não depender desse conjunto; priorizar acervo oficial e materiais próprios autorizados |
| P11 | Estoque e tabela vigentes, se houver oferta autorizada | Comercial | Não publicar a tabela histórica de agosto como atual |
| P12 | Estimativa de condomínio, política de personalização e documentos de uso/locação | Gestão/engenharia/responsável documental | Respostas objetivas de consulta, sem promessas de custo, alteração livre ou regras não comprovadas |

Essas pendências não impedem a prévia editorial especificada. Cada alternativa foi definida para que o Codex consiga implementar sem completar lacunas com suposições. A atualização de uma pendência deve registrar qual documento, revisão, data e responsável sustentam a mudança.

### 16.2 Melhorias futuras condicionadas a novos materiais

| Evolução | Condição para entrar | Resultado esperado |
| --- | --- | --- |
| Destaque individual dos duplex e navegação por piso | P01 resolvida com pranchas identificadas | Comparação gráfica sem confusão entre unidade e pavimento |
| Plantas cotadas e comparação de ambientes | P07, com PDF legível e quadro de áreas | Discussão mais precisa de mobiliário, circulação e necessidades da família |
| Render vinculado a uma tipologia | P08 comprovada | Alternar planta e imagem da mesma opção |
| Diagrama oficial de posição/acessos | Material técnico M06 aprovado | Entender a organização do pavimento sem inferir a partir de renders |
| Obra atualizada e galeria real | P02 e M03 | Acompanhamento com nova data de referência e imagens identificadas |
| Memorial consultável ou para download | P09 e arquivo autorizado, com versão | Aprofundamento técnico com documento real |
| Origem e fim do trajeto medidos | P04/P05 resolvidas | Distâncias consistentes e explicação do percurso |
| Contexto de planta salvo no formulário | Contrato de API e destino persistente definidos e verificados | Lead cadastrado com a tipologia, sem depender somente do WhatsApp |
| Agenda com confirmação | Integração real, disponibilidade e processo de atendimento | Data/horário efetivamente combinados, com medição própria de agendamento |
| Informações comerciais adicionais | P03/P11 e orientação comercial atual | Evolução da comunicação após comprovação, sem usar dados históricos como oferta vigente |
| Respostas sobre condomínio/personalização/uso | P12 documentada | FAQ mais completa, com limites claros |
| Novas fotos e vídeos editoriais | Materiais M01–M08 produzidos conforme §18 | Presença humana, demonstração e confiança sem alterar a identidade |

### 16.3 Restrições técnicas de implementação

- Executar alterações dentro de `site/`, com leitura inicial das instruções vigentes do repositório. Não modificar o CRM da raiz, Nara, canais de atendimento, domínio, DNS ou banco por associação com este trabalho.
- `FormLead` e `SeletorPlantas` são compartilhados. Preferir ajustes delimitados à experiência do Alma quando o comportamento for específico. Correções comuns devem preservar os demais consumidores.
- Não alterar credenciais, variáveis privadas ou estado comercial para fazer a prévia aparentar uma integração concluída. Relatar diferenças entre prévia e produção quando houver.
- A rota de eventos tem lista permitida; novos nomes exigem mudança coordenada e verificação. A primeira versão foi especificada para caber nos eventos existentes.
- Arquivos de duplex, fotos de vistas e imagens de lazer têm limitações documentadas. Não recortar, renomear semanticamente ou atribuir a uma unidade para eliminar uma pendência factual.
- Novos textos não autorizam criação automática de book, memorial, medição, planta técnica ou imagem de obra. Documentos e evidências precisam existir.

## 17. Fontes e decisões editoriais

### 17.1 Fontes de produto e acervo

**B1 — `Alma_Fase1_Ficha_e_Acervo.md`, 21/10/2026.** Documento que acompanha esta especificação. Consultar §§3–5 para dados e arquivos, §7 para P01–P12 e §9 para o handoff. Os códigos F01–F11 mantêm o significado da ficha. A confirmação interna ali registrada não é ampliada para afirmar leitura de originais técnicos ou cartoriais que não foram disponibilizados.

**B2 — `Alma_Acervo_Boutique_Familiar_8_Cases (1)(1).html`, 21/10/2026.** Estudo de oito referências fornecido no projeto. Orientou a apresentação por experiência de uso, escala residencial, clareza do produto e atendimento. Não foi usado para importar diferenciais, números ou garantias de resultados comerciais de outros empreendimentos.

### 17.2 Fontes técnicas consultadas em 21/10/2026

As referências abaixo correspondem a leitura do código do repositório, sem mudança de arquivos, execução de formulários de produção ou consulta de leads. Conferir a versão vigente ao iniciar a fase 3.

| Código | Caminho e link | Evidência utilizada |
| --- | --- | --- |
| T1 | [`site/src/components/FormLead.tsx`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/components/FormLead.tsx) | Campos, tipos de formulário, mensagens e confirmação de sucesso existente |
| T2 | [`site/src/components/SeletorPlantas.tsx`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/components/SeletorPlantas.tsx) | Seleção, URL, visualização de plantas e evento na montagem |
| T3 | [`site/src/app/empreendimentos/[slug]/plantas/[planta]/page.tsx`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/app/empreendimentos/%5Bslug%5D/plantas/%5Bplanta%5D/page.tsx) | Rotas individuais e inicialização da landing com tipologia |
| T4 | [`site/src/components/LinkWhatsApp.tsx`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/components/LinkWhatsApp.tsx) | Canal centralizado, mensagem e rastreio de clique |
| T5 | [`site/src/app/api/leads/route.ts`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/app/api/leads/route.ts) | Campos realmente processados e distinção entre resposta HTTP e gravação |
| T6 | [`site/src/lib/eventos.ts`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/lib/eventos.ts) | Lista de eventos/atributos e mapeamento para plataformas |
| T7 | [`site/src/lib/rastreio.ts`](https://github.com/fabionicodemus-lang/bossa-crm/blob/main/site/src/lib/rastreio.ts) | Consentimento das integrações, UTMs e referência do atendimento |

### 17.3 Referências de acessibilidade

- **A1:** W3C, [Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum).
- **A2:** W3C, [Understanding SC 2.5.5: Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).
- **A3:** W3C, [Dialog (Modal) Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### 17.4 Escolhas entre alternativas possíveis

| Escolha adotada | Razão |
| --- | --- |
| Assinatura original na abertura; “Tempo juntos. Espaço para cada um.” nos interiores | Mantém reconhecimento da marca e acrescenta um eixo de uso sem trocar a campanha |
| Interiores curtos e plantas no terceiro bloco | Aproxima a experiência de morar e resolve cedo a pergunta central sobre o apartamento |
| Áreas e suítes antes de nomes técnicos | Ajuda o visitante a comparar sem precisar memorizar Tipo 01/02 |
| Lazer por uso, com ambiente e pavimento explícitos | Cria identificação emocional e permite conferir o que existe |
| “Solicitar uma apresentação” em vez de calendário aparente | Descreve o serviço que o atendimento consegue confirmar |
| WhatsApp contextual e formulário geral na versão inicial | Preserva a intenção da planta no canal que já a transporta e evita prometer gravação inexistente |
| Vídeo real do trajeto como principal evidência de localização | Mostra a relação com a praia sem depender de estimativas divergentes |
| Histórico e boletim datado em vez de promessas genéricas de confiança | Sustenta qualidade percebida com informações identificáveis |
| Espaços de produção nomeados na prévia e alternativas completas para o público | Facilita produzir novos materiais sem deixar a página pública incompleta |

## 18. Produção de novas fotos e vídeos — espaços nomeados

### 18.1 Como o Codex deve representar os espaços

Na **prévia de revisão**, identificar cada posição com seu ID e nome. Quando houver imagem atual adequada, utilizá-la com uma identificação discreta de produção: **“M01 · Família no living — espaço para nova imagem”**, por exemplo. Onde não existir material, usar um quadro simples nas cores atuais, com o nome, tipo e proporção. Não criar cenário fictício, miniatura que sugira filmagem pronta ou botão de reprodução sem arquivo.

Na **versão pública**, usar o novo material aprovado ou a alternativa especificada na tabela. Identificadores M01–M08, nomes de produção, “aguardando material” e quadros vazios são instruções da prévia; não fazem parte da experiência final do cliente. Os espaços de vídeo opcionais podem ser recolhidos integralmente, sem deixar buracos entre blocos. Fotografias existentes podem permanecer como solução definitiva.

Os formatos abaixo são orientações de produção. Priorizar imagem com pelo menos 1920 px de largura para os quadros amplos, preferencialmente 2000–2400 px quando disponível, e vídeo em 1080p com exportação adequada para web. Não é necessário aumentar artificialmente a resolução de um arquivo. Produzir pôster para vídeos, legendas revisadas quando houver fala e um resumo/transcrição acessível. Confirmar recorte no celular antes de finalizar.

### 18.2 Mapa completo dos oito materiais

| ID e nome exibido na prévia | Local e proporção | Material a produzir | Prioridade | Alternativa pública enquanto não houver material |
| --- | --- | --- | --- | --- |
| **M01 — Imagem: família no living do Alma** | S02, imagem principal, 16:9 | Cena ilustrativa de convivência, baseada no living oficial | Alta | `/img/alma/living.jpg` |
| **M02 — Vídeo: Fábio apresenta o Alma** | S08, bloco Bossa, 16:9 | Fala real de 45–60 segundos sobre decisões do projeto e convite para conhecer as plantas | Alta | Texto institucional já definido; recolher área de vídeo |
| **M03 — Fotos e vídeo: obra do Alma em mês/ano** | S08, junto ao boletim, 16:9 | Quatro a seis fotos reais datadas; vídeo opcional de 30–45 segundos | Alta | Resumo e link do boletim de agosto/2026, com sua data; sem foto de outra obra |
| **M04 — Fotos reais: Jazz e Soul entregues** | S08, dois cartões 4:3; M04A Jazz e M04B Soul | Uma foto principal real de cada empreendimento concluído; outras podem ficar em acervo | Alta para ampliar a prova visual | Cartões textuais com nomes e datas de entrega |
| **M05 — Vídeo: conheça as plantas de 103 e 114 m²** | S03, consulta abaixo da comparação, 16:9 | Apresentação guiada de 45–75 segundos a partir das duas plantas oficiais | Média | Comparação e plantas existentes; recolher vídeo |
| **M06 — Imagem técnica: pavimento, acessos e duas unidades** | S04, 4:3 | Diagrama a partir de planta oficial aprovada, com unidades e circulação identificadas | Alta utilidade, dependência técnica | Fachada e explicação textual de dois apartamentos por andar |
| **M07 — Imagem: o apoio na volta da praia** | S07, 4:3 | Perspectiva aprovada da entrada de banhistas/ducha/lava-pés/box, conforme o projeto disponível | Média, dependência técnica | Bloco textual com os recursos confirmados |
| **M08 — Vídeo: uma manhã em família no Perequê** | S06, faixa complementar 16:9; recorte 9:16 opcional | Registro real de 20–30 segundos de uma rotina simples na praia e no entorno | Opcional | Trajeto real existente; recolher faixa complementar |

### 18.3 Instruções de produção, prontas para encaminhar

#### M01 — Família no living

**Pedido:** criar uma cena natural de convivência usando como base `/img/alma/living.jpg`. Duas ou três pessoas em atividades tranquilas — conversar, ler, preparar algo ou compartilhar a mesa — devem ajudar a imaginar o uso do ambiente. Escolher uma ação central, evitando figurantes em todos os cantos.

**Preservar:** arquitetura, proporções, circulação, aberturas, móveis fixos, materiais e vista do render aprovado. Não aumentar a sala, mover paredes ou acrescentar uma paisagem mais favorável. A imagem pode ser produzida a partir do render, inclusive com apoio de ferramentas de imagem, desde que a revisão visual confirme fidelidade ao projeto. A cena continua sendo uma perspectiva ilustrativa.

**Entregar:** imagem horizontal 16:9 e recorte alternativo que funcione no celular, sem cortar o uso principal. Não associar a imagem a 103, 114, 145 ou 168 m² enquanto P08 não estiver resolvida.

**Legenda pública:** “Cena ilustrativa de convivência, baseada em perspectiva do projeto do Alma.”

#### M02 — Fábio apresenta o Alma

**Pedido:** gravar Fábio ou representante identificado da Bossa, com voz clara e fala direta. Usar escritório ou ambiente real adequado, com luz natural e fundo organizado. A gravação não deve aparentar que o apartamento do Alma já está pronto.

**Roteiro orientador, 45–60 segundos:** apresentação pessoal e da Bossa; por que o projeto combina convivência e espaço individual; dois apartamentos por andar; opções de três e quatro suítes; convite para explorar plantas e conversar sobre a rotina da família. A fala pode ser espontânea, preservando esses fatos. Não prometer entrega antecipada, valorização, silêncio absoluto ou condições comerciais não aprovadas.

**Entregar:** vídeo 16:9, enquadramento que permita recorte móvel, pôster, legendas e transcrição. A identificação de cargo deve ser confirmada por Fábio; não inventar título profissional.

**Legenda pública:** “Fábio apresenta o projeto do Alma Sea Houses.”

#### M03 — Registros recentes da obra

**Pedido:** fotografar o canteiro do Alma com uma vista geral e detalhes de etapas que a engenharia possa identificar. Selecionar quatro a seis imagens distintas. Um vídeo de 30–45 segundos pode complementar a galeria se demonstrar o estágio real com clareza.

**Entregar junto:** data de captura, identificação da obra, legenda de cada etapa e responsável por validar a descrição. O boletim/medição deve informar separadamente mês de referência e percentual. Uma foto nova não transforma automaticamente 10,52% de agosto em medição do mês da foto.

**Natureza obrigatória:** registro real. Não gerar, simular avanço, retocar elementos construtivos para aparentar conclusão nem usar imagens do Flow como obra do Alma.

**Legenda pública:** “Obra do Alma · {etapa validada} · registro de {data real}”.

#### M04A e M04B — Jazz e Soul entregues

**Pedido:** selecionar ou produzir uma fotografia real, clara e identificável da fachada do Jazz e outra do Soul. Imagens de áreas comuns concluídas podem complementar o acervo, mas os cartões da página precisam apenas de uma foto principal por empreendimento.

**Entregar junto:** nome correto do edifício, identificação de que a fotografia mostra o empreendimento concluído e autorização de uso do material. Manter as datas de entrega verificadas na ficha: Jazz, setembro/2019; Soul, dezembro/2023. Data da fotografia, se nova, não altera a data de entrega.

**Natureza obrigatória:** fotografia real dos empreendimentos identificados. Não usar render como prova visual de entrega, nem atribuir essas imagens ao Alma.

**Legendas públicas:** “Jazz · fotografia do empreendimento entregue”; “Soul · fotografia do empreendimento entregue”.

#### M05 — Apresentação das plantas de 103 e 114 m²

**Pedido:** produzir um vídeo curto com as duas plantas oficiais, uma de cada vez, depois lado a lado. Identificar área privativa, três suítes e duas vagas. Mostrar que o visitante pode ampliar e conversar sobre suas necessidades. Usar aproximação e destaque discretos, preservando o desenho.

**Limites:** não calcular medidas por pixel, prometer que um móvel cabe ou afirmar em qual ambiente estão os 11 m² de diferença sem quadro de áreas. Não alterar o layout para fazê-lo parecer mais amplo. Este vídeo não inclui os duplex enquanto suas associações técnicas permanecerem pendentes.

**Entregar:** 45–75 segundos, 16:9, pôster, legendas e transcrição se narrado. Se o conteúdo não acrescentar explicação além da comparação escrita, pode permanecer como melhoria posterior.

**Legenda pública:** “Apresentação das plantas de 103 e 114 m². Ilustrações do projeto.”

#### M06 — Pavimento, acessos e duas unidades

**Pedido à engenharia/arquitetura:** fornecer uma planta de pavimento oficial, em revisão identificada, que permita mostrar as duas unidades, acessos, circulação e núcleo comum. Entregar uma versão simplificada para leitura na tela, derivada desse documento, com rótulos validados.

**Limites:** não montar um pavimento colando plantas individuais, não inventar orientação solar e não usar imagem gerada como desenho técnico. Se a peça mostrar duplex, resolver também P01 e declarar claramente qual pavimento está representado. A peça não define disponibilidade comercial de unidades.

**Entregar:** imagem legível em 4:3 ou proporção técnica original quando necessária, versão de ampliação e identificação de revisão. Preservar o desenho inteiro. Legenda final deve nomear o pavimento realmente validado.

**Alternativa enquanto a base não existir:** manter somente fachada, dois apartamentos por andar e consulta de vistas com ressalvas.

#### M07 — O apoio na volta da praia

**Pedido:** mostrar um dos espaços efetivamente projetados para o retorno da praia: entrada de banhistas, ducha/lava-pés ou box de praia. Usar referência arquitetônica aprovada para produzir a perspectiva, com câmera e elementos coerentes com o projeto.

**Limites:** não criar um ambiente genérico de resort, acrescentar equipamentos, representar bicicleta/prancha que não se sabe se cabe no box ou desenhar conexão espacial entre ambientes sem referência. Uma fotografia externa de pessoas voltando da praia não comprova os recursos do condomínio.

**Entregar:** imagem 4:3, identificando o espaço retratado e sua origem no projeto. Caso não exista base suficiente, o texto já especificado resolve a apresentação inicial.

**Legenda pública:** “Perspectiva ilustrativa de {nome do espaço aprovado} do Alma.”

#### M08 — Uma manhã em família no Perequê

**Pedido:** gravar uma sequência real e breve de rotina no entorno: caminhar, conversar, chegar à praia, observar a água. A presença humana deve transmitir naturalidade e calma, com uso autorizado das imagens dos participantes.

**Limites:** não filmar outra praia como se fosse Perequê, não simular uma vista de unidade do Alma e não apresentar a duração editada como tempo do trajeto. Não é necessário citar comércios, serviços ou distâncias para que a peça funcione.

**Entregar:** 20–30 segundos, 16:9, pôster e recorte 9:16 se houver enquadramento adequado. Esse vídeo complementa `/video/alma/trajeto.mp4`; a gravação existente do caminho continua sendo o principal material de localização.

**Legenda pública:** “Momentos no Perequê, em Porto Belo. Imagens reais do entorno.”

### 18.4 Nomes sugeridos de arquivos — ainda não existentes

Usar os IDs para organizar a produção. Os nomes abaixo são sugestões de destino, não confirmação de arquivos no repositório. Só referenciá-los como mídia após receber o material correspondente.

| ID | Destino proposto |
| --- | --- |
| M01 | `/img/alma/novos/m01-familia-living.webp` |
| M02 | `/video/alma/novos/m02-fabio-apresenta-alma.mp4`; pôster `/img/alma/novos/m02-poster.webp` |
| M03 | `/img/alma/novos/m03-obra-AAAA-MM-01.webp` e sequência; substituir AAAA-MM pela data real, sem publicar esse marcador |
| M04 | `/img/alma/novos/m04a-jazz-entregue.webp`; `/img/alma/novos/m04b-soul-entregue.webp` |
| M05 | `/video/alma/novos/m05-plantas-103-114.mp4`; pôster correspondente |
| M06 | `/img/alma/novos/m06-pavimento-aprovado.webp` ou formato técnico adequado após validação |
| M07 | `/img/alma/novos/m07-volta-da-praia.webp` |
| M08 | `/video/alma/novos/m08-manha-pereque.mp4`; pôster correspondente |

### 18.5 Ordem recomendada de produção

**Primeira rodada:** M03, M01 e M02. Os registros recentes mostram a obra com clareza; a convivência no living aproxima o visitante da rotina; a apresentação pela Bossa coloca uma pessoa real na conversa.

**Segunda rodada:** M04 e M05, aproveitando fotografias reais já disponíveis e uma explicação objetiva das duas plantas. M06 pode avançar em paralelo com a engenharia; a dificuldade principal é obter uma base validada, não produzir uma peça visual.

**Rodada complementar:** M07 quando houver referência de projeto e M08 se trouxer uma qualidade narrativa superior ao que o trajeto existente já oferece. Não é necessário produzir os oito materiais para que a primeira versão seja atraente e utilizável.

**Encerramento da fase 2:** este documento define conteúdo, estrutura, interações, acervo, produção adicional e critérios para a prévia. A fase 3 transforma essa especificação em página funcional para revisão, mantendo as pendências identificadas e sem antecipar a publicação.
