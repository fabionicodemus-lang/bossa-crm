import { PageTopbar } from '@/components/PageTopbar';
import { ManualWhatsAppConnection } from '@/components/ManualWhatsAppConnection';
import { WhatsAppSettings, type Connection } from '@/components/WhatsAppSettings';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function WhatsAppPage() {
  const context = await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin
    .from('whatsapp_connections')
    .select('id,channel,display_phone_number,verified_name,quality_rating,status,connected_at')
    .eq('organization_id', context!.organization.id)
    .order('connected_at', { ascending: false });
  const connections = (data ?? []) as Connection[];
  const connectionVersion = connections
    .map((item) => `${item.channel}:${item.id}:${item.connected_at}`)
    .sort()
    .join('|');

  return <>
    <PageTopbar title="Canais WhatsApp" subtitle="Conecte os números pela Meta ou use a Cloud API provisória para testes" />
    <div className="page-content">
      <div className="page-head">
        <div>
          <h2>Integração oficial do WhatsApp</h2>
          <p>Os tokens ficam criptografados no servidor e nunca são enviados novamente ao navegador.</p>
        </div>
      </div>
      <WhatsAppSettings key={connectionVersion} initialConnections={connections} />
      <ManualWhatsAppConnection initialConnections={connections} />
    </div>
  </>;
}
