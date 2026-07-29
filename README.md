# Bossa CRM — usuários, WhatsApp, IA e operação híbrida

Aplicação **Next.js 16 + Supabase** para a operação comercial da Bossa Empreendimentos, com:

- autenticação, convites e perfis `admin`, `comercial` e `viewer`;
- banco PostgreSQL com RLS por organização;
- pipelines de clientes e corretores;
- ficha unificada com WhatsApp, histórico, tarefas e próxima ação;
- importação XLSX do Kommo;
- movimentação em massa entre etapas da pipeline;
- dois canais da WhatsApp Cloud API;
- Nara para clientes e Plantão para corretores;
- OpenAI Responses API com modelo e fallback configuráveis;
- cache de prompt, compactação de conversas longas e custo registrado por lead;
- sistema híbrido: IA e equipe humana compartilham o histórico sem responder ao mesmo tempo;
- mudança automática de classificação, prioridade, etapa, notas, tarefas e passagem ao humano;
- SLA de passagem, resgate de leads esquecidos e reativação de leads futuros.

## 1. Requisitos

- Node.js 22+;
- Supabase;
- Vercel ou servidor compatível com Next.js;
- aplicativo Meta para a WhatsApp Business Platform;
- chave da API da OpenAI.

## 2. Banco e autenticação

Execute as migrações no SQL Editor do Supabase, em ordem:

```text
supabase/migrations/001_bossa_crm.sql
supabase/migrations/002_treinamento_nara_plantao.sql
supabase/migrations/003_arquivos_ia.sql
supabase/migrations/004_consumo_ia_gpt56.sql
supabase/migrations/005_sistema_hibrido_followup.sql
```

A migração `005`:

- converte as etapas antigas para os estados híbridos;
- cria tarefas e aceite formal de passagem;
- adiciona dono, backup, prioridade, próxima ação, prazo e reativação ao lead;
- adiciona a oferta da unidade pronta do Soul à base da Nara e do Plantão sem apagar os textos já personalizados.

Depois do deployment do código e da configuração do worker, execute:

```text
supabase/migrations/006_agendar_worker_followup.sql
```

Em **Authentication → URL Configuration**, configure o endereço de produção e as URLs de redirecionamento.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Variáveis principais:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_MODEL_FALLBACK=gpt-5.6-luna
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=2400
OPENAI_VERBOSITY=low
OPENAI_TIMEOUT_MS=25000

CRON_SECRET=
```

`SUPABASE_SECRET_KEY`, `OPENAI_API_KEY` e `CRON_SECRET` são variáveis somente do servidor e nunca podem usar o prefixo `NEXT_PUBLIC_`.

## 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## 5. Publicação na Vercel

1. Importe este repositório na Vercel.
2. Cadastre as variáveis de `.env.example`.
3. Faça o deployment.
4. Atualize `NEXT_PUBLIC_APP_URL` e as URLs permitidas no Supabase.

## 6. WhatsApp pela Meta

Configure no aplicativo Meta:

```env
NEXT_PUBLIC_META_APP_ID=
NEXT_PUBLIC_META_CONFIG_ID=
NEXT_PUBLIC_META_GRAPH_VERSION=v25.0
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v25.0
META_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64=
```

Webhook:

```text
https://SEU-DOMINIO/api/meta/whatsapp/webhook
```

Assine o campo `messages` no WhatsApp Business Account. Os tokens ficam criptografados com AES-256-GCM.

## 7. Funcionamento da IA

- toda mensagem recebida é analisada pela IA, inclusive quando um consultor é o dono do lead;
- quando a IA é dona, ela também responde pelo WhatsApp;
- quando o humano aceita a passagem, a IA fica em silêncio, mas continua atualizando classificação, resumo, prioridade, etapa, notas e tarefas;
- pedido de humano, ligação, visita, proposta, negociação, unidade específica ou corretor com cliente ativo gera passagem;
- classe A1 cria tarefa urgente e prazo curto;
- a ficha do lead mostra dono, backup, próxima ação, prazo e tarefas;
- falha total da IA cria alerta humano e envia mensagem neutra somente quando a IA era responsável pela resposta;
- conversas com mais de 25 mensagens são compactadas, preservando as 10 mais recentes;
- tokens, cache, modelo e custo estimado ficam registrados por lead.

Teste do modelo sem enviar mensagens reais:

```text
/treinamento/teste-gpt56
```

## 8. Estados híbridos

Clientes:

```text
Novo/Triagem → Qualificação Nara → Nutrição ativa → Passagem pendente
→ Humano ativo → Agendado → Pós-reunião → Proposta/Negociação
→ Futuro → Venda fechada ou Encerrado
```

Corretores usam a mesma estrutura, sem a etapa de venda fechada. O Plantão muda automaticamente o relacionamento conforme lê a conversa e identifica cliente ativo, visita, proposta ou negociação.

## 9. Worker de SLA e resgate

O endpoint protegido é:

```text
/api/automation/followup
```

Antes de executar `006_agendar_worker_followup.sql`:

1. Gere um valor forte para `CRON_SECRET` e cadastre-o na Vercel.
2. No Vault do Supabase, crie:
   - `bossa_crm_worker_url`: URL completa do endpoint;
   - `bossa_crm_cron_secret`: o mesmo valor de `CRON_SECRET`.
3. Execute a migração `006`.

O worker roda a cada cinco minutos e:

- marca tarefas vencidas;
- alerta passagens sem aceite;
- devolve à IA uma passagem abandonada;
- resgata leads humanos sem atividade por sete dias;
- reabre leads quando chega a data individual de reativação.

Nunca coloque o valor real de `CRON_SECRET` em SQL versionado ou no GitHub.

## 10. Limite do follow-up proativo

A automação de estados, tarefas e resgate funciona pelo CRM. Mensagens proativas de WhatsApp fora da janela de atendimento exigem templates aprovados na Meta. As réguas de 30, 60 e 90 dias devem ser ativadas somente depois de cadastrar esses templates, para evitar bloqueios ou mensagens recusadas.

## 11. O que ainda depende das contas da Bossa

- execução das migrações SQL;
- variáveis na Vercel;
- aplicativo, revisão e números na Meta;
- configuração do Vault e do worker;
- templates de WhatsApp para follow-ups fora da janela de atendimento.

Não coloque senhas ou chaves reais dentro do código ou do GitHub.
