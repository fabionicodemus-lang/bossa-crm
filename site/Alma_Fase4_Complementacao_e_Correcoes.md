# Alma Sea Houses — Fase 4: complementação e correções

**Data:** 22/10/2026 (UTC). **Branch:** `feat/alma-fase3-previa`. **Projeto:** `bossa-site`, time Elos OS, pasta `site/`.

**Resultado:** R01 e R02 corrigidos e verificados no navegador local. Revisão móvel e ampliação efetiva de texto a 200% realizadas, com capturas das barras reais. A variante pública foi navegada localmente. As limitações de escuta, compartilhamento nativo e integração real continuam discriminadas abaixo; esta entrega não autoriza publicação em produção.

**Prévia atualizada:** https://bossa-site-h9y5clis5-elos-os.vercel.app/empreendimentos/alma-seahouses
**Commit de código e evidências:** `72358385e84139aba7e844d95d3754e362f75d61`.
**Deploy:** `dpl_7FMBRyo3LeXJgZCg62Eb62n1Cr3G`, estado **READY**, ambiente Preview (`target: null`). Login da Vercel preservado. O HTML remoto respondeu **200**, com título geral correto, nove espaços de mídia, boletim datado e `noindex`. Ver [evidência remota](docs/alma/fase4/previa-verificacao.json). A navegação/interação detalhada e as capturas desta rodada são locais; não são apresentadas como testes interativos remotos.

## 1. Base preservada e escopo

A branch local estava limpa no commit `039beb2f6304ce8bb14b56fe72df198354d9b1da`. A leitura de `FETCH_HEAD`, após buscar a branch no GitHub, confirmou o mesmo commit remoto, sem alterações posteriores a incorporar. Foram preservados os commits de implementação `a391be0` e anteriores, sem restauração ou sobrescrita de trabalho.

Lidos o anexo `Alma_Fase4_Revisao_Visual_e_Funcional.md`, o relatório e a evidência R01 dentro de `Alma_Fase4_Relatorio_e_Evidencias.zip`, as instruções `site/CLAUDE.md` e `site/README.md`; mantida a base factual e a especificação aprovadas das fases 1 e 2. Não foi encontrado `AGENTS.md` aplicável no checkout.

Sequência, textos, identidade, prioridades de mídia, pré-registro e dados de produto permanecem iguais. As quatro opções mantêm 103/114 m² com três suítes e 145/168 m² com quatro suítes, todas com duas vagas. Duplex continuam com pranchas completas e avisos. O boletim continua **10,52% em agosto de 2026**.

O01 não foi tratado como defeito: não foi adicionada rotina de rolagem corretiva nem alterada a estratégia de navegação.

## 2. R01 — Título sincronizado com a seleção

**Causa:** a seleção substitui o endereço pelo histórico nativo para preservar o estado da landing, sem acionar uma navegação do Next. O título estático da rota de entrada permanecia no documento.

**Correção:** o título passa a ser sincronizado por um efeito dependente somente da seleção e da existência de contexto. Reutiliza `almaMetaPlanta`, a mesma fonte dos títulos das rotas individuais. O título geral foi centralizado em `almaMeta`, usado tanto na rota geral quanto na landing. Não há recarga, remontagem, evento de navegação ou alteração da redação.

**Estado: verificado diretamente**, no Chromium local:

- Página geral conserva o título geral enquanto só exibe a opção padrão. A escolha explícita do próprio Tipo 02 passa ao título de 103 m².
- Quatro origens × quatro opções × dois caminhos (seletor e comparação): **32 verificações**, além da página geral. Título, URL, painel e mensagem correspondem à mesma opção.
- Nome preenchido e especificações expandidas preservados. Trocas pelo seletor conservam a posição de rolagem; comparação mantém o retorno ao painel já previsto na especificação.
- Acesso direto, recarga e retorno pelo histórico após visitar a privacidade conferidos nas quatro origens.
- Sem novo `page_view` provocado pela troca. No percurso 103 → 114 → 103, exposição após um segundo gerou apenas uma ocorrência para cada tipologia: `tipo-02`, `tipo-01`.

Evidência: [verificacao-fase4.json](docs/alma/fase4/verificacao-fase4.json), campos `r01` e `r01Eventos`.

## 3. R02 — Painel recolhido com altura natural

**Causa:** o alinhamento padrão do grid esticava `.al-form` para acompanhar a altura da coluna vizinha.

**Correção:** `align-self: start` exclusivamente em `.al-contato-final .al-form`. Não há altura fixa ou corte de conteúdo, nem alteração em `FormLead` ou no CSS do Flow.

**Estado: verificado diretamente.** Valores medidos no navegador:

| Viewport efetivo | Painel recolhido | Painel expandido, antes dos erros |
| --- | --- | --- |
| 1440 × 1000 | 616 × 96,89 px | 616 × 727,92 px |
| 390 × 844 | 358 × 96,89 px | 358 × 796,50 px |
| 320 × 844 | 288 × 96,89 px | 288 × 898,06 px |

O espaço além do botão recolhido corresponde exatamente aos 24 px de respiro superior e inferior, totalizando 48 px. A altura expandida cresce com os campos e com as mensagens de erro. No celular, o formulário maior que a tela é percorrido por rolagem normal. A expansão continua focando Nome; ajuda, consentimento e envio foram alcançados.

Capturas: [computador recolhido](docs/alma/fase4/1440-contato-recolhido.png), [390 recolhido](docs/alma/fase4/390-contato-recolhido.png), [320 expandido](docs/alma/fase4/320-formulario-topo.png), [320 final e erros](docs/alma/fase4/320-formulario-final-erros.png).

## 4. Correção adicional reproduzida — reflow a 200%

A ampliação efetiva de todos os textos reproduziu rolagem horizontal: em viewport de 390 px, o documento chegou a 420 px por textos longos na seção de posição/rodapé; com menu pequeno aberto, chegou a 452 px por “Empreendimentos”.

Foi acrescentado `overflow-wrap: anywhere` no Alma e, somente enquanto a página do Alma está presente, no rodapé e menu institucional. O menu pequeno também recebe altura máxima conforme o viewport e rolagem vertical própria, permitindo alcançar seu último link quando o texto aumenta. Não se escondeu o excesso com `overflow-x: hidden` e não se reduziram fontes.

**Estado: verificado diretamente.** Após a correção, `scrollWidth` coincide com `innerWidth` em 390 e 320 px, inclusive com texto a 200%. O último link do menu e o controle Fechar permanecem alcançáveis. O seletor e o formulário do Flow foram conferidos; os estilos adicionais do menu/rodapé exigem a presença do Alma e não se aplicam ao Flow.

## 5. Situação individual de V01 a V07

| ID | Estado | Resultado e limite |
| --- | --- | --- |
| V01 | **Verificado diretamente — emulação móvel local** | Viewports efetivos 390 × 844 e 320 × 844 CSS px. As dez seções foram percorridas em cada largura, com 20 registros de dimensão. Seletor, comparação, pranchas/avisos, zoom, Escape, menu, âncora e formulário conferidos. Sem rolagem horizontal da página. Não foi usado aparelho físico. |
| V02 | **Verificado diretamente — emulação móvel local** | 14 registros: antes/depois da saída dos botões da abertura, menu aberto, modal aberto, campo focado, contato visível e após escolha de 168 m², nas duas larguras. Barra recolhida nos estados previstos; mensagem acompanha 168 m². Não houve observação de teclado virtual real; o teste de foco não é apresentado como teste de teclado físico/virtual de celular. |
| V03 | **Verificado diretamente — ampliação efetiva de texto** | Todos os textos HTML duplicados a partir de seus tamanhos calculados, incluindo títulos, menu, controles, ajuda e campos. Doze estados testados nas duas larguras. Método e medidas detalhados abaixo. Não é aprovação de zoom nativo do navegador. |
| V04 | **Verificado diretamente: arquivo e silêncio digital. Não verificado: escuta/transcrição** | A faixa AAC existe, mas todas as 5.662.720 amostras PCM decodificadas, incluindo ambos os canais, são zero. Não foi utilizada ferramenta de escuta ou transcrição; a pendência formal de escuta é mantida, conforme solicitado. Nenhuma fala, música ou narração foi inventada. |
| V05 | **Verificado diretamente para cópia; testado com simulação para compartilhamento nativo** | Cópia real na área de transferência do Chromium isolado conferida. Sucesso, cancelamento e falha de `navigator.share` simulados; cancelamento sem erro e falha com link copiável. Diálogo nativo real e aparelho físico não verificados. Nada enviado a terceiros. |
| V06 | **Testado com simulação; integração real não verificada** | Revalidados HTTP 500, `gravado: false`, confirmação incompleta, `ok: false`, falha de rede e sucesso completo. Dados preservados em falhas; `lead_submit` somente com 2xx + `ok: true` + `gravado: true`. Seleção do Flow e seu formulário também testados com resposta controlada. Nenhum lead, mensagem ou pedido real enviado. |
| V07 | **Verificado diretamente — variante pública local navegada** | Build local com `VERCEL_ENV=production`, sem modificar ambiente remoto. Dez seções em 1440, 390 e 320 px: 30 registros de dimensão, 15 capturas específicas. Sem IDs, quadros vazios ou avisos de produção; living e alternativas mantidos; M05 recolhido; nenhuma reprodução falsa. Seleção e contato de 114 m² também conferidos. |

### V03 — mecanismo e prova do aumento real

O teste lê **todos** os `font-size` e `line-height` calculados dos elementos HTML antes de alterar qualquer estilo. Em seguida, aplica o dobro desses valores ao texto efetivamente renderizado. A leitura anterior à escrita impede multiplicações sucessivas por herança. A página é recarregada entre os cenários; não se incorpora esse estilo de teste ao produto.

Isso não altera DPR, viewport, escala de imagem ou `transform`. Viewport e DPR foram medidos antes/depois: **390 × 844 / DPR 1** e **320 × 844 / DPR 1**, sem mudança. Exemplos de valores efetivos:

| Elemento | Antes | Depois |
| --- | --- | --- |
| H1 | 42 px | 84 px |
| H2 | 32 px | 64 px |
| Parágrafo | 17 px | 34 px |
| Botão principal | 14 px | 28 px |
| Menu/Fechar | 12 px | 24 px |
| Navegação local | 17 px | 34 px |
| Campo do formulário | 17 px | 34 px |

Estados: abertura, menu, plantas/âncora, comparação, formulário com erros e modal, em ambas as larguras. Foram conferidos leitura, rolagem interna do menu, posição do título da âncora abaixo das barras, alcance do consentimento/envio e controles de zoom/ajuste/fechamento. No modal, texto maior pode exigir rolagem vertical; cada controle foi focado e teve sua posição efetiva conferida dentro da tela. As notas longas permanecem em sua área consultável e na descrição acessível.

Não foi obtido um mecanismo confiável de zoom **nativo** neste Chromium automatizado; esse mecanismo específico não é apresentado como realizado. A alternativa de ampliação efetiva de texto permitida no pedido foi realizada, com fatores medidos de 2,0.

Evidência: [texto200-verificacao.json](docs/alma/fase4/texto200-verificacao.json), [100% em 390](docs/alma/fase4/texto100-390-abertura.png), [200% em 390](docs/alma/fase4/texto200-390-abertura.png), [menu a 200% em 320](docs/alma/fase4/texto200-320-menu-final.png), [modal a 200%](docs/alma/fase4/texto200-390-modal.png).

### V04 — arquivo de áudio

Arquivo real: `site/public/video/alma/trajeto.mp4`. SHA-256: `d69cc46287907d3546cbb46e1c21e53a18d7d2d671772bb95c181085197a3ab7`.

`ffprobe` identificou vídeo H.264 e uma faixa AAC-LC estéreo a 44.100 Hz, com aproximadamente 64,20 s. O FFmpeg decodificou integralmente essa faixa para PCM float32, sem filtro de volume. Mínimo = máximo = 0; amostras não zero = 0. Portanto, não foi encontrado sinal sonoro no conteúdo decodificado. A existência do contêiner de áudio não implica fala; a ausência de `<track>` não foi tratada como defeito.

Não houve escuta nem transcrição disponíveis. Nenhum arquivo de legenda foi criado a partir de suposição; o vídeo não foi alterado. Evidências: [audio-ffprobe.json](docs/alma/fase4/audio-ffprobe.json) e [audio-amostras.json](docs/alma/fase4/audio-amostras.json).

## 6. Capturas com controles reais

As capturas são do navegador local no viewport indicado, sem redimensionamento posterior e **sem ocultar cabeçalho, navegação ou barra móvel por CSS de captura**. Quando uma barra está ausente, isso decorre do estado real previsto no produto (menu/modal/foco/contato). A navegação local pode rolar horizontalmente dentro de sua própria faixa, como previsto; a página não ganha rolagem horizontal.

| Percurso | 390 px | 320 px |
| --- | --- | --- |
| Abertura | [Ver](docs/alma/fase4/390-inicio.png) | [Ver](docs/alma/fase4/320-inicio.png) |
| Plantas e barra | [Ver](docs/alma/fase4/390-barra-plantas.png) | [Ver](docs/alma/fase4/320-barra-plantas.png) |
| Comparação | [Ver](docs/alma/fase4/390-comparacao.png) | [Ver](docs/alma/fase4/320-comparacao.png) |
| Duplex e aviso | [Ver](docs/alma/fase4/390-duplex-aviso.png) | [Ver](docs/alma/fase4/320-duplex-aviso.png) |
| Modal e zoom | [Ver](docs/alma/fase4/390-modal-zoom.png) | [Ver](docs/alma/fase4/320-modal-zoom.png) |
| Menu aberto | [Ver](docs/alma/fase4/390-menu-aberto.png) | [Ver](docs/alma/fase4/320-menu-aberto.png) |
| Lazer | [Ver](docs/alma/fase4/390-lazer.png) | [Ver](docs/alma/fase4/320-lazer.png) |
| Formulário recolhido | [Ver](docs/alma/fase4/390-contato-recolhido.png) | [Ver](docs/alma/fase4/320-contato-recolhido.png) |
| Formulário e foco | [Ver](docs/alma/fase4/390-campo-focado.png) | [Ver](docs/alma/fase4/320-campo-focado.png) |
| Variante pública — Bossa | [Ver](docs/alma/fase4/publica-390-obra.png) | [Ver](docs/alma/fase4/publica-320-obra.png) |

A pasta também inclui as demais seções, parte superior/final do formulário, texto ampliado e as capturas públicas de computador. [Pública — contato em 1440 px](docs/alma/fase4/publica-1440-contato.png).

## 7. Evidências, reprodução e limites

`npm run typecheck`, builds locais Preview e variante pública, testes de navegador e `git diff --check`: concluídos sem falha na versão entregue. Os ajustes não exigiram mudança de dependências, API, banco ou componente compartilhado de formulário.

- [verificacao-fase4.json](docs/alma/fase4/verificacao-fase4.json): Chromium 154.0.8037.57, 33 registros de R01, medidas de R02, dez seções em cada viewport, estados da barra, cópia e testes controlados.
- [texto200-verificacao.json](docs/alma/fase4/texto200-verificacao.json): 12 estados, fontes antes/depois e dimensões efetivas.
- [publica-visual-verificacao.json](docs/alma/fase4/publica-visual-verificacao.json): navegação pública local, 30 registros.
- `scripts/verificar-alma-fase4.cjs`: teste local de R01/R02, móvel, compartilhamento e formulário.
- `scripts/verificar-alma-texto-publico.cjs`: ampliação efetiva de texto; argumento `--publica` navega a variante pública previamente compilada.

Para reproduzir: em `site/`, `VERCEL_ENV=preview npm run build`, iniciar `npm run start -- -p 3200` e executar os scripts com Playwright disponível (`PLAYWRIGHT_MODULE` permite indicar uma instalação existente). Para `--publica`, parar o servidor, compilar localmente com `VERCEL_ENV=production`, reiniciar e executar o script. `CHROMIUM_PATH` pode indicar o executável. Ambos os scripts aceitam somente localhost/127.0.0.1 e interceptam envios. O build final foi restaurado para Preview.

**Evidência anterior reaproveitada:** a revisão de computador do Work sobre acervo, redação, treze FAQs, ambientes/pavimentos, avisos comerciais e boletim; a simulação da RPC/normalização internacional da fase 3, cujo código não mudou. Não se reclassificam essas evidências como nova validação remota ou persistência real.

**Não verificado:** aparelho físico, teclado virtual real, leitor de tela, diálogo de compartilhamento nativo do sistema operacional, escuta/transcrição do áudio e integração real com o atendimento. Não foram executadas alterações de banco, CRM ou Nara para suprir essas lacunas. Os materiais M01–M08 e P01–P12 continuam com o tratamento aprovado; esta rodada não produziu ou validou novos materiais técnicos/comerciais.

## 8. Arquivos alterados e publicação

Arquivos de produto:

- `src/content/alma.ts`: fonte única do metadado geral, preservando os títulos aprovados.
- `src/app/empreendimentos/[slug]/page.tsx`: reutiliza o metadado geral centralizado.
- `src/components/alma/AlmaPagina.tsx`: sincroniza `document.title` com a seleção/contexto.
- `src/styles/alma.css`: altura natural de `.al-form` e correção de reflow reproduzida a 200%, limitada ao Alma.

Arquivos de verificação/entrega:

- `scripts/verificar-alma-fase4.cjs`.
- `scripts/verificar-alma-texto-publico.cjs`.
- `docs/alma/fase4/`: capturas PNG e evidências JSON desta rodada.
- `Alma_Fase4_Complementacao_e_Correcoes.md`: este relatório.

**Publicação permitida:** somente nova prévia protegida em `bossa-site`. Nenhum merge em `main`, promoção, deploy de produção, alteração de domínio, DNS, proteção, credenciais, estado comercial, CRM, banco ou Nara. Nenhuma mensagem, lead ou solicitação real de apresentação foi enviada. O encerramento da fase 4 permanece para decisão de Fábio à luz das evidências e limites acima.

O commit posterior que preenche a URL deste relatório altera somente documentação e evidências de deploy; a prévia revisável permanece ligada ao commit de código indicado acima.
