import { PageTopbar } from '@/components/PageTopbar';
import { WhatsAppSettings, type Connection } from '@/components/WhatsAppSettings';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function WhatsAppPage() {
  const context = await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from('whatsapp_connections').select('id,channel,display_phone_number,verified_name,quality_rating,status,connected_at').eq('organization_id', context!.organization.id).order('connected_at', { ascending: false });
  return <><PageTopbar title="Canais WhatsApp" subtitle="Conecte os números pela conta da Meta" /><div className="page-content"><div className="page-head"><div><h2>Integração oficial do WhatsApp</h2><p>Os tokens ficam criptografados no servidor e nunca são enviados ao navegador.</p></div></div><WhatsAppSettings initialConnections={(data ?? []) as Connection[]} /></div></>;
}
