# Homologação Vercel independente: contrato de segurança

Código preparado, ambiente ainda **não homologado**. Nenhum projeto foi conectado ao GitHub, nenhum deployment foi criado e nenhum banco foi alterado nesta entrega. Funcional **12/24**, preparação V1 **12/16**, aceite humano **0/8**.

## Chamadores manuais H2.2B

O cadastro do Pipeline usa o cliente da sessão e as colunas já autorizadas pelo banco. Em homologação, cria somente contatos com IA desabilitada, automação pausada e proprietário humano; não há fallback administrativo nem nova RPC de cadastro. A ficha manual dispensa a consulta administrativa de conexões WhatsApp. A disponibilidade da agenda usa a sessão e o calendário interno; criação mantém preparação/replay/RPC atômica, edição mantém o compare-and-set de `updated_at`. Nenhum desses caminhos consulta ou sincroniza Microsoft na homologação. Eventos de IA/importados não entram na edição manual e a exclusão fica bloqueada, preservando o cancelamento pelo PATCH. Fora da homologação, os caminhos anteriores são preservados.

O mapper distingue conflito explícito `COMMERCIAL_SOURCE_CHANGED` de erro de transporte/serialização genérico. Os testes locais cobrem HTTP 409 da rota de recuperação para as duas RPCs, tanto com `40001` quanto com `PT409`, sem alterar registros financeiros nem duplicar atividades. Isso não comprova HTTP 409 do PostgREST remoto: o SQLSTATE legado `40001` pode provocar retries antes de chegar ao chamador. O candidato independente `supabase/compatibility/20261022_rpc_http_conflicts.sql` permanece sem aplicação remota. Sua revisão opcional contra catálogo/guarda H2.2 usa `BOSSA_H22_PRIVATE_PACKAGE` nos testes `check-http-conflict-compatibility.mjs` e `check-manual-callers.mjs`; o pacote e os resultados detalhados ficam fora de Git/CI. Homologação real, eventual aplicação SQL e evidência HTTP remota exigem etapa própria. Os indicadores e aceites acima não avançam por testes locais.

## Identidades e configuração

Apenas `VERCEL_ENV=preview`, projeto `prj_L89zRE7TKcC4ij14B5QyOa72XfPz`, branch `feat/commercial-metrics-foundation` e Supabase `okhtfibuexfsgkobjxtu` podem solicitar o modo remoto. O projeto original `bossa-crm`, outros projetos/branches, Supabase de produção e origens desconhecidas continuam bloqueados. Production do projeto original mantém seu comportamento anterior. O laboratório local e seu contrato v1 são preservados.

Configuração exclusiva do novo projeto, fornecida privadamente antes do build:

| Campo | Exigência |
| --- | --- |
| `BOSSA_HOMOLOGATION_MODE` | `remote` |
| `BOSSA_HOMOLOGATION_ENVIRONMENT_ID` | UUID dedicado e estável do ambiente fictício, também presente na RPC |
| `BOSSA_HOMOLOGATION_COMMIT` | SHA completo do código, igual a `VERCEL_GIT_COMMIT_SHA` |
| `BOSSA_HOMOLOGATION_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_URL` | Ambos exatamente `https://okhtfibuexfsgkobjxtu.supabase.co` |
| `BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Mesma chave pública dedicada ao teste |
| `BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY` | Chave administrativa exclusiva do teste, somente servidor |
| `BOSSA_HOMOLOGATION_ATTESTATION_PUBLIC_KEY` | Chave pública Ed25519, DER/SPKI em base64, aprovada por revisão independente |
| Flags | `FEATURE_DIRECT_WHATSAPP_CONNECTION=false`, `FEATURE_EMBEDDED_SIGNUP=false`, `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false` |

As identidades `VERCEL_PROJECT_ID`, `VERCEL_DEPLOYMENT_ID`, `VERCEL_URL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` e `VERCEL_GIT_COMMIT_REF` devem ser as variáveis de sistema efetivas da Vercel. Não criar substitutos para fazê-las passar. A origem aceita é a URL HTTPS imutável desse deployment em `*.vercel.app`; aliases/custom domains não são liberados nesta revisão.

`next.config.ts` fixa no build as identidades públicas, o SHA, a origem e a chave pública do verificador (`BOSSA_HOMOLOGATION_BUILD_ATTESTATION_KEY`). Não configurar manualmente os campos gerados `NEXT_PUBLIC_BOSSA_HOMOLOGATION_*`. Alterar o runtime não troca essas identidades compiladas. Configuração não autorizada recebe URL/chave pública Supabase vazias. Nunca entra chave administrativa no bundle.

Remover do projeto independente `SUPABASE_SECRET_KEY` herdada e configurações OpenAI, Nara, WhatsApp, Meta, Microsoft/Outlook, cron, SMTP, Resend, SendGrid, Mailgun e webhooks. A presença dos nomes proibidos também bloqueia o pré-voo. Isso não altera variáveis do projeto original.

## Duas provas obrigatórias

Uma variável de modo, as 77 tabelas ou uma resposta `{ok:true}` não autorizam gravações. Com configuração válida e guard de processo instalado, a única chamada anterior à prova é a RPC **somente leitura** `public.bossa_homologation_preflight()` do Supabase autorizado, com corpo `{}`, sem redirecionamento. Não há consulta de descoberta à produção.

O contrato remoto **v2** dessa RPC precisa ser preparado/revisado separadamente no banco de teste. Este commit não cria nem altera a RPC, Auth, usuários ou guardas SQL. Ausência, v1, erro, campos ausentes e qualquer teste falso recusam gravações. Retorno obrigatório:

| Campo | Verificação exigida no produtor da prova |
| --- | --- |
| `contractVersion` | `2` |
| `environmentId`, `supabaseProjectRef` | Identidade persistida do banco, UUID dedicado e `okhtfibuexfsgkobjxtu` |
| `checkedAt` | Horário do servidor, validade máxima de 15 segundos; tolerância futura de 5 segundos |
| `schemaReady` | Estrutura comercial, dependências e versões esperadas verificadas, não apenas contagem de tabelas |
| `syntheticUsersOnly`, `requiredRolesReady` | Usuários exclusivamente fictícios e administrador/comercial/visualizador autenticáveis e vinculados às organizações de teste |
| `permissionsSafe` | Grants, RLS, funções privilegiadas e proprietário/search path/EXECUTE da própria RPC conferidos contra a referência revisada |
| `guardsIntact`, `serviceRoleGuardsIntact` | Fingerprints e estado das guardas que impedem efeitos externos, inclusive bypass de RLS/`service_role` |
| `zeroExternalEffects`, `authEmailBlocked` | Filas/provedores/automação bloqueados, sem efeitos externos; complementar com auditoria da plataforma |
| `platformAttestation` | Envelope Ed25519 descrito abaixo |

Todos os campos booleanos exigem `true` explícito. Eles precisam resultar de verificações positivas recentes; **não substituir verificações por constantes**. Manter a RPC somente leitura, search path fixo, nomes qualificados, proprietário limitado e EXECUTE somente para `service_role`, sem expor Auth/Vault. As provas SQL privadas e catálogos continuam fora do repositório público; as 13 migrações comerciais permanecem intactas.

A segunda prova é assinada **fora** da aplicação e do banco por quem auditou a plataforma. A aplicação recebe somente a chave pública; jamais recebe a chave privada de assinatura. O banco armazena/retorna o envelope, mas não pode produzi-lo por conta própria. Isso permite auditar um deployment inicialmente bloqueado e depois registrar a evidência pelo canal HTTPS administrativo de teste, sem mudar variáveis/recriar o deployment.

Formato de `platformAttestation`: `{payload, signature}`, ambos base64url. `signature` é a assinatura Ed25519 dos bytes UTF-8 originais do JSON de `payload`, sem recodificar/canonicalizar depois da assinatura. Payload obrigatório:

```json
{
  "contractVersion": 1,
  "environmentId": "UUID_DO_AMBIENTE_FICTICIO",
  "vercelProjectId": "prj_L89zRE7TKcC4ij14B5QyOa72XfPz",
  "deploymentId": "dpl_IDENTIDADE_REAL",
  "deploymentOrigin": "https://URL_IMUTAVEL_REAL.vercel.app",
  "supabaseProjectRef": "okhtfibuexfsgkobjxtu",
  "commit": "SHA_COMPLETO_EXATO",
  "issuedAt": "DATA_UTC_DA_AUDITORIA",
  "expiresAt": "DATA_UTC_DE_EXPIRACAO",
  "evidenceSha256": "HASH_SHA256_DO_RELATORIO_PRIVADO",
  "checks": {
    "networkEgressRestricted": true,
    "externalIntegrationsDisabled": true,
    "cronDisabled": true,
    "webhooksDisabled": true,
    "authEmailDisabled": true,
    "functionsDisabled": true,
    "storageEffectsDisabled": true
  }
}
```

Identidades devem coincidir com o build/runtime. A validade não pode exceder 24 horas; recibos expirados, adulterados, de outro deployment ou com campos incompletos são recusados a cada acesso. Após mudanças de infraestrutura, revogar a prova no banco e refazer a auditoria; a assinatura não detecta sozinha mudanças remotas posteriores. Restringir acesso à configuração, guardar a chave privada offline e estabelecer revogação/renovação são condições operacionais obrigatórias. Assinar sem verificar não é comprovação.

## Contenção e limites

O proxy exige prova para páginas, GETs, server actions e APIs. APIs de Nara, IA, handoff automático, WhatsApp, Meta, Outlook, webhooks, cron, convites/e-mails e automações não pertencem à lista permitida. O cliente administrativo tem o mesmo pré-voo e escopo de rede; não há fallback administrativo.

O guard de Node instalado pela instrumentação restringe `fetch` ao Supabase de teste, impõe pré-voo antes das operações e recusa redirecionamentos. HTTP/HTTPS diretos são recusados; conexões TCP/TLS só podem alcançar o host TLS permitido na porta 443, sem Unix sockets, IP arbitrário ou TLS sem verificação. REST possui lista explícita de tabelas/RPCs humanas; Auth permite apenas login por senha, refresh, leitura de usuário e logout. Auth administrativo, OTP, cadastro, recuperação, alteração de e-mail, Storage e Edge Functions ficam bloqueados inclusive com `service_role`. Consultas de tabelas desconhecidas falham por padrão; revisar qualquer necessidade adicional antes de ampliar a lista.

CSP limita o navegador à própria origem e aos caminhos REST/login/usuário/logout do Supabase permitido, bloqueando também chamadas diretas de recuperação de senha fora do SDK, sem WebSocket remoto. Realtime, uploads/downloads Storage e funções administrativas fora da jornada não são liberados. O laboratório mantém seu WebSocket loopback. SDK, proxy e guard não substituem RLS nem contêm um administrador/código hostil. Instâncias Edge, workers externos, jobs Supabase/Vercel, hooks Auth, Database Webhooks e triggers precisam de evidência independente; restaurar tabelas não desativa esses serviços automaticamente.

## Critérios para autorizar somente um deployment de homologação

1. Revisar este commit e validar o CI no SHA exato após publicação autorizada. Nenhum CI remoto é presumido aprovado.
2. Conferir pela plataforma o ID do projeto independente, variáveis de sistema e escopos; manter o projeto original/Production intactos. Confirmar credenciais exclusivas, usuários fictícios e a RPC v2 com guardas efetivas e ACL mínimo.
3. Preparar o build com os valores dedicados e chave pública revisada. Autorizar separadamente a conexão ao GitHub e o deployment **somente Preview**, ainda bloqueado e com acesso restrito à equipe. Esta tarefa não fornece essa autorização.
4. Auditar o deployment real bloqueado, todos os runtimes/consumidores, cron, webhooks, Auth/e-mail, funções, Storage e bloqueios de rede; comprovar que credenciais e produtores de produção não foram herdados. Se um controle não puder ser comprovado, não assinar/liberar a prova.
5. Registrar privadamente a prova assinada para aquele deployment no retorno da RPC de teste; nunca em Git/artefato público. Validar o pré-voo e os testes negativos contra o deployment exato. Expirar/revogar a prova se qualquer controle falhar.
6. Somente com pré-voo positivo e aprovação operacional explícita, autorizar separadamente os oito testes humanos com dados fictícios. `humanAcceptanceAllowed` permanece `false`: o código não concede aprovação operacional.

Comandos de verificação (o segundo é futuro e somente leitura, após existir deployment autorizado):

```sh
npm run test:homologation-isolation
BOSSA_EXPECTED_COMMIT=SHA_COMPLETO BOSSA_HOMOLOGATION_PREVIEW_ORIGIN=https://DEPLOYMENT_AUTORIZADO.vercel.app npm run homologation:preflight -- --remote
```

Não há destino remoto padrão no CLI. `--local-automated` mantém o laboratório; omitir o modo, apontar para a prévia original ou receber prova inconsistente falha.

## Validação técnica desta revisão

`npm run test:homologation-isolation` preserva os 12 grupos locais e acrescenta 12 grupos remotos com transportes fictícios: SDKs reais administrativo/usuário, proxy, adaptador do navegador, identidade compilada, assinatura, respostas incompletas, CLI, instrumentação e sockets. Não usa Supabase/Vercel reais.

`npm run test:homologation-compiled` compila o Next no modo remoto fictício, inicia somente loopback, substitui o transporte da RPC por fixture assinada efêmera e verifica HTTP/CSP e revogação. Chromium hidrata o formulário real, percorre SDK → pré-voo → resposta Auth simulada e verifica bloqueio CSP de destino externo e recuperação direta. Não autentica usuários reais nem executa os oito testes humanos. Exige Node 22, Chromium e módulo Playwright disponível; se não estiverem instalados, falha explicitamente. Pode-se selecionar os caminhos instalados sem adicionar dependências ao produto:

```sh
BOSSA_PLAYWRIGHT_MODULE=/caminho/instalado/playwright BOSSA_CHROMIUM_PATH=/caminho/instalado/chromium npm run test:homologation-compiled
```

O teste usa `.next`, porta loopback 3002 e diretório temporário próprio; não executar simultaneamente com outro build/servidor nessa porta. Os resultados com adapters, o HTML/Chromium compilado local e a homologação do deployment real são evidências distintas. Os testes reais de configuração, JWT/Auth, RLS/guardas remotas e os oito aceites humanos continuam pendentes.

Validação local em 24/10/2026: os 24 grupos de isolamento (12 locais preservados + 12 remotos), 14 suítes de regressão comercial/integridade/reconciliação/ações/status/recuperação/pedidos de origem/produtor IA, typecheck, lint e build passaram. O teste compilado passou em HTTP e Chromium com fixtures, recusou alias desconhecido, permissões revogadas e assinatura adulterada, e verificou 52 chunks de navegador sem a chave administrativa fictícia. Houve somente transporte/identidades/credenciais sintéticos; isso não comprova a configuração da Vercel/Supabase reais nem CI remoto. Nenhuma das 13 migrações foi alterada.
