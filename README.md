# Bossa CRM — versão real com usuários, banco e WhatsApp

Este projeto substitui o protótipo HTML por uma aplicação **Next.js 16 + Supabase** com:

- cadastro, login, logout e recuperação de senha;
- primeiro usuário como administrador da empresa;
- convites por e-mail para novos usuários;
- funções `admin`, `comercial` e `viewer`;
- dados persistidos no PostgreSQL, não no `localStorage`;
- RLS por empresa para impedir que usuários de outra conta vejam os dados;
- pipelines de clientes e corretores com drag-and-drop;
- ficha única para cliente e corretor;
- histórico, anotações e mensagens persistentes;
- importador XLSX compatível com a exportação do Kommo;
- tela Atendimento IA contendo somente clientes na etapa `IA Atendendo`;
- bloqueio automático da IA fora dessa etapa e para clientes fechados;
- Meta Embedded Signup para conectar os dois números do WhatsApp;
- webhook, envio de mensagens e armazenamento do histórico;
- resposta automática opcional pela API da Anthropic.

## 1. Requisitos

- Node.js 22+
- uma conta Supabase;
- uma conta Vercel ou outro servidor compatível com Next.js;
- para WhatsApp: aplicativo da Meta configurado para WhatsApp Business Platform;
- para a Nara responder: chave da Anthropic.

## 2. Banco e autenticação

1. Crie um projeto novo no Supabase.
2. Abra **SQL Editor**.
3. Execute todo o arquivo:

```text
supabase/migrations/001_bossa_crm.sql
```

4. Em **Authentication > URL Configuration**, defina:
   - Site URL local: `http://localhost:3000`
   - URL de produção: o domínio do CRM
   - Redirect URLs: `http://localhost:3000/**` e `https://SEU-DOMINIO/**`
5. Para testes rápidos, você pode desabilitar confirmação de e-mail. Em produção, é melhor mantê-la habilitada.

## 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

No Supabase, obtenha os valores no painel **Connect / API Keys**.

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publicável.
- `SUPABASE_SECRET_KEY`: chave secreta, usada somente no servidor.
- `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP`: deixe `true` para criar o primeiro administrador; depois altere para `false` para aceitar novos usuários somente por convite.

A chave secreta **nunca** pode ser exposta com prefixo `NEXT_PUBLIC_`.

Gere a chave de criptografia do token do WhatsApp:

```bash
openssl rand -base64 32
```

## 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

1. Clique em **Criar usuário**.
2. Confirme o e-mail, caso necessário.
3. No onboarding, crie **Bossa Empreendimentos**.
4. Importe a planilha do Kommo em **Importar XLSX**.
5. Em **Usuários**, convide o restante do time.
6. Depois do primeiro administrador, defina `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false` no ambiente de produção.

## 5. Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub (público ou privado).
2. Importe o repositório na Vercel.
3. Cadastre todas as variáveis de `.env.example` em **Project Settings > Environment Variables**.
4. Faça o deploy.
5. Atualize `NEXT_PUBLIC_APP_URL` e as URLs permitidas no Supabase.

## 6. WhatsApp pela Meta

O frontend usa o Embedded Signup. Configure no aplicativo da Meta:

- `NEXT_PUBLIC_META_APP_ID`
- `NEXT_PUBLIC_META_CONFIG_ID`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION`
- `META_WEBHOOK_VERIFY_TOKEN`

Webhook de produção:

```text
https://SEU-DOMINIO/api/meta/whatsapp/webhook
```

Assine o campo `messages` no WhatsApp Business Account.

Os tokens são criptografados com AES-256-GCM antes de serem gravados. A tabela de conexões não possui acesso direto para usuários autenticados; somente o backend com a Secret Key consegue ler o token.

## 7. Atendimento por IA

Preencha:

```env
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Regras implementadas:

- cliente novo recebido pelo canal de clientes entra em `IA Atendendo`;
- a Nara só responde quando `ai_enabled=true`;
- ao sair da etapa `IA Atendendo`, a IA é pausada;
- cliente fechado nunca é atendido automaticamente;
- ao clicar em **Assumir conversa**, o envio humano é liberado;
- mensagens da IA e do comercial ficam no mesmo histórico.

## 8. O que ainda depende das suas contas

O código está pronto, mas a publicação real exige credenciais que só o administrador da Bossa pode fornecer:

- projeto e chaves Supabase;
- domínio/Vercel;
- aplicativo, Configuration ID e revisão da Meta;
- chave Anthropic.

Não coloque senhas ou chaves reais dentro do código ou do GitHub.
