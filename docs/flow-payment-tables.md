# Tabelas comerciais por valor presente

Regras definidas pelo gestor em 24/11/2026 para as unidades disponíveis do Flow:

- À vista: aplicar a razão exata `750000 / 986590` ao preço atual de cada unidade (desconto de aproximadamente 23,98058%).
- 36 meses: entrada de 30%, três reforços anuais, sem parcela de chaves.
- 48 meses: entrada de 30%, quatro reforços anuais, chaves de 10%.
- Tabela atual: preservar o cadastro do CRM. Um resíduo de arredondamento de até R$ 1 é conciliado exclusivamente na última mensal, sem gravar na unidade; divergências maiores impedem uma oferta completa.
- Cada reforço mantém o valor em reais registrado na unidade. Nas unidades 501, 1503 e 1603, o gestor autorizou 6% do preço atual, respectivamente R$ 81.540, R$ 85.740 e R$ 88.140.

A configuração aprovada fica em `developments.default_payment_plan.payment_tables`, somente no Flow. O motor não ativa preços alternativos por nome de empreendimento ou com base em texto livre. Não há alteração automática de preços em `development_units` ou propostas existentes. O Alma mantém suas condições comerciais.

## Cálculo

Base de cálculo: novembro/2026. Entrada no ato, primeira mensal no mês seguinte, reforços nos meses 12, 24, 36 e, quando aplicável, 48 e 60. Chaves previstas do Flow em novembro/2027 (mês 12).

A taxa de equivalência é resolvida numericamente a partir do fluxo efetivo do 1802: entrada R$ 200 mil, 60 mensais de R$ 4.859,83, cinco reforços de R$ 59 mil e R$ 200 mil nas chaves, equivalentes a R$ 750 mil à vista. A taxa é aproximadamente 1,39626008% ao mês. Ela serve apenas ao cálculo do valor presente, não é uma cobrança ao comprador.

As novas tabelas resolvem simultaneamente o total e a entrada percentual, mantendo os reforços fixos. Os valores monetários são arredondados em centavos, com reconciliação na última mensal. Não há projeção dos índices futuros: os resultados são valores-base, sujeitos a CUB durante as obras e, após as chaves, IPCA + 0,59% a.m. A formação de preço e o reajuste contratual são apresentados separadamente.

## Caminho da informação

O mesmo motor atende a tela de empreendimentos, as quatro versões de impressão e as consultas estruturadas da Nara. A consulta normal identifica explicitamente o valor à vista. Consultas às modalidades aprovadas podem acompanhar o encaminhamento financeiro existente; propostas do contato e descontos adicionais não recebem aprovação automática. A consulta é refeita antes do envio e as quantias são auditadas com a modalidade de origem.

Verificação: `npm run test:payment-tables` cobre fluxo descontado, centavos, reforços, configuração inválida, estoque e organização, impressão, HTML da tela, auditoria e o motor real da Nara com transporte simulado, sem envio de WhatsApp ou chamadas externas.

## Compra direta sem comissão

Em 24/11/2026 o gestor confirmou que as quatro tabelas incluem comissão de 5% e autorizou um benefício de **4% sobre o total de cada condição** em compras diretas sem comissão. A configuração específica fica em `default_payment_plan.direct_purchase`: `version:1`, `approved:true`, `discount_bps:400`, `table_commission_bps:500`. Ela não modifica as tabelas originais, impressões, propostas ou preços das unidades, nem estende a regra a outro empreendimento.

A Nara consulta os valores novamente a cada turno e aplica 96% uma única vez a cada componente do plano selecionado, conciliando centavos na última mensal. No 1802: à vista R$ 720.000; 36x R$ 861.483,95; 48x R$ 893.213,79; tabela atual R$ 947.126,40. Os reajustes contratuais permanecem. Os reforços das tabelas originais são preservados; na condição direta também recebem o benefício proporcional.

Origem de anúncio, site, Google ou WhatsApp não comprova ausência de intermediação. Sem confirmação, informa-se a tabela original e pergunta-se se já existe corretor na compra. Declaração explícita de ausência de corretor ou resposta negativa à pergunta confirma a condição, desde que não haja vínculo/indicação de corretor no cadastro ou histórico. Evidência de intermediação prevalece sobre afirmação posterior de compra direta. O Plantão continua consultando os preços originais.

Comunicação: “condição especial de compra direta”, apresentando o preço final e sempre distinguindo à vista de parcelado. Não abrir espontaneamente a composição da comissão, nem anunciar os 4% como desconto extra sobre o preço já reduzido. Consultas às modalidades já aprovadas seguem com a Nara; pedidos de humano, proposta, reserva, fechamento ou desconto adicional seguem para o comercial. A auditoria identifica `:direct_purchase` e conserva os resultados estruturados consultados.

`npm run test:nara-direct-purchase` verifica elegibilidade, origem desconhecida, indicação de corretor, benefício único, orçamento, indisponibilidade/organização, quatro fluxos exatos, auditoria, resposta posterior à confirmação e o caminho completo da Nara com transporte simulado.
