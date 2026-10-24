# Prévia de homologação: bloqueio obrigatório

**Situação: suporte remoto preparado; prévia gerenciada ainda não homologada.** Checklist funcional **12/24**; preparação V1 **12/16**. Os oito testes de aceite humano continuam pendentes. O laboratório local com dados fictícios permite testes automatizados; não é a prévia pública, nem aprovação operacional do piloto.

## Proteção implementada

Todo build `VERCEL_ENV=preview` recebe a proteção, sem depender de uma opção voluntária. O modo remoto exige o projeto Vercel independente autorizado, identidades fixadas no build, prova recente do banco e atestação externa assinada para o deployment exato. Mudar `BOSSA_HOMOLOGATION_MODE` não autoriza gravações. Contrato, configurações e critérios de deployment estão em [Homologação remota](commercial-preview-remote.md). A prévia original continua bloqueada.

O projeto Supabase de produção é uma referência pública de bloqueio. A validação ocorre antes dos clientes e de qualquer requisição; não se consulta produção para descobrir se ela é segura. URL/chave pública herdadas não entram nos bundles Preview. Nenhuma configuração de Production foi alterada.

O proxy fica em `src/proxy.ts`, ao lado de `src/app`, para ser incluído pelo Next. A localização anterior na raiz não era executada pelo build. A proteção cobre também métodos GET, POST de server actions e caminhos com extensões. APIs têm lista de permissão explícita; automações, Nara, envios, Meta, Microsoft, callbacks, recuperação de senha/convites e handoff automático ficam bloqueados. O percurso de aceite não deve tentar habilitar IA ou envios para contornar esses bloqueios.

Clientes Supabase do servidor/administrativo e o adaptador do navegador exigem pré-voo. Mesmo acessos diretos pelo navegador devem ser contidos pelas políticas e guardas do banco. O laboratório usa preloader de rede obrigatório (fetch/HTTP/TLS/sockets), CSP no navegador, gateway fixo e rede Docker interna. O guard não é uma sandbox para código hostil ou para o administrador do banco.

## Contrato do laboratório local

Somente fora da Vercel: `BOSSA_HOMOLOGATION_MODE=local`; banco/gateway exclusivamente `http://127.0.0.1:54521`; aplicação exclusivamente loopback, porta 3001. Exigem-se identidade UUID, SHA completo, chaves **fictícias** dedicadas, igualdade das variáveis públicas com o laboratório e ausência da chave administrativa herdada. Variáveis:

- `BOSSA_HOMOLOGATION_ENVIRONMENT_ID`, `BOSSA_HOMOLOGATION_COMMIT`.
- `BOSSA_HOMOLOGATION_SUPABASE_URL`, `BOSSA_HOMOLOGATION_SUPABASE_PUBLISHABLE_KEY`, `BOSSA_HOMOLOGATION_SUPABASE_SECRET_KEY`.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os mesmos valores locais; `SUPABASE_SECRET_KEY` vazia.
- `FEATURE_DIRECT_WHATSAPP_CONNECTION=false`, `FEATURE_EMBEDDED_SIGNUP=false`, `NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false`.
- Credenciais/configuração de WhatsApp, Meta, Microsoft, OpenAI e cron ausentes. Chaves e senhas entram apenas no runtime privado, nunca no repositório, relatório ou ZIP.

`public.bossa_homologation_preflight()` é instalada **somente no banco descartável** pelo pacote privado. Retorna agregados: identidade do banco, data, usuários fictícios, três papéis autenticáveis na mesma organização, schema, fingerprints/estado das guardas e ausência de efeitos externos. O servidor exige contrato v1 e prova nova a cada acesso, sem cache de autorização. Falha, prova desconhecida, guardas alteradas ou resposta antiga bloqueiam a operação.

A RPC de diagnóstico usa `SECURITY DEFINER` somente para leitura agregada, com proprietário não superusuário, search path `pg_catalog, pg_temp`, nomes qualificados e EXECUTE apenas para `service_role`. Não concede leitura de Auth/Vault aos usuários, não modifica linhas e não substitui RLS das operações comerciais. O SQL e os fingerprints do schema privado ficam fora do repositório. As duas funções privilegiadas legadas e as **13 migrações comerciais** são preservadas.

## Verificações reproduzíveis

Node 22 e dependências do lockfile:

```sh
npm ci --cache /tmp/bossa-npm-safe-cache --no-audit --no-fund
npm run test:homologation-isolation
```

Essa suíte cobre os clientes/SDK reais e o proxy com adaptadores isolados do framework; não é teste renderizado. O pacote privado fornece a preparação do banco, Auth real, guardas, gateway, launcher e o teste do Next compilado com Chromium. Não executar o seed/SQL contra um banco selecionado por URL arbitrária. Não usar o launcher antigo com credenciais de integração de exemplo.

Com o laboratório preparado e build correspondente ao SHA:

```sh
BOSSA_HOMOLOGATION_MODE=local NODE_OPTIONS=--require=./scripts/homologation/egress.cjs npm start -- --hostname 127.0.0.1 --port 3001
BOSSA_EXPECTED_COMMIT=$(git rev-parse HEAD) npm run homologation:preflight -- --local-automated
```

O launcher privado injeta as demais variáveis sem imprimi-las. `GET /api/homologation/preflight` não grava dados, tem `no-store`, apresenta origem/identidade não sensíveis, SHA e os seis resultados. `humanAcceptanceAllowed` permanece falso mesmo com sucesso local. Para a prévia independente, o comando exige `--remote` e origem explícita, além da comprovação descrita no contrato remoto; a ausência de acesso não autoriza continuar testes com gravações.

## Pré-requisitos para a prévia pública

1. Acesso de leitura à configuração efetiva da Vercel e ao deployment da branch/SHA; registrar somente nomes, escopos e identidades públicas. Não confundir valores configurados com os utilizados pelo deployment.
2. Projeto Supabase independente aprovado, com esquema compatível, Auth/Storage/extensões/permissões e usuários fictícios admin/comercial/viewer. Nenhuma credencial de produção reutilizada.
3. Overrides exclusivos de Preview **desta branch**, removendo integrações herdadas; configuração de Production preservada. Não há mudança remota executada nesta rodada.
4. Bloqueios comprovados na aplicação, banco, workers/cron, Auth/e-mail e borda de rede gerenciada; identificar Edge Functions, Database Webhooks e demais consumidores implantados. Um sinalizador não comprova ausência de efeitos.
5. Contrato remoto v2 e evidências assinadas descritos no documento de homologação remota, publicação autorizada separadamente e pré-voo contra o deployment exato. Só depois liberar os oito testes humanos. Não se presume aprovação de CI remoto ou de piloto.

Os relatórios anteriores continuam históricos. O relatório privado desta rodada distingue verificações isoladas, Next/GoTrue/Chromium locais e configuração pública não auditável. Proveniência histórica, consumidores externos não identificados e aprovação operacional permanecem pendentes.

O `npm run check-env` legado verifica variáveis de uma instalação com integrações e não comprova isolamento. Não preencher seus campos de produção no laboratório para fazê-lo passar; o portão de segurança do laboratório é `homologation:preflight`. O lint/typecheck/build e as regressões continuam obrigatórios, separando seus resultados da aprovação do ambiente.
