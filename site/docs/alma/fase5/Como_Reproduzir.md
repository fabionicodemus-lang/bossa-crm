# Reprodução segura da verificação

Executar em `site/`, com Node/dependências já usados pelo projeto. Não utilizar base remota nos scripts de formulário.

1. `npm run typecheck`.
2. `VERCEL_ENV=preview BOSSA_PUBLICADO=sim npm run build` e iniciar com as mesmas variáveis usando `npm run start -- -p 3200`. Esse `sim` é um caso controlado LOCAL para confirmar que previews continuam bloqueados.
3. `node scripts/verificar-indexacao-alma.cjs`.
4. Com Playwright disponível em `PLAYWRIGHT_MODULE` e Chromium em `CHROMIUM_PATH`, rodar `node scripts/verificar-alma-fase4.cjs` e `node scripts/verificar-alma-texto-publico.cjs`. Definir `EVIDENCIAS_DIR` em pasta própria para não substituir evidência anterior.
5. Auditoria axe: instalar `axe-core` em pasta temporária externa ao projeto e indicar `AXE_PATH` para `axe.min.js`; executar `node scripts/verificar-alma-fase5.cjs`. Não é dependência de runtime nem foi adicionado ao package/lockfile.
6. `node scripts/verificar-api-alma.cjs`: inicia API real local na porta 3210 e RPC HTTP fictícia. Usa credenciais fictícias, não lê banco real e encerra seus servidores ao terminar. Certificar que a porta está livre.
7. Encerrar o servidor de teste e compilar a variante pública LOCAL: `VERCEL_ENV=production BOSSA_PUBLICADO=sim npm run build`. Iniciar com as mesmas variáveis. Executar `node scripts/verificar-alma-fase5.cjs --publica`. Não alterar variáveis remotas ou domínio.

Os scripts de navegador interceptam `/api/eventos` e `/api/leads`, ou todas as APIs no caso da auditoria. Nenhum WhatsApp é enviado. O navegador tem clipboard local real; navigator.share é simulado na matriz funcional. Zoom nativo e aparelho físico não são testados por esses comandos.

As capturas finais de formulário/comparação/lazer foram enquadradas por rolagem normal até o conteúdo para mostrar todos os campos/cartões e os controles reais. Não houve alteração de CSS para ocultar barras. A auditoria possui o mesmo enquadramento para reproduzi-las.
