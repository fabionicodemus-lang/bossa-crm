# Flow — Impermeabilização dos banheiros

Atualização preparada em 23/10/2026 para a prévia da página comercial. Não é laudo de execução nem manual de aplicação.

## Fontes autorizadas

- Newsletter Bossa nº 22, junho de 2026: `Flow_Aptos_-Newsletter_Obras_-_Junho_2026.pdf`, enviada nesta conversa. Página 4 contém a reportagem e o esquema; página 5 prevê o início dos serviços em julho. A edição é referência do processo descrito, não data de execução de cada banheiro.
- PDF original SHA-256: `f7d3e000a8c10678cdaed9e4b109a396da935faa2467c5b09acef27892963f07`.
- Vídeo recebido: `WhatsApp Video 2026-10-23 at 17.30.55.mp4`. A direção o forneceu no contexto da impermeabilização do Flow. Mostra preparo, aplicação do produto e tela de reforço em encontros e passagens. Não demonstra um ensaio completo de 72 horas. Data de filmagem, pavimento e unidade não informados; não foram presumidos a partir do nome do arquivo.
- Vídeo original SHA-256: `65d403650db494d5134f1fabb1643de2b7cf25d8faec4e4021fa98b1a35faea3`.
- Produto utilizado confirmado por Fábio: **Vedatop Ultraflex 12000**, fabricante **Vedacit**.
- Fabricante, consultado em 23/10/2026: https://vedacit.com.br/para-voce/produtos-e-solucoes/produtos/vedatop-ultraflex-12000
- Ficha técnica disponibilizada pelo fabricante, revisão 1_2025: https://projeto-site-vedacit-s3.s3.sa-east-1.amazonaws.com/FIC-VED-TEC-026.r00_1-FT-VEDATOP_ULTRAFLEX_12000_-_2025.pdf

## Conteúdo e limites

A página adapta a explicação da Bossa: membrana sobre o contrapiso com caimento, reforço nos pontos críticos, aplicação em demãos cruzadas, cura, teste de estanqueidade por 72 horas e liberação do acabamento após aprovação. É a descrição do procedimento informado, não certificação individual das unidades.

Não foram reproduzidas promessas de ausência de infiltração por décadas, comparações genéricas com outros construtores ou afirmações de conformidade integral com normas. Não se afirma espessura medida da membrana nem consumo efetivamente aferido. Número fixo de demãos não é apresentado como substituto do consumo especificado.

### Compatibilidade com revestimentos — ponto para confirmação técnica

Em 24/10/2026, Fábio confirmou nesta conversa que o porcelanato é assentado diretamente sobre a membrana, conforme a descrição da newsletter. Essa confirmação esclarece a execução informada pela direção; não constitui aprovação do fabricante para qualquer formato de peça.

A ficha atual do produto permite assentamento direto para cerâmica até 20 × 20 cm, com argamassa apropriada a partir de ACIII, e recomenda proteção mecânica para dimensões superiores. Ainda em 24/10/2026, Fábio informou porcelanato de **70 × 70 cm** e argamassa **ACIII flexível**, assentados diretamente sobre a membrana. Marca e modelo da argamassa não foram informados. Esse formato ultrapassa o limite de 20 × 20 cm citado para assentamento direto na ficha consultada; a classificação ACIII, isoladamente, não comprova autorização para esse formato maior. Permanece pendente orientação formal da Vedacit sobre essa composição específica, incluindo compatibilidade da argamassa e eventual necessidade de proteção mecânica. A página comercial mantém o foco na posição da impermeabilização, nos reforços e no procedimento de teste; não apresenta o assentamento direto como diferencial tecnicamente validado nem o esquema como detalhe executivo específico do Flow.

Também se respeita a distinção entre cura e ensaio: a ficha informa cura mínima antes do teste conforme o ambiente e teste de ao menos 72 horas nas demais áreas, com regras próprias para piscinas e reservatórios. Nenhum prazo de piscina foi atribuído aos banheiros.

## Imagens

- `site/public/img/flow/engenharia/impermeabilizacao-aplicacao.webp`: quadro real do vídeo no segundo 26, extraído do original e reduzido proporcionalmente para 540 × 960, WebP qualidade 90, 83.074 bytes. Mostra aplicação sobre o reforço no encontro piso/parede. Usado como foto ampliável e capa do player. Não é imagem gerada, não foi retocado nem reenquadrado.
- `site/public/img/flow/engenharia/impermeabilizacao-esquema-newsletter.webp`: imagem incorporada no PDF, página 4, objeto 67, extraída sem captura da página. Original 521 × 468, convertido para WebP qualidade 92, mesmas dimensões, 72.846 bytes. Identificada como **esquema ilustrativo da newsletter**, não foto real nem detalhe executivo compatibilizado. Não se atribui a parede de tijolos desenhada à alvenaria Celucon do Flow.
- Hash SHA-256 da imagem JPEG extraída: `4cebef60c5872714a984b20387c2e0dbb0f05992741b4bb837abb002db0c4e22`.
- WebP aplicação SHA-256: `ba34336bba7a8aaf4bdfb2fda1c0d3528d50a5d9a665b9a7d42a140a0b90517c`.
- WebP esquema SHA-256: `a0a086e3343f4486a76b4876d61e93d498f7e5b683bc73947d2dc5d7a5244d37`.

## Vídeo para a web

- Caminho: `site/public/video/flow/impermeabilizacao-flow.mp4`.
- Original: HEVC 2160 × 3840, 30 fps, AAC estéreo, 40,170 s, 84.784.340 bytes.
- Versão web: H.264, 540 × 960, 30 fps, yuv420p, CRF 23, preset medium, faststart, 8.129.168 bytes. Sem cortes, mudança de velocidade ou alteração da sequência. A imagem foi recodificada para compatibilidade e redução de peso.
- Áudio AAC copiado sem recodificação, normalização ou substituição. SHA-256 do fluxo de áudio igual no original e no derivado: `f1d6e83c2e1ea1c4c246ad4fff16d5439d62f6ceea8eabb590654d2000df89db`.
- MP4 web SHA-256: `bb6187c493b2a4035ff3c9cb0a9673d88a1d3d9ff913177b2fa0c0d685433fa5`.
- Decodificação integral do derivado concluída sem erros.
- Player existente reutilizado: montagem somente após clique, controles e áudio habilitados, enquadramento completo, fechamento e retorno de foco. Não foi adicionada transcrição não revisada.

## Implementação

`ImpermeabilizacaoFlow` substitui o cartão genérico de áreas molhadas. Duas chamadas principais (posição da membrana e teste de 72 h), foto real ampliável, vídeo e processo expansível com esquema. Fontes e limites preservados neste registro; sem novo formulário, dependência ou efeito React.
