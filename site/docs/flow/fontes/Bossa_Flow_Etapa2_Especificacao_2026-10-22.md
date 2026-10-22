# Bossa Site 2.0 — Etapa 2: Especificação estratégica, editorial e funcional do Flow Aptos

**Versão:** 1.0 · **Data:** 22/10/2026 · **Situação:** aprovado como plano de implementação, pendente de conferência de materiais e revisão de preview. **Esta especificação não altera o site.**

## 1. Fonte, local e guardrails

- Auditoria base: `Bossa_Flow_Etapa1_Auditoria.md`, 22/10/2026, que analisou a landing atual em desktop/celular e inventariou 91 mídias.
- **Repositório correto:** `fabionicodemus-lang/bossa-crm`, **somente na pasta** `site/`; Next.js 16, React 19, TypeScript; Vercel projeto `bossa-site` do time `elos-os`.
- Página a preservar: `/empreendimentos/flow-aptos` e rotas associadas de planta.
- Projeto de site tem preview protegido na Vercel; domínio `www.bossaempreendimentos.com.br` continua servido pelo Wix. **Não mudar DNS, Wix, Vercel Auth, `BOSSA_PUBLICADO`, robots/indexação ou produção.**
- Código do CRM está na raiz do mesmo repositório e **não pode ser modificado**. Regressão obrigatória nos conteúdos compartilhados de Alma/Soul/Jazz. Não mexer em Elos OS.
- Antes de criar branch de trabalho, conferir `main` vs. `feat/alma-fase3-previa`, uma vez que há evolução concorrente do site do Alma. Isolar as alterações do Flow em branch específica, sem reverter trabalhos alheios.
- Identidade oficial: grafite `#4E4D5B`, sálvia `#B0B5AC`, névoa `#EDEDED`, bronze `#A88E69` discreto; fontes Saira e Michroma, logotipo oficial Flow. **Assinatura exatamente: “No ritmo da nossa vida.”**
- Mensagem principal proposta: **“Seu apartamento é só o começo.”**
- Facts: 57 apartamentos; tipo 62 e 73 m² com 2 suítes; duplex de 93 e 117,7 m² com 3 suítes, living com pé-direito duplo; Flow Move no 5º e The Roof no 24º; mais de 600 m² declarados de lazer/conveniências; entrega **prevista** novembro/2027. Bairro Balneário Perequê, Porto Belo; cerca de 800 m da Praia do Perequê **declarados comercialmente**, sem nova rota homologada. Não garantir vagas, vista da unidade, estoque ou preço sem fonte.
- Boletim atualmente cadastrado: **edição 25, setembro/2026, 57,87%**. Se aparecer, apresentar data. Não usar frases relativas como “13 meses para as chaves” nem atualizar percentual sem fonte.
- **Não prometer:** valorização, rentabilidade, prazo contratual garantido, vista permanente, entrega de book instantâneo sem automação efetiva, churrasqueira sem fumaça, porcelanato que jamais descola, piscina já aquecida, sol o dia todo, distância caminhável precisa ou atendimento em minutos sem SLA sustentado.

## 2. Objetivo, público e conversão

A conversão prioritária é **agendar visita à obra/escritório**. Ações secundárias: explorar planta, explorar pavimento/vista e conversar por WhatsApp com contexto. Pedido de book é terciário e não deve ser contado como download sem entrega.

Segmentos centrais: casal buscando 2 suítes funcionais, família pequena/segunda residência, comprador de unidade alta ou duplex. Comprador com prioridade absoluta de caminhar poucos metros até o mar pode não ser o perfil correto; evitar argumento defensivo e desqualificação.

Tom: premium contemporâneo, demonstrativo e direto, sem ostentação, sem frases absolutas, com relação clara entre benefício e prova. Lazer é extensão funcional do lar, mas **não confundir área comum com área privativa**.

## 3. Ordem e copy de cada seção da landing

### 0. Cabeçalho e navegação interna

Manter navegação global. Na landing, incorporar navegação rápida discreta, desktop e móvel: **Plantas · Lazer · Vistas · Construção · Visitar**, com âncoras funcionais sem sobrepor barra fixa. CTA de destaque: **Agendar visita**. Não adicionar excesso de links na primeira dobra.

### 1. Hero — benefício principal

**Sobremarca:** `FLOW APTOS · NO RITMO DA NOSSA VIDA.`

**H1:** `Seu apartamento é só o começo.`

**Descrição:** `Apartamentos de 62 e 73 m² com duas suítes e unidades duplex com três suítes. Dois pavimentos de lazer e conveniências para aproveitar mais cada momento, no Balneário Perequê, em Porto Belo.`

**Fatos curtos:** `57 apartamentos` · `Flow Move + The Roof` · `Entrega prevista: novembro de 2027`.

**CTA primário:** `Conhecer as plantas` → âncora exatamente nas escolhas de planta.

**CTA secundário:** `Ver a obra` → seção de prova da construção.

Mídia: usar `video/flow/abertura.mp4` e poster existente, com pausa, legenda/descrição e economia de dados. Não trocar por vídeo novo agora. Manter o nome Flow indexável em texto real. Hero sem 800 m no texto principal; informar a distância honestamente na seção Localização e FAQ.

### 2. Escolher apartamento — imediatamente depois do hero

**Rótulo:** `OS APARTAMENTOS`.

**H2:** `O espaço certo para o seu jeito de viver.`

**Descrição:** `Duas suítes nas plantas tipo. Ambientes integrados e configurações diferentes para você escolher a que combina com sua rotina.`

Apresentar seletor das cinco tipologias oficiais, destacando área, quantidade de suítes, orientação quando documentada e imagem **correta da planta**:

- Tipo 2 · 62 m² · 2 suítes · sol da manhã.
- Tipo 3 · 62 m² · 2 suítes · sol da tarde.
- Tipo 1 · 73 m² · 2 suítes · sol da manhã no living e da tarde nas suítes.
- Duplex Tipo 2/3 · 93 m² · 3 suítes · living de pé-direito duplo.
- Duplex Tipo 1 · 117,7 m² · 3 suítes · living com 4,90 m de pé-direito na configuração aprovada.

CTA no seletor: `Quero conhecer esta planta` → WhatsApp com tipo/área explicitados, nunca disponibilidade presumida. Rota compartilhável da planta deve abrir com a planta claramente visível, não exigir percorrer a página toda. Manter zoom/lightbox, melhorar gesto de zoom no celular e legibilidade de duplex por piso.

**Correção P0:** NÃO apresentar `img/flow/apto-living.jpg` como apartamento tipo até validar que imagem realmente corresponde ao tipo; auditoria identificou aparência de duplex. Reaproveitar `img/flow-apto-tipo-slide.jpg` **somente após conferência de correspondência**; caso contrário, mostrar planta sem render genérico enganoso. Tipos 2 e 3 têm imagens atuais de 423×539 e 429×539: pedir fontes oficiais em alta.

### 3. Proposta de valor: dois pavimentos

**H2:** `A vida acontece dentro e fora do apartamento.`

**Copy:** `No Flow, os espaços privativos foram planejados para morar bem. E os dois pavimentos de lazer e conveniência oferecem opções para trabalhar, encontrar pessoas, cuidar de você e aproveitar o tempo livre.`

Painel visual com dois acessos: `FLOW MOVE · 5º PAVIMENTO` e `THE ROOF · 24º PAVIMENTO`, cada um com render, resumo do uso e link âncora.

### 4. Flow Move — rotina e conveniência

**H2:** `Mais praticidade para a vida acontecer.`

**Copy:** `Coworking, fitness, Flow Store, lavanderia e espaços para brincar, pausar e encontrar os amigos, tudo no próprio edifício.`

Utilizar galeria compacta de cartões/abas existentes, com imagens reais de projeto para fitness, coworking, Flow Store, playground, Cine Flow. **Inserir `img/flow/planta-flow-move.jpg`**, já no acervo, com legenda `Planta ilustrativa do 5º pavimento` e zoom para leitura. Evitar a sequência muito longa de cinco grandes blocos. `Um dia no Flow Move` pode ficar como micro narrativa visual, **sem prometer serviço de lavanderia com roupa pronta em dado horário**.

CTA discreto: `Ver os ambientes do Flow Move`.

### 5. The Roof — lazer e convivência unificados

**H2:** `Seu tempo livre ganha outra perspectiva.`

**Copy:** `No 24º pavimento, piscina com infraestrutura para aquecimento, gourmet, pub, brinquedoteca e salão de festas formam os espaços pensados para os encontros e o descanso.`

Unir piscina, gourmet, salão de festas, pub e brinquedoteca na MESMA seção, sem separar por seletor de vistas. Usar `img/flow/piscina.jpg`, `rooftop-aereo.jpg`, `salao-festas.jpg`, `pub.jpg`, `brinquedoteca.jpg`, com legendas `Perspectiva ilustrativa`. **Inserir `img/flow/planta-the-roof.jpg`** para mostrar a distribuição do pavimento, com zoom.

O rooftop pode ser mostrado visualmente como ponto alto da experiência, mas **não afirmar insolação integral, vista 360º comprovada ou piscina já aquecida**.

### 6. Vistas: escolha a altura

**H2:** `Cada altura, uma perspectiva.`

**Copy:** `Explore as imagens realizadas por drone em diferentes alturas e direções. A vista de cada apartamento depende de sua localização na torre e do entorno.`

Reutilizar 36 imagens existentes em três direções. Preservar proporção panorâmica no celular; evitar `object-fit: cover` que elimina partes da imagem; permitir ampliar. Melhorar seleção de direção/andar, navegação por teclado, estado visível e acessibilidade.

CTA de interesse contextual: `Quero conhecer opções nesta altura` → encaminhar **direção e andar mostrado**, identificados como **referência de drone**, ao WhatsApp, sem alegar que há unidade disponível naquele pavimento ou que a imagem coincide com sua janela.

Não ligar automaticamente vista × unidade × tipologia sem mapa técnico oficial; não solicitar novas rotas de praia.

### 7. Duplex — produto especial, sem confundir com tipo

**H2:** `Dois níveis. Uma nova dimensão para morar.`

**Copy:** `As unidades duplex combinam três suítes com living de pé-direito duplo e grandes superfícies envidraçadas. Uma proposta arquitetônica diferente das plantas tipo.`

Apresentar variantes 93 e 117,7 m² separadamente. Reutilizar renders próprios e vídeo `video/flow/unidade-1601.mp4` com indicação `Registro da unidade 1601`; não generalizar que a unidade filmada seja a planta padrão nem que esteja disponível. Plano inferior/superior em versão legível no celular quando existirem exports oficiais.

### 8. Engenharia / Jeito Bossa — provas, não absolutos

**H2:** `O cuidado está nos detalhes. Inclusive nos que não aparecem.`

**Copy:** `Além dos acabamentos apresentados, a Bossa prevê soluções para conforto acústico e térmico, esquadrias normatizadas e detalhes de execução que merecem ser vistos de perto.`

Três/quatro cartões curtos com característica, benefício e referência documental: isolamento entre lajes/divisas, piso porcelanato/vinílico, churrasqueira a carvão com exaustão, esquadrias/aberturas. Fotos de **obra real** só quando existirem com data/identificação; sem retratos de obra gerados por IA como provas. Tirar `Porcelanato que não solta`, `Churrasqueira sem fumaça de volta` e qualquer garantia absoluta.

CTA: `Conhecer a obra e os acabamentos` → visita/obra.

### 9. Obra + história de entrega + clientes

**H2:** `O projeto está no papel. E a obra está acontecendo.`

**Copy:** `O Flow tem entrega prevista para novembro de 2027. Acompanhe a execução em fotos, vídeos e edições periódicas divulgadas pela Bossa.`

Exibir estágio `57,87% · edição setembro/2026` **apenas enquanto essa for a última edição no conteúdo**, sem sugerir medição atual em outubro. Corrigir a frase `torre já está fechada de baixo a cima` (esquadrias tinham estágio inferior). Preservar vídeo do Fábio, link para boletim datado e histórico Jazz/Soul, com linguagem de fato passado, não promessa de entrega futura.

Prova social dos vídeos `Augusto` e `Natália` próxima a essa seção ou como bloco curto anterior, com legenda/transcrição e consentimento de uso. Não inventar números de satisfação ou histórias dos clientes.

CTA: `Agendar uma visita para conhecer a obra`.

### 10. Localização transparente

**H2:** `Balneário Perequê. O endereço para a sua rotina.`

**Copy:** `Rua São José, 163, em Porto Belo, com acessos previstos pela Rua São José e pela Rua Santa Terezinha. A distância divulgada até a Praia do Perequê é de aproximadamente 800 metros; o percurso efetivo depende do acesso utilizado.`

Usar aerial `img/flow/localizacao-aereo.jpg` e botão `Ver endereço no mapa`. Não apresentar busca por endereço como rota pedonal aferida. Remover minutos não metodologicamente confirmados. FAQ específica reconhece a distância, sem minimização ou prometer proximidade da areia.

### 11. Converter sem prometer algo que o site não entrega

**H2:** `Conheça o Flow de perto.`

**Copy:** `Veja as plantas, escolha a unidade que mais combina com você e converse com a equipe sobre visita e condições atuais.`

CTA principal `Agendar visita`; secundário `Conversar pelo WhatsApp`. Pedido de book terciário `Solicitar apresentação do Flow`, com confirmação `Recebemos seu pedido. Nossa equipe entrará em contato para compartilhar o material.` até automação comprovada.

Na interface, priorizar uma ação por vez, reduzir formulários paralelos no celular e manter a barra fixa sem cobrir campos/botões. Não publicar preço, estoque, vagas ou condição sem versão atual validada.

### 12. FAQs curtas e legais

Perguntas: `A que distância fica da praia?`, `Quais plantas existem?`, `O que há no Flow Move e no The Roof?`, `Quando está prevista a entrega?`, `Como acompanhar a obra?`, `Posso visitar?`. Respostas fielmente referenciadas. Preservar nota legal e indicação de renders.

## 4. Correções funcionais P0 — impedir falsa conversão

A auditoria do código encontrou três problemas sérios de contrato:

**A. Sucesso de lead:** `site/src/app/api/leads/route.ts` responde `HTTP 200` com `{ok:true, gravado:false}` se banco/ORG estiverem indisponíveis; `site/src/components/FormLead.tsx` considera qualquer HTTP 2xx como êxito. Exigir confirmação explícita `gravado === true` (ou contrato de sucesso equivalente), senão mostrar falha com alternativa WhatsApp, preservando dados do usuário até possível reenvio. **Não usar banco real para testar sem autorização; usar mock.**

**B. Data de visita:** componente envia `data`, API recebe mas não a passa à RPC. Verificar contrato existente da RPC antes de qualquer ajuste. **Não alterar banco/CRM neste pacote**. Se persistência não for suportada, retirar promessa de data registrada ou usar fluxo explicitamente aprovado de confirmação posterior; registrar bloqueio técnico de integração.

**C. Book:** `download_material` dispara ao enviar formulário, mas a rota observada apenas registra lead. Trocar texto de entrega instantânea por solicitação recebida até confirmar a automação externa e disparar evento correto `request_material`, não `download_material`. Não afirmar que o CRM nunca envia book: a auditoria não examinou toda a automação.

**Instrumentação:** evitar eventos que descrevem coisa diferente da ação real: `view_floorplan` só após exposição; `view_price` não deve ser disparado no formulário sem preço; visita solicitada ≠ visita confirmada; pedido de book ≠ arquivo entregue. Preservar UTMs, consentimento e os fluxos de Alma/Soul/Jazz. Para CTA WhatsApp propagar plant/andar/direção quando fornecidos pelo usuário, sem vincular indevidamente à disponibilidade.

## 5. SEO, performance, acessibilidade

- Título sugerido: `Flow Aptos | 2 suítes, lazer em dois pavimentos e entrega 2027 | Bossa`.
- Descrição sugerida: `Conheça o Flow Aptos em Balneário Perequê, Porto Belo. Plantas de 62 e 73 m² com duas suítes, duplex, Flow Move e rooftop no 24º pavimento. Entrega prevista novembro de 2027.`
- H1 editorial pode ser criativo, mas nome do empreendimento em texto real, title e structured data corretos; canonical e rotas preservadas.
- Preservar `noindex, nofollow` em ambiente protegido enquanto domínio público estiver no Wix; não criar schema `Offer`, preço e estoque sem fonte.
- OG atual usa imagem vertical com dimensões 1600×900 declaradas; preparar card horizontal com render aprovado ou usar dimensões reais. Não precisa novo render do prédio.
- Otimizar imagens e `sizes` conforme necessidades reais, carregar vídeo hero com consciência de dados e pausar fora da tela quando apropriado, respeitar `prefers-reduced-motion`.
- Mobile: primeiro CTA visível, plantas legíveis, vistas panorâmicas sem crop destrutivo, formulário sem obstrução, zoom e Tab/Shift+Tab do modal com foco controlado, aria das abas e labels corretas.
- Não presumir ganho de LCP/INP/CLS sem medições; coletar QA real no preview com mobile e desktop.

## 6. Mídia a reaproveitar (sem novas encomendas por enquanto)

| Função | Caminho já existente dentro de `site/public/` | Nota |
|---|---|---|
| Hero | `video/flow/abertura.mp4`, `img/flow/abertura-poster.jpg` | Manter e medir |
| Plantas | `img/flow-planta-tipo1.jpg`, `flow-planta-tipo2.jpg`, `flow-planta-tipo3.jpg`, `flow-planta-duplex-tipo1.jpg`, `flow-planta-duplex-tipo23.jpg` | Tipos 2/3 baixa resolução; revisão |
| Apartamento tipo | `img/flow-apto-tipo-slide.jpg` | Verificar identificação e buscar original limpo; não usar `img/flow/apto-living.jpg` sem validação |
| Flow Move | `img/flow/planta-flow-move.jpg`, `coworking.jpg`, `fitness.jpg`, `flow-store.jpg`, `cine-flow.jpg`, `playground.jpg` | Planta hoje não usada |
| The Roof | `img/flow/planta-the-roof.jpg`, `piscina.jpg`, `piscina-2.jpg`, `rooftop-aereo.jpg`, `salao-festas.jpg`, `pub.jpg`, `brinquedoteca.jpg` | Planta hoje não usada |
| Vistas | `img/flow/vista/{a,b,c}-{00..11}.jpg` | 36 quadros existentes; nenhuma vista sintética |
| Duplex | `duplex-490.jpg`, `suite-duplex.jpg`, vídeo `video/flow/unidade-1601.mp4` | Identificar unidade filmada |
| Obra e clientes | `video/flow/obra.mp4`, `augusto.mp4`, `natalia.mp4` + posters | Reaproveitar, trazer antes na jornada |
| Localização | `img/flow/localizacao-aereo.jpg` | Sem rotas extras |

**Materiais que realmente pedir ao usuário (não bloquear o restante):**

1. **P0:** PDF vetorial ou PNG/JPG de origem em alta resolução das plantas **Tipo 1 (73 m²), Tipo 2 (62 m²), Tipo 3 (62 m²)**, de preferência 2000–3000 px no lado maior, sem alterar geometria; e plantas duplex piso inferior/superior se disponíveis.
2. **P0:** confirmar qual render corresponde ao apartamento tipo de 62 e de 73 m², de preferência original limpo de `flow-apto-tipo-slide.jpg`. A imagem atual `apto-living.jpg` tem indícios de duplex.
3. **P1:** 3–6 fotos reais de execução/qualidade (isolamento, esquadrias, acabamento, impermeabilização etc.), com data e local, **somente quando já executado**. Material opcional enquanto seção estiver descritiva.
4. **P1:** quadro técnico de orientação/final/planta por unidade para vincular seletor de vistas a apartamentos sem inferência. Até receber, não vincular.
5. **P2:** vídeo atual da obra 20–40 s, se já houver; não gerar cena falsa de obra. Não encomendar novos renders de lazer, drones nem vídeo IA principal nesta fase; avaliar depois de QA.

## 7. Mapa de arquivos do Codex

Prioritários: `site/src/components/flow/FlowLanding.tsx`, `site/src/styles/flow.css`, `site/src/components/flow/VistaAndares.tsx`, `site/src/components/flow/Clientes.tsx`.

Conteúdo: apenas entradas Flow em `site/src/content/empreendimentos.ts` e FAQs de Flow em `site/src/content/site.ts`.

Compartilhados com regressão obrigatória: `site/src/components/SeletorPlantas.tsx`, `site/src/components/Visor.tsx`, `site/src/components/FormLead.tsx`, `site/src/app/api/leads/route.ts`, `site/src/components/LinkWhatsApp.tsx`, `site/src/lib/contexto.ts`, `site/src/lib/eventos.ts`, `site/src/lib/rastreio.ts`, metadados da página.

Fora de escopo: arquivos da raiz do CRM, banco ou migrações, `BOSSA_PUBLICADO`, Vercel Authentication, produção, DNS/Wix, dados de Alma/Soul/Jazz sem motivo técnico e consentimento.

## 8. Critérios de aceite

1. Hero novo com assinatura oficial, H1 proposto, CTA principal para plantas e entrega prevista.
2. Plantas aparecem no primeiro conjunto de seções após hero; dados corretos (2 suítes tipos, 3 duplex); nenhuma foto atribuída à tipologia errada.
3. Plantas do 5º e do 24º adicionadas com zoom; narrativa de lazer mais curta; The Roof unificado.
4. Vistas preservam proporção no mobile e deixam claro que são referências de drone; direção/andar transmitidos ao CTA contextual sem inventar unidade disponível.
5. Obra exibe data do boletim; afirmações técnicas demonstráveis e sem garantias absolutas.
6. 800 m descritos como distância anunciada, sem trajeto novo; resposta FAQ transparente.
7. Nenhum formulário mostra confirmação de registro com `gravado:false`; promessa de book alinhada à funcionalidade real; data de visita preservada ou limitação explicitada, com teste automatizado.
8. Eventos de material, planta, preço e vista representam ações reais; UTMs e comportamento dos demais empreendimentos preservados.
9. Rotas e SEO coerentes; `noindex` do preview e proteções permanecem intactos.
10. `npm ci`, `npm run typecheck`, `npm run build` executados no diretório `site/`; lint apenas conforme o script/configuração efetivamente disponível (o script `next lint` pode ser legado), reportar erros existentes separadamente.
11. Conferir desktop 1440×900 e mobile 360/390/768/1024; teclado, leitura de planta, formulário sob teclado móvel, ausência de overflow/CLS visível; **não testar gravações reais sem autorização**.
12. Toda alteração isolada em branch `feat/flow-posicionamento-2026`, preview Vercel protegido, sem merge/publicação automáticos. Comparar com branch vigente de Alma para não sobrescrever trabalhos paralelos.

## 9. Execução por ambientes

- **Chat Alto:** esta especificação e copy, já redigidas; utilizar como fonte fixa.
- **Work Sol Médio:** inventário concluído; apenas conferência dos novos arquivos recebidos se necessário.
- **Codex Alto:** criar branch, implementar partes de copy/layout usando acervo, aplicar correções P0 de interface/sem alterar banco, rodar testes, abrir PR, disponibilizar preview protegido. Priorizar tudo o que não depende de novos arquivos.
- **Work Sol Alto:** testar visual/funcional em preview em 5 larguras, produzir relatório de regressão e screenshots, sem publicação.
- **Chat Pro:** revisão comercial crítica, inclusive claims de distância, suíte, altura, vista, preço/ticket e objeções.
- **Codex Alto:** correções finais e eventual merge/publicação **somente após aprovação explícita**.

## 10. Entrega ao Codex

Anexar este arquivo inteiro na conversa do Codex com instrução: executar a Etapa 3/4 da implementação do Flow **somente na branch** prevista e no diretório `site/`, sem alterar produção, Wix, DNS, CRM/banco ou proteção; finalizar com PR, link de preview, matriz de testes e lista de assets pendentes. Se dados documentais faltarem, preservar placeholder claro e continuar áreas independentes.
