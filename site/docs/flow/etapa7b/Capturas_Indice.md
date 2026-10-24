# Flow — Etapa 7B: capturas e evidências

Capturas novas do Chromium local, build `2330da6`, com viewport CSS real. Não são capturas remotas ou de aparelho físico. Controles reais mantidos visíveis conforme o estado. Série geral:360 × 844,390 × 844,768 × 844,1024 × 844,1440 × 900. Série específica de interface:360 × 640,390 × 844,768 × 844,1024 × 844,1440 × 900. Não houve redimensionamento de imagem para simular largura.

## Seleção para revisão

| Largura | Abertura sem banner | Tipo 1 liberado | Move escolhido | Vistas compactas | Visor Tipo 1 |
|---:|---|---|---|---|---|
|360|[Abrir](360-inicio-flow.jpg)|[Abrir](360-tipo1-aprovado.jpg)|[Abrir](360-move-escolhido.jpg)|[Abrir](360-vistas-compactas.jpg)|[Abrir](360-visor-tipo1.jpg)|
|390|[Abrir](390-inicio-flow.jpg)|[Abrir](390-tipo1-aprovado.jpg)|[Abrir](390-move-escolhido.jpg)|[Abrir](390-vistas-compactas.jpg)|[Abrir](390-visor-tipo1.jpg)|
|768|[Abrir](768-inicio-flow.jpg)|[Abrir](768-tipo1-aprovado.jpg)|[Abrir](768-move-escolhido.jpg)|[Abrir](768-vistas-compactas.jpg)|[Abrir](768-visor-tipo1.jpg)|
|1024|[Abrir](1024-inicio-flow.jpg)|[Abrir](1024-tipo1-aprovado.jpg)|[Abrir](1024-move-escolhido.jpg)|[Abrir](1024-vistas-compactas.jpg)|[Abrir](1024-visor-tipo1.jpg)|
|1440|[Abrir](1440-inicio-flow.jpg)|[Abrir](1440-tipo1-aprovado.jpg)|[Abrir](1440-move-escolhido.jpg)|[Abrir](1440-vistas-compactas.jpg)|[Abrir](1440-visor-tipo1.jpg)|

## Cookies e telas baixas

- [360×640,primeiro acesso](360x640-cookies-primeiro-acesso.jpg) e [após rolagem real do percurso](360x640-cookies-cta-apos-rolagem.jpg).
- [390×844,primeiro acesso](390x844-cookies-primeiro-acesso.jpg) e [após rolagem](390x844-cookies-cta-apos-rolagem.jpg).
- No celular o banner fica no fluxo; pode sair da tela ao rolar. Nenhum controle foi ocultado para criar a evidência. Nos percursos sem banner foi usado consentimento prévio de cookies necessários.

## Testes e limites

- [Matriz de60estados](verificacao.json):rotas, formulários simulados, axe e regressões.
- [Interface](interface.json):cookies, Move, tablet,36 vistas móveis e saída SPA.
- [Teclado/zoom400%](teclado.json) e [captura em alta](390-tipo1-zoom400.jpg).
- [Complementos](complementos.json):11 estados de barra, pinça emulada e quatro vídeos reais.
- [Texto200%](390-texto200-plantas.png),[formulário200%](390-texto200-formulario.png),[menu200%](390-texto200-menu.png),[visor200%](390-texto200-modal.png). Fontes/entrelinhas duplicadas no DOM; sem mudar viewport, DPR ou usar transform. Não é zoom nativo nem escuta com leitor de tela.
- [API contra RPC fictícia](api-controlada.json):sem banco real.
- [Build](build.txt),[integridade do material](materiais.json),[HTML remoto protegido](conferencia-remota.json).

## Todas as capturas

- [1024-construcao.jpg](1024-construcao.jpg)
- [1024-duplex.jpg](1024-duplex.jpg)
- [1024-flow-move.jpg](1024-flow-move.jpg)
- [1024-inicio-flow.jpg](1024-inicio-flow.jpg)
- [1024-localizacao-flow.jpg](1024-localizacao-flow.jpg)
- [1024-move-escolhido.jpg](1024-move-escolhido.jpg)
- [1024-plantas.jpg](1024-plantas.jpg)
- [1024-the-roof.jpg](1024-the-roof.jpg)
- [1024-tipo1-aprovado.jpg](1024-tipo1-aprovado.jpg)
- [1024-visita.jpg](1024-visita.jpg)
- [1024-visor-tipo1.jpg](1024-visor-tipo1.jpg)
- [1024-vistas-compactas.jpg](1024-vistas-compactas.jpg)
- [1024-vistas.jpg](1024-vistas.jpg)
- [1024x844-cookies-cta-apos-rolagem.jpg](1024x844-cookies-cta-apos-rolagem.jpg)
- [1024x844-cookies-primeiro-acesso.jpg](1024x844-cookies-primeiro-acesso.jpg)
- [1440-abertura.jpg](1440-abertura.jpg)
- [1440-construcao.jpg](1440-construcao.jpg)
- [1440-duplex.jpg](1440-duplex.jpg)
- [1440-flow-move.jpg](1440-flow-move.jpg)
- [1440-inicio-flow.jpg](1440-inicio-flow.jpg)
- [1440-localizacao-flow.jpg](1440-localizacao-flow.jpg)
- [1440-move-escolhido.jpg](1440-move-escolhido.jpg)
- [1440-plantas.jpg](1440-plantas.jpg)
- [1440-the-roof.jpg](1440-the-roof.jpg)
- [1440-tipo1-aprovado.jpg](1440-tipo1-aprovado.jpg)
- [1440-visita.jpg](1440-visita.jpg)
- [1440-visor-tipo1.jpg](1440-visor-tipo1.jpg)
- [1440-visor.jpg](1440-visor.jpg)
- [1440-vistas-compactas.jpg](1440-vistas-compactas.jpg)
- [1440-vistas.jpg](1440-vistas.jpg)
- [1440x900-cookies-cta-apos-rolagem.jpg](1440x900-cookies-cta-apos-rolagem.jpg)
- [1440x900-cookies-primeiro-acesso.jpg](1440x900-cookies-primeiro-acesso.jpg)
- [360-construcao.jpg](360-construcao.jpg)
- [360-duplex.jpg](360-duplex.jpg)
- [360-flow-move.jpg](360-flow-move.jpg)
- [360-inicio-flow.jpg](360-inicio-flow.jpg)
- [360-localizacao-flow.jpg](360-localizacao-flow.jpg)
- [360-move-escolhido.jpg](360-move-escolhido.jpg)
- [360-plantas.jpg](360-plantas.jpg)
- [360-the-roof.jpg](360-the-roof.jpg)
- [360-tipo1-aprovado.jpg](360-tipo1-aprovado.jpg)
- [360-visita.jpg](360-visita.jpg)
- [360-visor-tipo1.jpg](360-visor-tipo1.jpg)
- [360-vistas-compactas.jpg](360-vistas-compactas.jpg)
- [360-vistas.jpg](360-vistas.jpg)
- [360x640-cookies-cta-apos-rolagem.jpg](360x640-cookies-cta-apos-rolagem.jpg)
- [360x640-cookies-primeiro-acesso.jpg](360x640-cookies-primeiro-acesso.jpg)
- [390-comparacao-real.jpg](390-comparacao-real.jpg)
- [390-construcao.jpg](390-construcao.jpg)
- [390-contato-sucesso-simulado.jpg](390-contato-sucesso-simulado.jpg)
- [390-duplex.jpg](390-duplex.jpg)
- [390-flow-move.jpg](390-flow-move.jpg)
- [390-inicio-flow.jpg](390-inicio-flow.jpg)
- [390-localizacao-flow.jpg](390-localizacao-flow.jpg)
- [390-move-escolhido.jpg](390-move-escolhido.jpg)
- [390-plantas.jpg](390-plantas.jpg)
- [390-texto200-formulario.png](390-texto200-formulario.png)
- [390-texto200-menu.png](390-texto200-menu.png)
- [390-texto200-modal.png](390-texto200-modal.png)
- [390-texto200-plantas.png](390-texto200-plantas.png)
- [390-the-roof.jpg](390-the-roof.jpg)
- [390-tipo1-aprovado.jpg](390-tipo1-aprovado.jpg)
- [390-tipo1-zoom400.jpg](390-tipo1-zoom400.jpg)
- [390-visita.jpg](390-visita.jpg)
- [390-visor-tipo1.jpg](390-visor-tipo1.jpg)
- [390-vistas-compactas.jpg](390-vistas-compactas.jpg)
- [390-vistas.jpg](390-vistas.jpg)
- [390x844-cookies-cta-apos-rolagem.jpg](390x844-cookies-cta-apos-rolagem.jpg)
- [390x844-cookies-primeiro-acesso.jpg](390x844-cookies-primeiro-acesso.jpg)
- [768-construcao.jpg](768-construcao.jpg)
- [768-duplex.jpg](768-duplex.jpg)
- [768-flow-move.jpg](768-flow-move.jpg)
- [768-inicio-flow.jpg](768-inicio-flow.jpg)
- [768-localizacao-flow.jpg](768-localizacao-flow.jpg)
- [768-move-escolhido.jpg](768-move-escolhido.jpg)
- [768-plantas.jpg](768-plantas.jpg)
- [768-the-roof.jpg](768-the-roof.jpg)
- [768-tipo1-aprovado.jpg](768-tipo1-aprovado.jpg)
- [768-visita.jpg](768-visita.jpg)
- [768-visor-tipo1.jpg](768-visor-tipo1.jpg)
- [768-vistas-compactas.jpg](768-vistas-compactas.jpg)
- [768-vistas.jpg](768-vistas.jpg)
- [768x844-cookies-cta-apos-rolagem.jpg](768x844-cookies-cta-apos-rolagem.jpg)
- [768x844-cookies-primeiro-acesso.jpg](768x844-cookies-primeiro-acesso.jpg)
