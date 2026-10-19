# Bossa Site 2.0: contexto para quem vai trabalhar neste projeto

Atualizado em 19/10/2026. Leia tudo antes de mexer em qualquer coisa.

## 1. Quem é quem

- **Bossa Empreendimentos:** incorporadora de Porto Belo e Itapema (SC), fundada em 2017. O conceito do site é "Construímos pouco. Para entregar tudo."
- **Fábio Nicodemus:** diretor de incorporações e dono deste projeto. Ele **não programa** e pensa de forma lógica. Fale com ele em português simples, explique o que vai fazer e por quê, e evite jargão. Toda resposta a ele deve ser em português.
- **Equipe citada no site:** Sabrina (sócia diretora), Carlos (sócio), Fábio (diretor de incorporações), Taís (gestora administrativa), Gabrielle (engenheira), Cíntia (secretária e marketing), Mateus (financeiro). Taís e Cíntia vão editar o conteúdo do site no futuro.
- **Nara:** a atendente de IA da Bossa no WhatsApp, que roda dentro do CRM. O número do site é o da Nara: 47 9288-9395 (`554792889395`).

## 2. Regras que não se negociam

1. **Não invente dados.** Nenhum número, metragem, prazo, distância, nome ou afirmação sem fonte. Se faltar informação, pergunte ao Fábio ou deixe marcado como pendente. As fontes oficiais estão em `src/content/` e nos PDFs da pasta "Material Site" (ver seção 9).
2. **Lei 4.591/64, Alma em pré-registro.** Enquanto a incorporação do Alma não estiver registrada, a página dele **não pode fazer oferta de venda**: não mostra preço nem "compre". O convite é "registrar interesse". O estado é controlado pela variável `NEXT_PUBLIC_ALMA_ESTADO` (`pre-registro` ou `registrado`).
3. **Não prometa rentabilidade nem valorização.** Dados de mercado só aparecem com fonte e com a nota "sem promessa".
4. **O CRM está em produção, com a Nara atendendo clientes de verdade.** Qualquer mudança no código do CRM precisa passar por typecheck e lint, e nunca pode bloquear ou atrasar o processamento do WhatsApp.
5. **Pergunte antes de agir em produção:** migração de banco, publicação, troca de domínio ou DNS, ou qualquer coisa que mexa no Wix, que continua no ar até o lançamento oficial.
6. **Dados pessoais:** não leia nem exporte dados de leads sem necessidade. Chaves secretas só no servidor, nunca no navegador.
7. **Commits:** autor "Fábio Nicodemus <fabio.nicodemus@gmail.com>", mensagem em português explicando o que muda.

## 3. Onde está cada coisa

- **Repositório:** GitHub `fabionicodemus-lang/bossa-crm`, branch `main`. O Fábio pode renomeá-lo para `bossa-site`.
  - Raiz: o **CRM** (Next.js, Supabase, Nara), com a programação mantida separada para poder ser replicada para outras empresas.
  - Pasta `site/`: **este site**, que é um projeto Next.js independente com `package.json` próprio.
- **Vercel** (time "Elos OS"):
  - Projeto `bossa-site`: pasta raiz `site`, endereço de teste **bossa-site-elos-os.vercel.app**. É protegido por login da Vercel (Vercel Authentication), e o `BOSSA_PUBLICADO=nao` impede a indexação.
  - Projeto `bossa-crm`: o CRM, em crm.bossaempreendimentos.com.br.
  - Cada projeto tem um "Ignored Build Step". Um envio que mexe só em `site/` não republica o CRM, e um envio que mexe só no CRM não republica o site.
- **Supabase:** projeto `bossa-crm` (id `oridhneerxutcjsvwuju`, região sa-east-1). Uma única organização no CRM: `efb563c0-42e2-403c-b86e-15b61a563757`.
- **Wix:** o site antigo, ainda no ar. Os redirecionamentos das URLs antigas já estão em `next.config.ts`.

## 4. Stack do site

- Next.js 16, React 19 e TypeScript. Conteúdo em arquivos TS por enquanto; o painel Sanity ainda não foi feito.
- Fontes via `@fontsource`, porque o Google Fonts é bloqueado no ambiente:
  - **Bossa:** Newsreader (títulos), Geist (texto), Geist Mono (números).
  - **Alma:** Literata, Urbanist e Ephesis, esta última no lugar da Elision Lustrate, que não tem licença.
  - **Flow:** Saira e Michroma, no lugar de Decima Nova Pro e Dimension Drive.
- Variáveis de ambiente (ver `.env.example`):
  - `NEXT_PUBLIC_SITE_URL`
  - `NEXT_PUBLIC_WHATSAPP`
  - `NEXT_PUBLIC_ALMA_ESTADO`
  - `BOSSA_PUBLICADO`
  - `SUPABASE_URL`
  - `SUPABASE_SECRET_KEY`: tipo Sensitive, só em Production
  - `BOSSA_ORGANIZATION_ID`
  - GA4, Meta Pixel e Clarity: ainda vazios
- Comandos, todos dentro de `site/`:
  - `npm ci`
  - `npx tsc --noEmit`
  - `npm run build`
  - `npx next start -p 3200`
  - O Chromium do Playwright está em `/opt/pw-browsers`. O Chromium de teste não toca vídeo H.264; em navegador real, toca.

### Arquivos principais

- `src/content/empreendimentos.ts`: fonte única de dados dos 4 empreendimentos (fichas, plantas e edições mensais de obra).
- `src/content/site.ts`: textos institucionais aprovados, equipe, perguntas frequentes, distâncias, acabamentos e notas legais.
- `src/lib/eventos.ts`, `src/lib/rastreio.ts` e `src/components/Rastreador.tsx`: a medição.
- `src/app/api/eventos` e `src/app/api/leads`: gravação no banco via RPC, com a chave secreta.
- `src/components/flow/*` e `src/styles/flow.css`: a landing do Flow.
- `src/components/alma/*` e `src/styles/alma.css`: a landing do Alma.
- `src/components/PaginaEmpreendimento.tsx`: página genérica, hoje sem uso para Alma e Flow. `PaginaEntregue.tsx`: Soul e Jazz.
- `supabase/migrations/`: migrações do site, **já aplicadas** no bossa-crm.

## 5. Páginas

As páginas são: home, `/empreendimentos`, `/empreendimentos/[slug]`, `/empreendimentos/[slug]/plantas/[planta]` (cada planta tem link próprio), `/obras`, `/obras/[slug]/[mes]`, `/jeito-bossa`, `/nossa-historia`, `/porto-belo`, `/perguntas`, `/comprar-morando-fora`, `/corretores`, `/contato`, `/privacidade`, a 404, `sitemap.xml`, `robots.txt` (libera GPTBot, ClaudeBot, PerplexityBot e Google-Extended quando publicado) e `llms.txt`.

### Landing do Flow (aprovada pelo Fábio)

- **Identidade:** guia de marca da Cool Ideas, com grafite `#4E4D5B`, sálvia `#B0B5AC`, névoa `#EDEDED` e bronze `#A88E69` (só decorativo). O conceito é "No ritmo da nossa vida". A frase de abertura é "Perto do mar. No ritmo da cidade."
- **Público:** de 26 a 50 anos, ativo e com vida social; compra para morar e/ou alugar.
- **Objeções que a página responde:**
  - Tamanho: "compactos por escolha".
  - Preço do m²: o que vem incluído.
  - O prazo é um argumento a favor: entrega em novembro de 2027.
- **Seções:**
  - Abertura em vídeo.
  - Para quem é.
  - "Um dia no Flow Move" (5º andar): espaço zen, playground, Cine Flow, coworking com sala de reuniões, fitness, Flow Store (self deli) e lavanderia.
  - The Roof (24º andar): piscina com infraestrutura para aquecimento, gourmet com churrasqueira, pub, brinquedoteca e salão de festas.
  - "Escolha seu andar": quadros reais de drone em 3 direções.
  - Duplex com pé-direito de 4,90 m, mais o vídeo da unidade **1601** ("o exclusivo").
  - O que vem incluído.
  - Depoimentos do Augusto e da Natália (autorizados).
  - Obra com o vídeo do Fábio.
  - Localização.
  - Fechamento.
- **Visitas:** acontecem no escritório da Bossa, no **térreo do Flow** (Rua São José, 163).

### Landing do Alma (aprovada pelo Fábio, com ajustes já feitos)

- **Identidade:** Brand Concept, com sálvia `#59695C`, oliva `#656635`, taupe `#696158`, pedra `#9D968D`, areia `#C4BFB6` e névoa `#D7D2CB`. O conceito é "Feito para sua alma". A abertura é "Sua casa na praia. feita para sua alma."
- **Público:** famílias de 35 a 60 anos, bem-sucedidas, que querem desacelerar, ter bem-estar e receber os amigos.
- **Seções:**
  - Abertura com a piscina em movimento.
  - Desacelerar.
  - A vida no Perequê.
  - Da porta ao mar: vídeo real da caminhada e mapa do Google.
  - "Um sábado no Alma", no pavimento de lazer.
  - Rooftop 360° a 102 m.
  - "Escolha a altura": 21 alturas reais de drone, ampliadas, mais o giro de 360°.
  - Dois por andar.
  - O que vem junto.
  - "2030 parece longe. A obra já começou."
  - Localização.
  - Registrar interesse.
  - Perguntas frequentes.
- **Pavimento de lazer:**
  - Piscina aquecida de formato orgânico, com prainha revestida em areia Bora Bora (Crystal Pool), hidromassagem e jardins em volta.
  - Gourmet com churrasqueira ao lado da piscina.
  - Garden solarium e academia panorâmica.
  - Espaço Vitalidade (yoga e funcional).
  - Casa de banho sensorial, com banheiras, e sauna seca.
  - Playground Casa da Árvore e pet place.
- **Rooftop**, todo com pé-direito duplo:
  - Salão de festas integrado ao Jantar Jardim.
  - Pub View.
  - Wine Bar ligado ao Fire Place.
  - Brinquedoteca Floresta Encantada.
  - Lounge das Pedras: o terraço de pedras e jardins que une tudo.
- **Imagens:**
  - O render `gourmet.jpg` é o **salão de festas** do rooftop.
  - `gourmet-piscina-noite.jpg` é o gourmet da piscina.
  - As fotos de estilo de vida em `public/img/alma/vida/` vêm do Brand Concept (banco de imagens) e precisam ter a licença confirmada com a agência.
- **O vídeo "Liquidez" não entra** enquanto o Alma estiver em pré-registro.

## 6. Dados oficiais (já confirmados pelo Fábio)

- **Alma Seahouses:** Rua Wilson Belber, 316, Balneário Perequê, Porto Belo, a 300 m do mar. 30 pavimentos, 2 apartamentos por andar, 48 unidades.
  - Plantas: 3 suítes com 103 e 114 m²; duplex com 4 suítes de 145 e 168 m². Todas com 2 vagas.
  - Altura: piso do rooftop a 102 m, teto a 107 m, altura total de 112 m.
  - Obra: começou em julho de 2025, entrega em julho de 2030. Andamento de 10,52% em agosto de 2026.
  - Registro: incorporação protocolada, registro previsto para breve.
- **Flow Aptos:** Rua São José, 163, Balneário Perequê, a 800 m do mar. 24 pavimentos, 57 unidades.
  - Plantas: 2 suítes com 62 e 73 m²; duplex com 3 suítes de 93 e 117,7 m².
  - Obra: começou em novembro de 2023, entrega em novembro de 2027. Andamento de 57,87% em setembro de 2026. As vagas ainda estão por confirmar.
- **Soul Residence:** Itapema, 36 unidades, entregue em dezembro de 2023, no prazo, mesmo com a pandemia. Resta uma unidade de 2 suítes com 70 m².
- **Jazz Residence:** Itapema, 14 unidades. Obra de novembro de 2017 a setembro de 2019, entregue um ano e oito meses antes do prazo, com Habite-se 15 dias depois.
- **Escritório:** R. 406-B, 272, Morretes, Itapema.
- **Erro conhecido no material:** a imagem da planta do duplex Tipo 1 do Flow diz 114,7 m², mas o correto é 117,7 m².

## 7. Medição e CRM

- **Código de visita:** anônimo, com 6 caracteres sem 0, O, 1 e I, guardado em `localStorage` como `bossa_vid`. A mensagem do WhatsApp sai com "(ref. CÓDIGO)".
- **24 eventos**, listados em `src/lib/eventos.ts`. São sempre gravados no banco da Bossa. GA4, Meta e Clarity só recebem os eventos depois do consentimento de cookies.
- **Tabelas no Supabase:** `site_visitors`, `site_sessions`, `site_events` e `lead_site_links`, todas com RLS e sem acesso público.
- **Funções**, só para service_role:
  - `site_registrar_evento`
  - `site_registrar_lead`: reaproveita o lead pelo telefone com ou sem o 9, usando `lead_phone_key`, porque existe índice único.
  - `site_vincular_whatsapp`
- **Visões:** `site_funil_leads` e `site_comportamento_por_lead`.
- **No CRM:**
  - O processamento de mensagens recebidas (`src/lib/whatsapp/webhookProcessor.ts`, `persistInboundMessage`) chama `site_vincular_whatsapp` quando a mensagem tem "(ref. X)", dentro de try/catch.
  - A tela **/site** (menu "Site") traz o funil do clique à venda, o comportamento de quem compra contra os demais leads, as origens, as plantas mais vistas e os leads recentes.
- Os 80 registros de venda que já existem no CRM são histórico importado e **não contam** como vendas do site.

## 8. Pendências (a fazer)

1. **Painel de edição** para Taís e Cíntia, provavelmente Sanity: textos, fotos, percentual de obra e edições mensais.
2. **Teste de ponta a ponta da medição** em navegador real: visita, depois formulário ou WhatsApp, depois o lead aparecendo em /site.
3. **Conectores:** a conexão do Supabase neste ambiente pode estar apontando para outra conta (elos-os-dev). Se for o caso, peça ao Fábio para reconectar.
4. **Lançamento:**
   - Apontar o domínio www.bossaempreendimentos.com.br para o projeto `bossa-site`.
   - Trocar `BOSSA_PUBLICADO` para `sim`.
   - Desligar a proteção da Vercel.
   - Preencher os IDs de GA4, Meta e Clarity.
   - Revisar a página de privacidade com o jurídico.
5. **Dados pendentes:** CNPJ, telefone fixo, números de registro das incorporações, patrimônio de afetação, vagas do Flow e data contratual do Jazz.
6. **Simulador de pagamento:** quando houver tabela de preços no CRM. O evento `simulate_payment` já existe, mas ainda não é usado.
7. **Alertas de segurança antigos do CRM** apontados pelo Supabase: funções acessíveis sem login, como `merge_duplicate_leads_batch`. Não têm relação com o site, mas vale revisar.
8. **Vista do Alma:** se existir uma versão em alta resolução do vídeo "vistas do Alma", trocar os quadros ampliados.

## 9. Material de origem

No computador do Fábio: `C:\Users\fabio\OneDrive - Bossa Empreendimentos\DOCUMENTOS BOSSA EMPREENDIMENTOS\COMERCIAL\Material Site\`

- Pastas `Alma`, `Flow`, `Soul`, `Jazz`.
- Alma: `ALMA ALTA` (renders em JPG e TIFF), `ALMA_brandconcept.pdf`, `Alma Seahouses - Folder Digital.pdf`, `Material Extra` (vídeos de vistas, caminhada até a praia e piscina).
- Flow: renders, `Flow Aptos - Brand Guideline (1).pdf`, a apresentação de 2026, a newsletter mensal e `Material Novo` (vídeos de depoimentos, vistas, unidade 1601 e obra).

## 10. Documentos já produzidos (Artifacts do Claude)

- Fase 1, estratégia: https://claude.ai/code/artifact/c02ac6ea-1c78-4b28-8802-c020b69f6f42
- Fase 2, SEO, GEO, funil e medição: https://claude.ai/code/artifact/ead46fc9-f7af-4120-be7b-b239a444adfa
- Design System: https://claude.ai/artifact/J7fNFE5aPYzvy2tChD34hy
- Wireframes: https://claude.ai/artifact/UonawKHBg4VAJKJswKN6kp
- Fase 4, textos aprovados: https://claude.ai/code/artifact/1dbb4618-fcf8-4167-8e90-77b59d824f04

## 11. Jeito de trabalhar com o Fábio

- Antes de construir algo grande, mostre o roteiro ou plano e espere o "ok". Ele aprova rápido.
- Pergunte só o que muda o resultado, e no máximo poucas coisas de cada vez.
- Ao terminar, teste no celular (390 px) e no computador (1440 px) e mande capturas.
- Diga claramente o que não conseguiu fazer e por quê.
