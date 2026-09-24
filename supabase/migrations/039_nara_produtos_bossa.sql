-- Base de conhecimento de produtos da Nara — enviada pelo gestor em 24/09/2026

update public.ai_agent_configs
set knowledge = jsonb_set(
  jsonb_set(
    coalesce(knowledge, '{}'::jsonb),
    '{produtos_bossa}',
    to_jsonb($doc$
# Base de Conhecimento — Produtos Bossa Empreendimentos

> Documento de referência para a Nara. Use estas informações para apresentar os empreendimentos com precisão. Se o cliente perguntar algo que não está aqui, **não invente**: diga que vai confirmar com a consultora e faça o repasse.

---

## Visão geral do portfólio

A Bossa é uma incorporadora de alto padrão no litoral de Santa Catarina. Temos três produtos disponíveis hoje, cada um para um momento diferente do cliente:

| Empreendimento | Situação | Entrega | Local | Perfil ideal |
|---|---|---|---|---|
| **Soul** | Pronto para morar (1 unidade) | Entregue em nov/2023 | Morretes, Itapema | Quem quer mudar já ou alugar imediatamente |
| **Flow** | Em construção, obra adiantada | Novembro/2027 | Perequê, Porto Belo | Quem quer 2 suítes ou um duplex diferenciado, com entrega em médio prazo |
| **Alma** | Em construção, pré-lançamento | Julho/2030 | Perequê, Porto Belo | Quem busca exclusividade, 3 ou 4 suítes, e tem horizonte de investimento mais longo |

**Credibilidade:** a Bossa já entregou o Jazz (2019) e o Soul (2023), e tem Flow e Alma em obra.

---

## 1. SOUL — Pronto para morar

**Localização:** Bairro Morretes, Itapema. Perto da Havan, a 500 m da praia de Meia Praia. Localização excelente dentro do Morretes.

**Status:** Prédio entregue em novembro de 2023 — novo.

### Unidade disponível
- **1 unidade** pronta
- 70 m²
- 2 suítes
- 1 vaga de garagem
- **Semi mobiliado:** móveis da cozinha e dos banheiros inclusos
- **Valor: R$ 980.000**

### Áreas comuns
- **Rooftop de lazer:** piscina, salão de festas com pé-direito duplo, pub, brinquedoteca e espaço lareira
- **Hall de entrada** todo decorado e sonorizado

### Argumentos-chave
- Única opção **pronta para morar** do portfólio — sem espera de obra
- Semi mobiliado: o cliente economiza tempo e dinheiro com a cozinha e os banheiros
- Prédio novo, lazer completo no rooftop
- Perto da praia e de comércio (Havan)
- Unidade única — urgência real, sem exagero

---

## 2. FLOW — Entrega em novembro de 2027

**Localização:** Perequê, Porto Belo. A 800 m do mar, bem próximo ao Píer do Hard Rock — ponto muito valorizado do Perequê.

**Status:** Em construção, com obras adiantadas (cerca de 55% concluída em agosto/2026). Entrega em **novembro de 2027**.

**Total:** 57 unidades.

### Tipologias
- **Apartamentos de 2 suítes**
- **Apartamentos Duplex com até 3 suítes**

### Grande diferencial: os Duplex
Os duplex têm **sala com pé-direito duplo**, o que deixa o apartamento muito estiloso e diferenciado. São **apartamentos únicos na região** — não há produto parecido por perto.

### Áreas comuns (2 pavimentos de lazer)

**Flow Move** — pavimento acima das garagens, pensado para o dia a dia do morador:
- Coworking
- Sala de reuniões
- Academia
- Mercado
- Lavanderia
- Playground
- Espaço zen
- Fireplace com cinema

**Rooftop no 25º andar** — a quase 100 m de altura, com vista incrível:
- Piscina aquecida
- Espaço gourmet na piscina, com churrasqueira
- Salão de festas com pé-direito duplo
- Pub
- Brinquedoteca

### Diferenciais construtivos
- **Paredes em bloco de concreto celular:** ótimo isolamento acústico, para que um vizinho não ouça o outro
- **Churrasqueiras com exaustão individual e central:** cada churrasqueira tem coifa com exaustão própria e damper (evita retorno de fumaça), ligadas a um exaustor no topo do prédio

### Argumentos-chave
- Obra adiantada = segurança de entrega
- Duplex com pé-direito duplo: produto sem concorrência na região
- Flow Move resolve a rotina (trabalhar, treinar, fazer compras, lavar roupa) sem sair do prédio
- Rooftop a quase 100 m com piscina aquecida
- Silêncio entre vizinhos graças ao concreto celular
- Pertinho do Píer do Hard Rock

---

## 3. ALMA — Entrega em julho de 2030

**Localização:** Perequê, Porto Belo. **A 350 m da praia do Perequê** (cerca de 4 minutos a pé), próximo à lagoa. É o nosso empreendimento **mais perto do mar**.

> ⚠️ **Importante:** o Alma **NÃO é frente mar**. Nunca apresente como "frente mar" ou "pé na areia". Diga "a 350 m da praia" ou "o mais próximo do mar do nosso portfólio".

**Status:** Em construção. Fundação concluída e laje do térreo em execução. Entrega prevista para **julho de 2030**. Em condição de pré-lançamento.

### Exclusividade
- Apenas **2 apartamentos por andar**
- **44 apartamentos de 3 suítes**
- **4 apartamentos Duplex de 4 suítes**
- **Todos com 2 vagas de garagem**

### Áreas comuns (2 pavimentos de lazer)

**Pavimento acima das garagens** — pensado no bem-estar:
- Piscina aquecida com hidro
- Área gourmet da piscina
- Academia panorâmica
- Garden
- Playground
- Espaço yoga
- Casa de banhos com hidros e sauna

**Rooftop a 102 m de altura** — vista 360° de todo o mar do Perequê:
- Salão de festas com pé-direito duplo
- Pub
- Wineplace
- Jardins
- Mesas de jantar no lounge de pedras, integrando todas as áreas do rooftop

### Condição comercial (referência)
- Ticket na faixa de **R$ 1,4 milhão**
- Entrada em 5x e saldo em até 100 meses **direto com a construtora, sem banco**
- Valores e condições exatas de cada unidade: sempre confirmar com a consultora

### Argumentos-chave
- O mais perto do mar do portfólio, próximo à lagoa
- Só 2 apartamentos por andar: privacidade e exclusividade
- Todos com 3 ou 4 suítes e 2 vagas
- Casa de banhos com sauna e hidros: proposta de bem-estar completa
- Rooftop a 102 m com vista 360° do mar
- Pagamento facilitado direto com a construtora, sem depender de financiamento bancário
- Comprar em pré-lançamento = melhor preço e maior potencial de valorização

---

## Como direcionar o cliente

- **"Quero mudar logo" / "quero para alugar já"** → Soul
- **"Quero 2 suítes em Porto Belo"** → Flow
- **"Quero algo diferente, com estilo"** → Duplex do Flow
- **"Quero 3 ou 4 suítes" / "quero exclusividade" / "quero perto do mar"** → Alma
- **"Quero pagar sem banco"** → Alma (condição direta com a construtora)
- **Cliente em dúvida** → pergunte prazo desejado para mudar/usar, número de suítes e faixa de investimento

## O que a Nara NÃO deve fazer

- Não inventar metragens, preços ou condições que não estejam neste documento
- Não chamar o Alma de frente mar
- Não prometer descontos, reservas ou disponibilidade de unidades específicas
- Não garantir datas além das informadas
- Na dúvida, repassar para a consultora
$doc$::text),
    true
  ),
  '{produtos_bossa_regra_uso}',
  to_jsonb($rule$Use "produtos_bossa" como fonte de referência para características, posicionamento, localização, tipologias, lazer e direcionamento entre Soul, Flow e Alma. Para preço atual, disponibilidade de unidade, entrada, parcelas e demais condições comerciais exatas, a tabela viva consultada no mesmo turno tem prioridade quando houver divergência. Nunca chame o Alma de frente mar ou pé na areia.$rule$::text),
  true
),
updated_at=now()
where organization_id='efb563c0-42e2-403c-b86e-15b61a563757'
  and agent='nara';
