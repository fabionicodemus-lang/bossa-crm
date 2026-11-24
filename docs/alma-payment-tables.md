# Tabelas do Alma

Autorização do gestor em 24/11/2026: aplicar ao Alma o mesmo processo comercial do Flow, com referência e modalidades próprias, inclusive o benefício de compra direta sem comissão.

## Condições

- Unidade 1002 à vista: R$ 999.000,00. Preço original no CRM: R$ 1.285.350,85. Razão exata `99900000 / 128535085`, aplicada ao preço atual de cada unidade; desconto de 22,2780301581%.
- 25% de entrada + 40 mensais + 3 reforços anuais. Sem pagamento nas chaves.
- 20% de entrada + 60 mensais + 4 reforços anuais + 10% nas chaves.
- Tabela atual do CRM preservada. Na referência 1002 são 15% de entrada, 80 mensais, 7 reforços anuais e 10% nas chaves; utilizam-se os valores reais cadastrados, sem substituir por percentuais recalculados.
- O valor de cada reforço anual é preservado em reais em todas as tabelas originais. Na 1002: R$ 78.957,27 por reforço.
- CUB durante as obras; após as chaves, IPCA + 0,59% a.m. Chaves em julho/2030.
- Compra direta confirmada sem comissão: 4% sobre cada modalidade aprovada, uma vez. Tabelas com comissão mantidas. O motor calcula o benefício, ajustando os centavos na última mensal; a Nara apresenta o preço final como condição de compra direta.

## Cálculo e referência

Data-base: 24/11/2026. Entrada no ato, primeira mensal em 30 dias, reforços a cada 12 meses. As chaves estão a 44 meses da referência. O fluxo original da 1002 tem entrada R$ 192.802,62, 80 mensais de R$ 5.141,40, 7 anuais de R$ 78.957,27 e R$ 128.535,08 nas chaves. A sétima anual ocorre no mês 84, preservando a periodicidade e a quantidade do cadastro atual. Diferenças de arredondamento de até R$ 1 são conciliadas somente na última mensal da consulta/impressão, sem alterar a unidade no banco.

A taxa interna de equivalência entre o fluxo original e R$ 999 mil é aproximadamente 0,710555701% ao mês. É um parâmetro de formação das tabelas, não uma cobrança adicional nem projeção de CUB/IPCA. Entrada e total são resolvidos simultaneamente, mantendo os reforços fixos.

| Modalidade | Total-base 1002 | Compra direta sem comissão |
|---|---:|---:|
| À vista | R$ 999.000,00 | R$ 959.040,00 |
| 25% + 40x + 3 anuais | R$ 1.114.759,01 | R$ 1.070.168,65 |
| 20% + 60x + 4 anuais + 10% chaves | R$ 1.186.968,51 | R$ 1.139.489,77 |
| Atual: 80x + 7 anuais | R$ 1.285.350,85 | R$ 1.233.936,82 |

## Implementação e validação

Configuração isolada em `developments.default_payment_plan.payment_tables` do Alma, com `installment_plans` para `months40` e `months60`. O Flow sem esse campo mantém 36/48/60. A opção `current` usa o prazo cadastrado da referência de cada empreendimento. Tela, impressão, consultas e comunicação da Nara usam as opções aprovadas do empreendimento consultado; 60x no Alma não é a tabela atual de 80x.

A condição de compra direta usa `direct_purchase` aprovado, 400 pontos-base de benefício e comissão-base de 500 pontos-base. Origem de site/anúncio não confirma compra sem corretor. As exclusões de corretores e indicações, confirmação de origem, consulta nova por turno, auditoria e encaminhamento de propostas permanecem.

Nenhum preço, composição ou status de unidade é regravado. São 12 unidades disponíveis na conferência de ativação, todas com reforço cadastrado. Unidades ocultas ou reservadas não entram em ofertas.

`npm run test:alma-payment-tables` verifica a razão, valor presente por pagamentos enumerados, datas, centavos, 4 tabelas e benefício direto, preservação da referência, separação Flow/Alma, consultas e auditoria, impressão, interface React e respostas da Nara com transporte simulado, sem chamadas externas.
