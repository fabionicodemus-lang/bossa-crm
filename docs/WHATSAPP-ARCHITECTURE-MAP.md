# Mapa de arquitetura do WhatsApp

## Modo operacional atual

O Bossa CRM opera em **Desenvolvedor Direto / WhatsApp Cloud API / API-only**:

- `FEATURE_DIRECT_WHATSAPP_CONNECTION=true`;
- `FEATURE_EMBEDDED_SIGNUP=false`;
- números conectados pela Cloud API;
- atendimento humano realizado pelo CRM;
- Embedded Signup/Coexistência não é o fluxo operacional atual.

Este documento apenas mapeia a divergência existente. Nenhum código legado de Coexistência foi removido na Fase 4.

## 1. Trechos incoerentes com o modo atual

### `src/app/(crm)/configuracoes/whatsapp/page.tsx`

A página ainda apresenta a Coexistência como fluxo principal:

- subtítulo diz que os mesmos números permanecem no WhatsApp Business e no CRM;
- título principal é “Coexistência oficial da Meta”;
- a conexão API-only aparece dentro de “Diagnóstico avançado”;
- o texto afirma que o fluxo normal da Bossa é a Coexistência.

Esses textos contradizem o modo API-only configurado. A correção deve ser feita em uma fase funcional própria, pois altera qual interface é apresentada como fluxo principal.

## 2. Código legado preservado e protegido por flag

### `src/components/WhatsAppSettings.tsx`

Implementa a experiência de Embedded Signup/Coexistência, incluindo carregamento do SDK da Meta, eventos `WA_EMBEDDED_SIGNUP`, variáveis públicas de configuração e mensagens de confirmação da Coexistência.

### `src/app/api/meta/whatsapp/complete/route.ts`

Conclui a conexão em modo `coexistence`. A rota verifica `FEATURE_EMBEDDED_SIGNUP` e deve permanecer inacessível enquanto a flag estiver desligada.

### `src/lib/whatsapp/webhookDispatcher.ts`

Mantém processamento de eventos de Coexistência e decide quando usar o processador legado ou o processador do Desenvolvedor Direto.

Esses componentes podem permanecer no repositório como compatibilidade futura, desde que a flag continue desligada e o caminho API-only seja o único apresentado como operação normal.

## 3. Schema de compatibilidade

### `supabase/migrations/014_whatsapp_coexistencia.sql`

A migration acrescenta suporte aos modos `coexistence` e `api_only`. Ela não deve ser apagada nem renomeada porque pode ter sido executada em produção. A presença das colunas e constraints de compatibilidade não ativa a Coexistência por si só.

## 4. Trechos alinhados com o modo atual

### `README.md`

Documenta corretamente o Desenvolvedor Direto, informa que não há BSP ou Coexistência nesta fase e mantém Embedded Signup como legado desligado.

### `.env.example`

Após a Fase 4, passa a usar:

```env
NEXT_PUBLIC_ALLOW_PUBLIC_SIGNUP=false
FEATURE_DIRECT_WHATSAPP_CONNECTION=true
FEATURE_EMBEDDED_SIGNUP=false
```

### `src/components/WhatsAppChannelsManager.tsx`

Descreve corretamente o fluxo Cloud API/API-only com números próprios da Bossa e atendimento pelo CRM.

### `src/components/ManualWhatsAppConnection.tsx`

A menção à Coexistência é explicativa: informa a limitação da conexão manual para números que já estejam ativos no aplicativo. Não apresenta a Coexistência como modo operacional atual.

## 5. Próxima correção recomendada

Em uma fase posterior e separada:

1. tornar `WhatsAppChannelsManager` o conteúdo principal da tela de Canais;
2. remover da interface os textos que apresentam Coexistência como fluxo normal;
3. manter `WhatsAppSettings` e a rota `/api/meta/whatsapp/complete` inacessíveis atrás de `FEATURE_EMBEDDED_SIGNUP=false`;
4. adicionar teste que garanta que o fluxo legado não apareça quando a flag estiver desligada;
5. não remover a migration 014 nem estruturas já existentes no banco sem auditoria de produção.