# Bossa CRM — usuários, WhatsApp, IA e operação híbrida

Aplicação **Next.js 16 + TypeScript + Supabase** para a operação comercial da Bossa Empreendimentos, com:

- autenticação, convites e perfis `admin`, `comercial` e `viewer`;
- banco PostgreSQL com RLS por organização;
- pipelines de clientes e corretores;
- ficha unificada com WhatsApp, histórico, tarefas e próxima ação;
- dois canais próprios da WhatsApp Cloud API;
- Nara para clientes e Plantão para corretores;
- modelos aprovados e Transmissões;
- operação híbrida entre IA e equipe humana;
- SLA de passagem, resgate de leads e reativação de contatos.

## 1. Requisitos

- Node.js 22+;
- Supabase;
- Vercel ou servidor compatível com Next.js;
- aplicativo Meta com produto WhatsApp;
- WABA e números próprios da Bossa;
- token permanente de Usuário do Sistema da Meta;
- chave da API da OpenAI.

## 2. Banco e autenticação

Execute os arquivos de `supabase/migrations` no SQL Editor do Supabase em ordem numérica.

Para a arquitetura **Desenvolvedor Direto**, as migrações específicas são:

```text
supabase/migrations/012_whatsapp_desenvolvedor_direto.sql
supabase/migrations/013_agendar_worker_whatsapp.sql
```

A migração `012` é não destrutiva. Ela cria a estrutura neutra de canais, conversas, mensagens técnicas e eventos de webhook, mantendo `whatsapp_connections` e `messages` durante a transição.

A migração `013` deve ser executada depois do deployment e da configuração do Vault. Ela mantém os totais de entrega das Transmissões atualizados e agenda a recuperação dos eventos de webhook a cada cinco minutos.

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

META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64=
FEATURE_EMBEDDED_SIGNUP=false

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_MODEL_FALLBACK=gpt-5.6-luna
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=2400
OPENAI_VERBOSITY=low
OPENAI_TIMEOUT_MS=25000

CRON_SECRET=
```

`SUPABASE_SECRET_KEY`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TOKEN_ENCRYPTION_KEY_BASE64`, `OPENAI_API_KEY` e `CRON_SECRET` são variáveis exclusivas do servidor e nunca podem usar o prefixo `NEXT_PUBLIC_`.

## 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

Validações do projeto:

```bash
npm run typecheck
npm run build
```

## 5. Publicação na Vercel

1. Importe este repositório na Vercel.
2. Cadastre as variáveis de `.env.example`.
3. Execute a migração `012` no Supabase antes de ativar o novo webhook em produção.
4. Faça o deployment.
5. Atualize `NEXT_PUBLIC_APP_URL` e as URLs permitidas no Supabase.
6. Configure o Vault e execute a migração `013`.

## 6. WhatsApp pela Meta — Desenvolvedor Direto

A Fase 1 usa:

- uma WABA da Bossa;
- um aplicativo Meta;
- dois números próprios: clientes e corretores;
- um token de Usuário do Sistema;
- um webhook único;
- provedor `meta_cloud`.

Não há Cadastro Incorporado, BSP ou Coexistência nesta fase. Os números são API-only e o atendimento humano ocorre pelo CRM.

Webhook:

```text
https://SEU-DOMINIO/api/meta/whatsapp/webhook
```

No painel da Meta:

1. informe essa URL de callback;
2. use o mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`;
3. assine o campo `messages`;
4. conceda ao Usuário do Sistema acesso à WABA e aos números;
5. gere um token com as permissões da WhatsApp Business Platform.

Na tela **Configurações → Canais WhatsApp**:

1. configure o canal de clientes;
2. informe rótulo, WABA ID, Phone Number ID e token;
3. teste e salve;
4. registre o número com o PIN de seis dígitos;
5. repita para o canal de corretores.

O token é criptografado com AES-256-GCM. O PIN original não é armazenado: o CRM guarda somente um hash para auditoria. Guarde o PIN real no gerenciador de senhas da Bossa.

## 7. Webhook e processamento

O webhook:

- lê o corpo bruto antes de converter o JSON;
- valida `X-Hub-Signature-256` com `META_APP_SECRET`;
- roteia exclusivamente por `metadata.phone_number_id`;
- grava o evento bruto;
- responde 200 rapidamente;
- processa mensagens e status depois da resposta;
- recupera eventos pendentes pelo worker;
- ignora mensagens duplicadas pelo `wamid`;
- atualiza `sent`, `delivered`, `read` e `failed` na mensagem existente.

Eventos com Phone Number ID desconhecido são registrados e encerrados sem criar lead ou conversa.

## 8. Janela de 24 horas

Cada mensagem recebida atualiza:

```text
last_inbound_at
window_expires_at
```

Fora da janela, texto livre fica bloqueado para o consultor e para a Nara ou Plantão:

```text
Fora da janela de 24h — use um modelo aprovado.
```

Templates aprovados continuam disponíveis pelas Transmissões.

## 9. Categorias e acompanhamento de custo

As mensagens enviadas são classificadas como:

```text
service
marketing
utility
authentication
```

A visão `whatsapp_monthly_message_counts` consolida a quantidade mensal por canal e categoria. A tela de Canais exibe a contagem do mês atual.

## 10. Worker do WhatsApp

Endpoint protegido:

```text
/api/automation/whatsapp-events
```

Antes da migração `013`:

1. gere um valor forte para `CRON_SECRET` e cadastre-o na Vercel;
2. no Vault do Supabase, crie:
   - `bossa_crm_whatsapp_worker_url`: URL completa do endpoint;
   - `bossa_crm_cron_secret`: o mesmo valor de `CRON_SECRET`;
3. execute `013_agendar_worker_whatsapp.sql`.

O worker roda a cada cinco minutos e recupera pequenos lotes de eventos que não foram concluídos no processamento imediato.

## 11. Embedded Signup legado

O código foi preservado para a Fase 2 e está protegido por:

```env
FEATURE_EMBEDDED_SIGNUP=false
```

Mantenha a flag desligada na operação atual. As variáveis `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID` e `NEXT_PUBLIC_META_GRAPH_VERSION` são necessárias apenas quando essa funcionalidade for reativada.

## 12. Funcionamento da IA

- toda mensagem recebida pode ser analisada pela IA;
- Nara atende clientes e Plantão atende corretores conforme o papel do canal;
- quando o humano aceita a passagem, a IA fica em silêncio, mas continua analisando;
- pedido de humano, ligação, visita, proposta ou negociação pode gerar passagem;
- falha total da IA cria alerta humano;
- conversas longas são compactadas;
- tokens, cache, modelo e custo estimado ficam registrados por lead.

Teste do modelo sem enviar mensagens reais:

```text
/treinamento/teste-gpt56
```

## 13. O que depende das contas da Bossa

- execução das migrações SQL;
- variáveis na Vercel;
- WABA, aplicativo e dois números no painel da Meta;
- token do Usuário do Sistema;
- callback e assinatura do webhook;
- registro de cada número com PIN;
- configuração do Vault e do worker;
- templates aprovados para mensagens fora da janela.

Nunca coloque tokens, PINs, senhas ou chaves reais dentro do código ou do GitHub.
