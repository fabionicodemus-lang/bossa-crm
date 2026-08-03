# Mapa bruto de referências a Coexistência e Embedded Signup

Gerado automaticamente para revisão na Fase 4. Nenhum item abaixo foi removido nesta fase.

```text
README.md:64:FEATURE_EMBEDDED_SIGNUP=false
README.md:115:Não há Cadastro Incorporado, BSP ou Coexistência nesta fase. Os números são API-only e o atendimento humano ocorre pelo CRM.
README.md:205:## 11. Embedded Signup legado
README.md:210:FEATURE_EMBEDDED_SIGNUP=false
README.md:213:Mantenha a flag desligada na operação atual. As variáveis `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_CONFIG_ID` e `NEXT_PUBLIC_META_GRAPH_VERSION` são necessárias apenas quando essa funcionalidade for reativada.
.env.example:21:# Modo operacional atual: conexão direta pela Cloud API, sem BSP ou Coexistência.
.env.example:24:# Embedded Signup/Coexistência é legado e deve permanecer desligado até uma futura reativação planejada.
.env.example:25:FEATURE_EMBEDDED_SIGNUP=false
.env.example:26:NEXT_PUBLIC_META_APP_ID=
.env.example:27:NEXT_PUBLIC_META_CONFIG_ID=
src/lib/whatsapp/webhookDispatcher.ts:291:async function processCoexistenceEvent(eventId: string) {
src/lib/whatsapp/webhookDispatcher.ts:336:    return { processed: true, reason: field || 'coexistence_event' };
src/lib/whatsapp/webhookDispatcher.ts:338:    const message = error instanceof Error ? error.message : 'Falha no evento de coexistência.';
src/lib/whatsapp/webhookDispatcher.ts:359:    return processCoexistenceEvent(eventId);
src/app/(crm)/configuracoes/whatsapp/page.tsx:102:  const coexistenceEnabled = process.env.FEATURE_EMBEDDED_SIGNUP !== 'false';
src/app/(crm)/configuracoes/whatsapp/page.tsx:117:          <h2>Coexistência oficial da Meta</h2>
src/app/(crm)/configuracoes/whatsapp/page.tsx:126:      {coexistenceEnabled
src/app/(crm)/configuracoes/whatsapp/page.tsx:128:        : <div className="error-box">A Coexistência está desativada pela variável FEATURE_EMBEDDED_SIGNUP.</div>}
src/app/(crm)/configuracoes/whatsapp/page.tsx:136:            Use esta área somente para diagnóstico técnico. O fluxo normal da Bossa é a Coexistência acima.
src/app/api/meta/whatsapp/complete/route.ts:15:  if (process.env.FEATURE_EMBEDDED_SIGNUP === 'false') {
src/app/api/meta/whatsapp/complete/route.ts:17:      error: 'A Coexistência do WhatsApp está desativada no servidor.',
src/app/api/meta/whatsapp/complete/route.ts:101:      connection_mode: 'coexistence',
src/app/api/meta/whatsapp/complete/route.ts:126:      mode: 'coexistence',
src/app/api/meta/whatsapp/complete/route.ts:130:    console.error('[whatsapp coexistence complete]', error);
src/components/WhatsAppChannelsManager.tsx:242:      <strong>Desenvolvedor Direto · Cloud API.</strong> Os dois números são próprios da Bossa, usam uma WABA, um aplicativo Meta e token de Usuário do Sistema. O atendimento ocorre pelo CRM; não há Cadastro Incorporado, BSP ou Coexistência nesta fase.
src/components/ManualWhatsAppConnection.tsx:131:        Este modo é indicado para o <strong>número de teste ou provisório da Cloud API</strong>. Ele não conecta um número que já está ativo no aplicativo WhatsApp Business em modo de coexistência.
src/components/WhatsAppSettings.tsx:43:  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
src/components/WhatsAppSettings.tsx:44:  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID;
src/components/WhatsAppSettings.tsx:74:      setSuccess('WhatsApp conectado em modo de coexistência. O aplicativo continua funcionando no celular.');
src/components/WhatsAppSettings.tsx:93:      if (data.type === 'WA_EMBEDDED_SIGNUP' && data.event === 'FINISH' && data.data?.waba_id && data.data.phone_number_id) {
src/components/WhatsAppSettings.tsx:158:      setError('Configure NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_CONFIG_ID e NEXT_PUBLIC_META_GRAPH_VERSION na Vercel antes de conectar.');
src/components/WhatsAppSettings.tsx:191:      <strong>Modo de coexistência.</strong> Os números continuarão funcionando normalmente no aplicativo WhatsApp Business do celular enquanto o CRM recebe mensagens e executa as automações pela API oficial.
src/components/WhatsAppSettings.tsx:199:            <span className={`connection-pill ${item ? '' : 'off'}`}>{item ? 'Coexistência ativa' : 'Não conectado'}</span>
src/components/WhatsAppSettings.tsx:226:          <li>Confirma a coexistência pelo próprio aplicativo, sem excluir a conta nem perder o uso no celular.</li>
src/components/WhatsAppSettings.tsx:231:          Não exclua a conta do WhatsApp Business, não desinstale o aplicativo e não escolha uma migração definitiva do número para API. O fluxo correto é conectar o aplicativo existente em modo de coexistência.
supabase/migrations/014_whatsapp_coexistencia.sql:1:-- BOSSA CRM — WhatsApp Business App + Cloud API em Coexistência
supabase/migrations/014_whatsapp_coexistencia.sql:16:  check (connection_mode in ('coexistence', 'api_only'));
supabase/migrations/014_whatsapp_coexistencia.sql:19:  'coexistence mantém o número no WhatsApp Business e na Cloud API; api_only usa somente a API.';
```
