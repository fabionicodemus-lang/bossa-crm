# Flow — alvenaria Celucon e registros recebidos em 23/10/2026

## Especificações informadas por Fábio

| Aplicação | Material/espessura |
| --- | --- |
| Entre apartamentos | Bloco acústico Celucon de 20 cm |
| Fachadas dos apartamentos | Bloco de concreto celular Celucon de 14 cm |
| Divisões internas de quartos e banheiros | Bloco de concreto celular Celucon de 11 cm |

Essas medidas foram fornecidas diretamente pelo diretor/engenheiro da Bossa para o Flow. Não foram substituídas por espessuras de catálogos genéricos.

## Mídias e procedência

| Original recebido | Conteúdo identificado | Arquivo no site | Duração |
| --- | --- | --- | --- |
| snapinsta-1792783356063.mp4 | Fábio Nicodemus explica a escolha do concreto celular no Flow; identificação e legendas aparecem no vídeo | public/video/flow/fabio-bloco-celular.mp4 | 2:07 |
| linkedin-video.mp4 | Acompanhamento da Celucon na obra do Flow, confirmado pelo usuário; imagens de equipe, alvenaria e execução, com identificação Bossa/Porto Belo | public/video/flow/celucon-na-obra.mp4 | 0:58 |
| snapinsta-1792783862917.mp4 | Demonstração sonora com amostra identificada Celucon; não foi apresentada como ensaio de parede ou medição em apartamento | public/video/flow/demonstracao-acustica-celucon.mp4 | 0:35 |

Recebimento não é data de filmagem. Datas de gravação, pavimentos e identidade do apresentador da Celucon não foram informados. A página não inventa esses dados nem apresenta esses registros como avanço atual da obra. Não foram criadas transcrições a partir de falas presumidas; a revisão desta etapa foi visual e técnica dos arquivos, não transcrição integral do áudio. O vídeo de Fábio contém legendas gravadas na imagem; WebVTT/transcrições revisadas continuam pendentes.

Os vídeos foram preparados em H.264/MP4 a 540 × 960, com faststart, sem cortes editoriais. Os dois primeiros têm áudio AAC 64 kbit/s. Na demonstração acústica, a faixa AAC foi copiada integralmente: o hash SHA-256 do fluxo de áudio é idêntico no original e na versão para o site (`d502bccbf333cdf2e7513104b9eaa97bdd2af299a9a33e778f9a4a893e553744`). Não foi aplicada normalização de volume, redução de ruído ou alteração do som.

Posters reais extraídos em 4 s (Fábio), 19 s (acompanhamento) e 18 s (demonstração). A imagem maior de execução vem do instante 35 s de `linkedin-video.mp4`; é um frame real convertido em WebP, sem geração por IA ou alteração da cena.

## Limites das alegações

O texto apresenta a finalidade do bloco acústico entre unidades e a contribuição do concreto celular para reduzir a passagem de calor. Não promete silêncio absoluto, desempenho em dB, percentual de economia de energia ou certificação do Flow. A demonstração com amostra é explicitamente diferenciada de medição no apartamento. O resultado depende do sistema construtivo e da execução.

Referência do fabricante consultada para propriedades gerais: [Caderno Técnico Celucon, 2ª edição](https://celucon.com.br/wp-content/uploads/2020/08/caderno-tcnico-celucon-edio-02.pdf), seção de vantagens e benefícios, p. 6, recuperada pelo índice de busca. O acesso direto ao PDF retornou 502 na consulta; não houve leitura integral do documento. A especificação efetivamente utilizada no Flow foi fornecida pelo usuário.

## Integridade

| Arquivo para o site | Bytes | SHA-256 |
| --- | --- | --- |
| fabio-bloco-celular.mp4 | 6217236 | 9fe121e930a58d00c8a9aa56596d04685636a71bd981752158322561d69d5fbd |
| celucon-na-obra.mp4 | 6414953 | 7129a6a0a404ccd4382e6a593f052b26ae096894eef810e373ec34094329e120 |
| demonstracao-acustica-celucon.mp4 | 2204568 | 1841049cfb096dccf413c5d129911c1e1b79f60fef13e1b8ef06c1e142014c92 |

Os hashes dos blobs enviados ao GitHub foram comparados com os arquivos locais. Os três vídeos somam 14.836.757 bytes, contra 27.391.632 bytes nos originais. As mídias continuam carregando somente após o clique no cartão.

## Escopo e verificação

A seção de engenharia ganhou um bloco visual de alvenaria, aplicações de 20/14/11 cm, imagem documental e três cartões de vídeo. Foram reutilizados o player/modal e os estilos da página, com grade responsiva e imagens com dimensões explícitas. Sem dependência nova, mudanças de formulário, env vars, banco ou CRM.

Verificações locais: formato e duração dos arquivos, decodificação, hashes dos blobs e identidade da faixa de áudio da demonstração. A revisão React verificou integração, estrutura, semântica das especificações e carregamento sob demanda. A compilação completa e a verificação no navegador são realizadas na prévia ligada ao commit; seus resultados ficam registrados no PR. Não houve build local por ausência das dependências do projeto.

Mantido no PR de trabalho, sem merge ou publicação em produção.
