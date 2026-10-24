# Flow Aptos — Etapa 7B: correções de interface e material liberado

22/10/2026 · Bossa Site 2.0 · PR #130 · Revisão em Preview.

## Entrega

- **Nova prévia protegida:** https://bossa-site-a4xvgs1gj-elos-os.vercel.app/empreendimentos/flow-aptos
- **PR mantido em rascunho:** https://github.com/fabionicodemus-lang/bossa-crm/pull/130
- **Branch:** `feat/flow-posicionamento-2026`.
- **Código da candidata:** `2330da6a1c2a464b44ebe629d7a6d64b3b90160e`.
- **Deployment:** `dpl_J1sjuPZDyFTFYKZv8wbZRZRVSbwB`, READY, Preview (`target:null`), projeto `bossa-site`, time Elos OS. Vercel Authentication preservada em todos os deployments.
- [Índice de capturas desktop, tablet e celular](docs/flow/etapa7b/Capturas_Indice.md).
- [Matriz principal](docs/flow/etapa7b/verificacao.json), [interface/cookies/material](docs/flow/etapa7b/interface.json), [teclado e zoom400%](docs/flow/etapa7b/teclado.json), [barras/texto200%/vídeos](docs/flow/etapa7b/complementos.json), [API simulada](docs/flow/etapa7b/api-controlada.json), [build](docs/flow/etapa7b/build.txt), [conferência remota](docs/flow/etapa7b/conferencia-remota.json).

A nota 8,1 é a referência da auditoria independente informada por Fábio e citada no dossiê. Esta implementação não atribui nova nota, não declara 9+ e não substitui a próxima auditoria da página renderizada.

## Fontes e autorização

Lidos integralmente o PDF anexado, o LEIA_ME e o manifesto do dossiê. O PDF dentro do ZIP tem texto idêntico ao PDF anexado. A fonte e seus limites estão arquivados em [fontes](docs/flow/etapa7b/fontes/Flow_Validacao_Materiais_Relatorio.txt), [orientações do dossiê](docs/flow/etapa7b/fontes/LEIA_ME_Codex.txt) e [manifesto](docs/flow/etapa7b/fontes/Manifesto_Validacao_Flow.csv).

As frases dos documentos sobre “não houve implementação” descrevem a validação anterior. A solicitação atual de Fábio autoriza esta implementação e a nova prévia, preservando as restrições materiais. A aprovação do Tipo 1 é comercial/ilustrativa; não é certificação municipal, registral, executiva ou de obra concluída. Não houve nova interpretação de geometria para liberar imagens rejeitadas.

A auditoria completa da Etapa 6 não integra estes anexos nem foi localizada no checkout. Os achados de interface desta rodada são os explicitados no pedido e no dossiê. Não declaramos ter repetido ou lido evidências adicionais dessa auditoria que não estavam disponíveis.

## Correções realizadas

| Item | Causa observada | Correção e evidência |
|---|---|---|
| Cookies em telas baixas | O painel fixo podia ocupar a região das ações da abertura. | No Flow móvel, banner no fluxo antes da abertura. Com o aviso presente, ações visuais logo após o H 1, deixando CTA principal e alternativa livres em 360 × 640 e 390 × 844. Sem esconder o consentimento, mudar suas opções ou disparar rolagem. Capturas de primeiro acesso e estado após rolagem; retângulos e alcance por `elementFromPoint` conferidos. |
| Componente compartilhado de cookies | Era necessário resolver o Flow sem mudar o comportamento dos outros empreendimentos. | O componente usa um slot exclusivo do Flow. Nas demais páginas permanece fixo; saída por navegação cliente remove o portal do Flow. Texto, opções, persistência e condição de carregamento de GA/Meta/Clarity preservados. |
| Flow Move | No celular, os botões ficavam depois da fotografia; escolher podia atualizar uma imagem fora da tela. | Seletor nativo compacto antes da fotografia até 860 px; grupo editorial de botões preservado no desktop. Fotografia aparece imediatamente abaixo. Quinze trocas nas três larguras móveis/tablet sem mudança de scroll; cinco opções continuam acessíveis. ArrowDown/Enter muda para coworking. |
| Vistas móveis | Direções longas, slider e doze botões repetiam controles e afastavam imagem/seleção. | Foto, três direções compactas e seletor nativo de pavimento. Slider e botões detalhados preservados no desktop. Correspondência numérica e mapa de 36 arquivos intactos; 13º permanece comum e ausência do 20º/morros informa 19º. Nenhuma foto interpolada ou vista de unidade inferida. |
| Plantas no tablet | O quadro 4:5 ocupava altura excessiva em 768 px. | Quadro responsivo de 300–460 px entre 541–860 px; em 768 × 844 mede 422 px nas cinco opções. Desenho contido, sem recorte ou deformação. Tipo 1 também usa sua proporção 3000:1758 fora dessa faixa. |
| Fechar no visor | O título longo disputava a largura do botão. | Título pode quebrar; botão não encolhe nem quebra “Fechar × ”. Testado nas cinco larguras e no texto ampliado. Escape, Tab e retorno de foco preservados. |
| Zoom e arquivo em alta | O visor limitava a solicitação de imagem a 200 vw mesmo com zoom superior. | `sizes` acompanha o zoom. No Tipo 1 a 400%, o navegador solicita uma derivação de 1920 px do WebP aprovado, com `contain`; não foi produzido detalhe arquitetônico novo. |
| Jornada factual | A ficha de localização vinha depois da vitrine duplex extensa. | Ficha ao final das plantas, antes dos duplex. Aproximadamente 800 m da praia, como distância divulgada; previsão novembro/2027 preservada. Sem criar rota ou tempo caminhável. |
| Duplex e ritmo | Render grande, fichas e notas ampliavam a rolagem. | Render 16:9 e resumo lado a lado no computador; foto curta e uma ficha por vez no celular. Acesso às duas plantas e vídeo 1601 mantidos. Nota condensada, sem disponibilidade presumida ou associação nova de render a variante. |
| Engenharia | A expressão “conforme detalhamento a validar” enfraquecia o argumento e não era comprovação técnica. | Texto restrito à churrasqueira a carvão/coifa/exaustão previstos no projeto, sem garantia de desempenho ou exclusividade. Fontes/boletim existentes mantidos. Sem render usado como prova de execução. |
| Fotos técnicas futuras | Ainda não foram recebidos registros reais identificados. | Campo `fotosEngenhariaFlow` preparado por título do cartão, exigindo `src`, `alt`, `mesAno`, `pavimento` e `atividade`. Quando preenchido com material aprovado, mostra fotografia ampliável e identificação. Vazio hoje não gera quadro vazio, aviso interno ou botão sem mídia. |

As alterações preservam logotipo, paleta, Saira/Michroma, “No ritmo da nossa vida.” e “Seu apartamento é só o começo.”. Não foram criadas imagens nem corrigidas arquiteturas por IA.

## Tipo 1 liberado e referências provisórias

**Instalado:** `public/img/flow/plantas/tipo1-73m2.webp`,3000 × 1758 px,289.054 bytes, RGBA com transparência. [Registro de integridade](docs/flow/etapa7b/materiais.json).

SHA-256: `f41defb65a1a7f5bad65b9ee2975607f544d03ebb02eea6e0f44778885b62a68`.

É cópia exata do arquivo na pasta liberada do dossiê: sem recorte, rotação, recompressão, espelhamento ou geração. A entrada `tipo-1` foi atualizada em `content/empreendimentos.ts`, mantendo 73 m², duas suítes, orientação, slug, rota, contato e metadados. A proporção é preservada por `object-fit:contain` no painel e no visor.

A legenda informa o caráter comercial ilustrativo e mobiliário/decoração/acabamentos sugeridos. O painel acrescenta somente características confirmadas no parecer: duas suítes com banheiros privativos, living/cozinha integrados e lavabo junto à circulação. Não interpreta sistema de porta ou comprova área registral. No painel, a área aparece como **comercial divulgada**.

**Não instalados:** os WebPs novos dos Tipos 2/3 e `living-tipo02.webp`. Eles não foram adicionados a `public/`, renomeados, espelhados ou associados a outra tipologia. Nenhum render de living tipo foi introduzido.

Os JPGs anteriores dos Tipos 2/3 foram mantidos exclusivamente como referências ilustrativas provisórias. O aviso ao lado do desenho e no visor diz: “Referência ilustrativa provisória de 62 m². Conjuntos técnicos em revisão; não representa desenho executivo validado. Consulte a versão vigente com a equipe.” Essa utilização não libera os arquivos antigos nem substitui sua compatibilização. **Continua impedida a inclusão definitiva das duas plantas sem correção e nova liberação técnica.**

## Matriz de testes

Estados: **verificado diretamente** = exercício real de arquivo, navegador ou HTTP; **testado com simulação** = resposta/recurso controlado; **não verificado** = limite registrado.

| Percurso | Estado e resultado | Evidência |
|---|---|---|
| Build e TypeScript | Verificado diretamente, sem erro. Prettier e `git diff --check` também passaram. | `npm run build`, `npx tsc --noEmit`, `build.txt`. Nenhuma dependência nova ou alteração de lockfile. `next lint` legado não foi declarado aprovado. |
| Cinco plantas/rotas | Verificado diretamente. Painel, imagem, área, suítes, URL, title, canonical/OG, recarga e histórico coerentes; campos preservados. | `verificacao.json`:5 rotas; `interface.json`:Tipo 1 e avisos das duas referências provisórias também nos visores. |
| Cinco larguras | Verificado diretamente:360 × 844,390 × 844,768 × 844,1024 × 844 e 1440 × 900;60 verificações de seções sem overflow geral. | `verificacao.json` e capturas. Série adicional de interface em 360 × 640. |
| Cookies | Verificado diretamente nos cinco tamanhos, incluindo 360 × 640 e 390 × 844. CTA principal e alternativa sem sobreposição; aceite “Só os necessários” persistido. | `interface.json`, fotos de primeiro acesso e após rolagem. Sem remoção de controles para a captura. |
| Move | Verificado diretamente:5 opções × 3 larguras com seletor móvel, imagem visível e scroll preservado; desktop com botões. |15 trocas registradas; `teclado.json` prova ArrowDown/Enter. |
| Vistas | Verificado diretamente:36 referências no controle móvel, além dos 36 estados do percurso desktop. Fontes/rótulos/contexto conferidos. | `interface.json`:mapa reala/c/b e aviso 20º→19º. Comparação com dois quadros reais da mesma direção. Sem inferir unidade/estoque. |
| Zoom/fechamento/teclado | Verificado diretamente. Ampliar/reduzir/ajustar, Tab/Shift+Tab, Escape e retorno de foco. Tipo 1 chega a 400%, solicitando 1920 px. Botão Fechar sem quebra. | `verificacao.json`, `interface.json`, `teclado.json`. Pinça de 217% emulada por dois contatos CDP; não é pinça física. |
| Texto 200% | Verificado diretamente por mecanismo de teste. Fontes e entrelinhas computadas duplicadas no DOM; H 1 de 38→76 px, viewport 390/DPR 1 mantidos. | `complementos.json`, quatro capturas. Sem `transform`, alteração de DPR ou zoom da captura. Não foi zoom nativo do navegador. |
| Navegação/CTAs | Verificado diretamente. Explorar plantas, menus, âncoras, visita, pranchas de lazer e contatos contextuais preservados. | Matriz principal, estados de barra e teclado. Não abrimos WhatsApp para terceiros. |
| Barra móvel | Verificado diretamente em 11 estados: abertura, fora dela, menus aberto/fechado, planta trocada, modal aberto/fechado, campo e contato. | `complementos.json`. Nenhum teclado virtual real foi observado. |
| Vídeos | Verificado diretamente:quatro vídeos avançaram no Chromium,540 × 960, sem erro. Pausa manual do hero preservada. | `complementos.json`. Sem escuta integral ou homologação de legendas. |
| Compartilhamento | Verificado diretamente para cópia de link no clipboard local. | Matriz principal; não foi compartilhamento nativo em aparelho físico. Tratamento nativo não foi alterado nesta rodada. |
| Formulários | Testado com simulação. Cinco falhas preservaram os dados e não emitiram lead_submit; dois sucessos somente com HTTP 2xx+ok=true+gravado=true. | `verificacao.json`:resposta incompleta, gravado:false, ok:false, HTTP 500 e rede. Um request_material, nenhum download/agenda confirmada indevido. |
| API do site | Testado com simulação:rota HTTP real contra RPC fictícia local,8 chamadas; telefones+351/+49/+1/nacional, UTM,422 e erro 500. | `api-controlada.json`. Sem banco, CRM ou atendimento real. |
| Acessibilidade automática | Verificado diretamente:axe WCAG 2 A/AA/2.1 AA, zero violações detectadas em 3 estados. | `verificacao.json`; itens `incomplete` continuam exigindo avaliação manual. Não é certificação de acessibilidade. |
| Regressões | Verificado diretamente no escopo alterado. Dados Alma/Soul/Jazz iguais à main; Alma mantém 114 m²/formulário/título; Soul/Jazz HTTP 200. | Matriz principal. `interface.json`:cookies fixos nas três páginas e saída SPA do Flow para institucional sem portal indevido. |
| HTML remoto | Verificado diretamente por HTTP autenticado:geral e Tipo 1 retornam 200, noindex, WhatsApp correto e novo WebP referenciado. | `conferencia-remota.json`. São verificações de HTML; as interações e capturas são locais. |

Reprodução local, após build e servidor em 3220:

```
node scripts/verificar-flow-etapa7b.cjs
node scripts/verificar-flow-etapa7b-interface.cjs
node scripts/verificar-flow-etapa7b-complementos.cjs
node scripts/verificar-flow-etapa7b-teclado.cjs
node scripts/verificar-flow-etapa7b-api.cjs
```

Todos os scripts interceptam APIs ou usam RPC fictícia; o último sobe servidor isolado em 3210. O build local recebeu somente o número público de WhatsApp já documentado (`554792889395`). Não foram necessários segredos de produção.

## Limites da verificação

Capturas e interações foram realizadas no Chromium local com viewport CSS efetivo, sem redimensionar imagens para simular responsividade. Não foram utilizados aparelho físico, Safari/iOS, teclado virtual real, leitor de tela ou compartilhamento nativo real. Não houve escuta integral dos quatro vídeos nem validação de fidelidade de fala. Também não houve Lighthouse, teste em rede móvel real ou medição controlada remota de desempenho.

A execução breve local nos complementos é exploratória e não comprova Core Web Vitals em campo. O ajuste de `sizes` carrega mais resolução apenas quando necessário ao zoom; não recomprime nem degrada o original aprovado.

O fluxo real site→banco/CRM→Nara/equipe→retorno/visita/apresentação **não foi homologado**. Os testes seguros confirmam o contrato técnico e os estados da interface, sem comprovar atendimento operacional.

## Materiais não liberados e pendências para a publicação definitiva

| Material/decisão | Situação | Condição para encerrar |
|---|---|---|
| Tipo 2 comercial 62 m² em alta e referência anterior | **BLOQUEADOR da inclusão definitiva** | Compatibilizar conjuntos técnicos/coifa/volumes junto à divisa e interferências com a revisão efetivamente executada. Nova exportação e confronto técnico. Não basta aumentar resolução. |
| Tipo 3 comercial 62 m² em alta e referência anterior | **BLOQUEADOR da inclusão definitiva** | Mesma verificação, separadamente; não assumir simetria nem espelhar o Tipo 2. |
| Render “Tipo 02 Living” | **NÃO LIBERADO** | Confirmar modelo e câmera, confrontar parede de divisa/janela lateral, vãos e volumes fixos. Corrigir modelo se necessário. Não renomear para Tipo 1 por afinidade. |
| Tipo 1 como desenho executivo/registral | **NÃO LIBERADO para esse uso** | A liberação atual cobre somente ilustração comercial. Não atribuir cotas úteis, sistema de porta, aprovação municipal ou área registral ao WebP. |
| Revisão arquitetônica e vínculo à execução | **PENDENTE técnico** | Responsável confirmar revisão vigente e sua aprovação. Carimbo vazio em R7/R8 e assinatura do R6 não certificam aprovação municipal vigente. Não tratamos o site como certificação legal. |
|3–6 fotos reais de engenharia | **PENDENTE para completar a prova visual** | Fotografias reais aprovadas, com data, pavimento, atividade e benefício comprovado. Campo de integração preparado; nenhum placeholder público. |
| Quatro WebVTTs e transcrições | **BLOQUEADOR do aceite completo de acessibilidade dos vídeos** | Obra,1601, Augusto e Natália com conteúdo fiel e revisão humana. Suporte de integração preservado. Não criamos falas presumidas. |
| Data da filmagem da obra | **PENDENTE para completar o aceite documental** | Confirmação pela fonte. Registro permanece sem mês atribuído; não deduzir de upload/exportação ou do boletim. |
| Render duplex por variante e pranchas por piso | **PENDENTE** | Vínculo documental antes de rotular o render por área; pranchas oficiais separadas quando recebidas. Acervo geral e pranchas completas preservados. |
| Vagas/unidade/final/orientação/condições atuais | **PENDENTE comercial** | Somente adicionar após confirmação. Não são inferidos da tabela técnica ou das fotografias de drone. |
| Atendimento real | **BLOQUEADOR da homologação operacional final** | Teste real controlado, autorizado separadamente, de recebimento, retorno e envio de apresentação/combinação de visita. Não alterar CRM/banco para esta revisão. |
| Auditoria independente e aprovação de Fábio | **PENDENTE para decisão de publicação** | Revisar a candidata renderizada, resolver/aceitar as pendências com evidência, sem autoatribuir 9+. |

A interface desta rodada está **APROVADA nos percursos técnicos exercitados**, com os limites acima. Isso não transforma os materiais provisórios em definitivos nem autoriza publicação em produção.

## Preservação e arquivos

Base conferida:HEAD `9b2f1a6` da mesma branch; sem alterações pendentes ao iniciar. Trabalho no worktree `/workspace/flow-trabalho`; checkout paralelo do Alma preservado e limpo. Apenas `site/` foi alterado. Não houve merge ou restauração de estado antigo.

Código: `src/components/Cookies.tsx`, `src/components/flow/{FlowPagina,GaleriaMove,VistaAndares,PlantasFlow,Experiencia}.tsx`, `src/content/{empreendimentos,flow}.ts`, `src/styles/flow.css` e um único arquivo novo em `public/img/flow/plantas/`. FormLead, API de leads, contrato de sucesso, componentes/estilos do Alma e configurações Vercel não foram alterados nesta rodada.

[Inventário de arquivos da rodada e do conjunto do PR](docs/flow/etapa7b/Arquivos_Alterados.txt). Inclui os cinco scripts de teste, fontes, capturas e evidências.

Commits de implementação:

- `9add47f`:Tipo 1 liberado, fonte correspondente e avisos provisórios.
- `2330da6`:correções de interface, engenharia e testes.

O commit posterior do relatório/capturas contém somente documentação, evidências e teste de teclado; o código servido pela prévia permanece o da candidata identificada no início.

## Próxima auditoria: verificações objetivas

1. Julgar a primeira impressão com cookies em 360 × 640 e 390 × 844:CTA livre, consentimento claro, nenhuma ação encoberta.
2. Trocar os cinco ambientes do Move no controle móvel, por toque/teclado, verificando imagem visível e foco preservado.
3. Conferir direção, pavimento e foto juntos; testar 13º comum,20º ausente nos morros e comparação entre duas alturas reais.
4. Ler Tipo 1 no painel e no visor em alta; confirmar proporção, Fechar, zoom/pan e retorno de foco. Verificar clareza dos avisos provisórios das outras duas plantas.
5. Julgar densidade em 768 px, ficha 800 m antecipada e vitrine duplex condensada, sem inferir disponibilidade ou vista da unidade.
6. Confirmar dados/documentos que faltam e as legendas dos vídeos; completar teste em aparelhos físicos/Safari/leitor de tela e homologação operacional autorizada.
7. Conferir a candidata protegida e o commit; atribuir eventual nova avaliação editorial somente por auditoria independente.

## Publicação

**Somente Preview protegida. Não houve merge, publicação em produção, promoção, alteração de domínio, DNS, proteção ou estado comercial. CRM, banco, Nara e Wix não foram alterados. Nenhum lead ou mensagem real foi enviado.**
