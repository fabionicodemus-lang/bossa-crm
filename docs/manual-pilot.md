# Piloto comercial manual isolado

Modo explícito `manual-pilot`, independente do modo H2.3 `remote`. Não aprova V1 e não exige nem simula RPC v2, chave administrativa ou atestação externa. Todo build continua preso ao projeto/Preview/branch/SHA/origem; remover ou trocar variáveis no runtime não o converte em Production nem em outro modo.

## Escopo

Clientes e corretores (cadastro, consulta e edição humana), pipeline manual, oportunidades, participantes e interesses nos produtos existentes Flow/Alma, visitas/agenda interna, propostas/parcelas/status/recuperação e PDF em memória com sessão/RLS, histórico humano e indicadores disponíveis para as permissões humanas. Empreendimentos são somente consulta; não há criação de produtos nem seed remoto nesta etapa. Um catálogo vazio exige preparação fictícia separada pelo operador, sem uso de dados reais.

Sem Nara/Plantão, transferência automatizada, WhatsApp, Meta, Microsoft/Outlook, notificações automáticas, convites/e-mails, importação, Storage, Edge Functions, Realtime, jobs, filas ou configurações de automação. Contratos/recebimentos e reconciliações não são liberados por este modo. Não há fallback administrativo. O guard H2.2 do banco continua sendo a autoridade final para grants, RLS, atomicidade, idempotência e conflitos; nenhuma migração foi alterada.

## Variáveis mínimas: somente no Preview autorizado

| Variável | Valor |
|---|---|
| `BOSSA_HOMOLOGATION_MODE` | `manual-pilot` |
| `BOSSA_HOMOLOGATION_COMMIT` | SHA completo do código a publicar |
| `BOSSA_HOMOLOGATION_SUPABASE_URL` | `https://okhtfibuexfsgkobjxtu.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_URL` | Mesma URL |
| `BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY` | Chave pública `sb_publishable_` real desse projeto |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | A mesma chave pública |
| `FEATURE_DIRECT_WHATSAPP_CONNECTION` | `false` |
| `FEATURE_EMBEDDED_SIGNUP` | `false` |
| `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP` | `false` |

Variáveis efetivas de sistema Vercel obrigatórias: `VERCEL_ENV=preview`, `VERCEL_PROJECT_ID=prj_L89zRE7TKcC4ij14B5QyOa72XfPz`, `VERCEL_GIT_COMMIT_REF=feat/commercial-metrics-foundation`, SHA real em `VERCEL_GIT_COMMIT_SHA`, `VERCEL_DEPLOYMENT_ID` e `VERCEL_URL` imutável em `*.vercel.app`. Não fabricar esses valores para liberar uma configuração desconhecida. Os campos `NEXT_PUBLIC_BOSSA_HOMOLOGATION_*` são gerados pelo build; não configurá-los manualmente.

Não fornecer `service_role`, `SUPABASE_SECRET_KEY`, `BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY`, credenciais administrativas de teste, URL/senha de banco, token Vercel ou chaves de integrações ao processo da aplicação. Sua presença bloqueia o modo. A chave pública não é uma credencial administrativa. O modo H2.3 mantém suas variáveis e provas próprias; mudar entre os modos exige novo build coerente, sem remover sua proteção global.

Vercel Authentication deve continuar ativa para todos os deployments do projeto dedicado; o piloto não cria bypass ou link público. Nenhuma configuração remota/deployment é executada por estes testes.

## Fronteiras

- Rotas de páginas e métodos são listados explicitamente, incluindo login. Apenas `/login` é permitido para autenticação na aplicação; cadastro, recuperação e callbacks são bloqueados. No Supabase permitem-se password/refresh, getUser, logout e leitura do JWKS necessária à verificação JWT.
- O SDK valida a sessão; a aplicação rejeita claims fora do emissor autorizado, usuários anônimos e e-mails fora de `@bossa-homolog.invalid`. As permissões vêm das memberships reais e RLS, nunca de `user_metadata`. A decodificação do filtro de egress só pode rejeitar; não valida nem concede confiança a JWTs.
- Requisições REST exigem JWT humano; o PostgREST valida a assinatura e RLS. Apenas chave pública no `apikey`; o Bearer público redundante é removido, o JWT humano é preservado. Sem JWT, uma chave pública não libera REST comercial.
- APIs, Server Actions, RPCs, tabelas, métodos e saídas de rede têm allowlists separadas. Ações fora do escopo são recusadas mesmo se invocadas por um ID de Server Action em página permitida. Sockets raw são bloqueados fora do transporte do fetch validado; esse transporte só alcança o Supabase de teste com TLS validado. CSP bloqueia os demais destinos no navegador.
- Sessão/organização/papel não são atestados por `/api/homologation/preflight`: nesse modo a rota informa somente configuração, sem `writesAllowed=true` ou aprovação H2.3. Antes de usar o Supabase, o navegador exige essa configuração disponível e vinculada ao projeto/SHA/origem compilados, sem chamar RPC v2. Cada operação exige sessão e RLS.
- Credenciais administrativas nunca chegam ao cliente; construir `createAdminClient` no piloto lança erro antes de qualquer fallback. Visitas mantêm RPC de criação e comparação de timestamp na edição; propostas mantêm RPCs atômicas e recuperação.

Essas barreiras controlam a aplicação revisada. Não substituem as guardas H2.2 já aprovadas nem contêm um administrador que altere código/infraestrutura.

## Contas privadas para a próxima validação real

As sete contas já existem. Não criar usuários, inventar senhas ou redefini-las. Um operador deve obter as senhas existentes por canal seguro e salvar um array JSON em arquivo **fora do repositório**, por exemplo `/workspace/private/manual-pilot/accounts.json`. Cada objeto deve conter `userId`, `email`, `password`, `organizationId`, `role`. Os IDs/e-mails/papéis são os reais dos usuários fictícios aprovados; as duas organizações devem incluir admin/comercial/viewer. Não colocar esses dados no código, `.env` versionado, chat, logs ou artefatos de CI.

Preparar somente diretório/permissões; o arquivo será preenchido pelo canal privado, sem valores em comandos:

```sh
install -d -m 0700 /workspace/private/manual-pilot
# O operador entrega accounts.json pelo armazenamento privado, sem imprimir seu conteúdo.
chmod 0600 /workspace/private/manual-pilot/accounts.json
BOSSA_MANUAL_PILOT_ACCOUNTS_FILE=/workspace/private/manual-pilot/accounts.json npm run manual-pilot:check-accounts
```

Essa variável é somente do processo de teste, nunca do Vercel/app. O validador rejeita symlinks, arquivos dentro de Git, permissões abertas e formato incompleto; não autentica, não mostra senhas e não aprova os cenários. Sem arquivo retorna código 2 e PENDENTES. A execução real será uma etapa separada com origem/SHA autorizados, acesso Vercel Authentication e credenciais disponíveis nesse armazenamento privado.

A aceitação real cobre oito cenários: login/sessão/logout; cadastro/edição de cliente; corretor/pipeline; oportunidade/participantes/interesses Flow e Alma; agenda/visitas/conflitos; propostas/parcelas/status/409/idempotência/recuperação; viewer sem escrita; organização estrangeira/sessão inválida e ausência de efeitos externos. Após as reprovações informadas pelo Work, os cenários **3, 5 e 6 exigem nova validação real**. Testes locais não reclassificam os demais resultados do Work nem aprovam V1.

## Correções dos cenários 3, 5 e 6

- Pipeline: o PATCH humano preserva `automation_paused` já verdadeiro, recusa estado inseguro e utiliza somente colunas permitidas. O trigger existente `leads_log_stage_change` registra ator/origem/destino na mesma transação. Não há INSERT adicional em `activities`, RPC nova, grant ou alteração de migração. Comparação de etapa/revisão e RLS impedem sobrescrita concorrente; repetição da mesma etapa não duplica histórico. A movimentação em massa utiliza o mesmo trigger por PATCH, mantendo os lotes existentes.
- Agenda: o formulário pesquisa cliente/corretor, preserva o vínculo ao editar e permite concluir/cancelar o compromisso por PATCH. A API mantém responsáveis, referências da organização, conflitos e proteção do histórico comercial; o piloto não oferece exclusão física.
- PDF: somente GET autenticado, com sessão/RLS e escopo de organização nas consultas de proposta, produto, unidade, contato e parcelas. O logo institucional é local; Storage e download do logo do empreendimento continuam bloqueados. Totais inconsistentes retornam 409.
- Proposta/etapa: proposta, parcelas, histórico financeiro e recibo continuam atômicos na RPC existente. A movimentação do lead é uma operação posterior, com seu próprio histórico transacional, não uma transação distribuída. Falha nessa etapa gera aviso sem refazer a proposta. Repetições manuais e retomadas explícitas conferem a proposta salva e repetem a etapa de modo idempotente, sem reabrir contato encerrado. Consultar uma recuperação já confirmada continua sem efeitos de escrita.

## Testes locais e CI

`npm run test:manual-pilot` verifica políticas, SDK, proxy, ações e egress com adaptadores. `npm run test:manual-pilot:compiled` compila o Next e percorre páginas no Chromium com sessões/REST **locais simulados**, sem criar contas ou chamar o projeto remoto. Ele não comprova Auth/RLS gerenciados nem converte os oito cenários em aprovados. As suítes SQL comerciais existentes exercitam RLS, viewer, organizações, conflitos, idempotência e recuperação em bancos descartáveis reais/PGlite. Lint, typecheck, build e CI continuam obrigatórios.

No Cloud com Chromium instalado: `BOSSA_CHROMIUM_PATH=/usr/bin/chromium npm run test:manual-pilot:compiled`. O CI instala o Chromium do Playwright. Não executar outro build ou servidor na porta 3003 simultaneamente.

Validação local desta implementação: regressões comerciais, integridade/reconciliação, source requests/recuperação, status/409, agenda, concorrência PostgreSQL, isolamento H2.3 e oito grupos de restrições manual-pilot passaram. Lint (sem erros, avisos preexistentes), typecheck e build passaram. Os dois modos também passaram no Next compilado/Chromium com adaptadores locais separados. Isso não é evidência de Auth/RLS gerenciados nem aprovação dos oito cenários reais.
