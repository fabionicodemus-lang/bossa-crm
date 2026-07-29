import { PageTopbar } from '@/components/PageTopbar';
import {
  MetaTemplatesManager,
  type MetaTemplateConnection,
  type MetaTemplateRow,
} from '@/components/MetaTemplatesManager';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function MetaTemplatesPage() {
  const context = await requireAdmin();
  const admin = createAdminClient();
  const organizationId = context!.organization.id;

  const [templatesResult, connectionsResult] = await Promise.all([
    admin.from('whatsapp_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false }),
    admin.from('whatsapp_connections')
      .select('id,channel,display_phone_number,verified_name,quality_rating,status')
      .eq('organization_id', organizationId)
      .order('channel'),
  ]);

  return <>
    <PageTopbar title="Modelos da Meta" subtitle="Criação, envio para aprovação e sincronização de modelos do WhatsApp" />
    {templatesResult.error
      ? <div className="page-content"><div className="error-box">A estrutura de modelos ainda não está disponível no Supabase. Execute as migrações 009 e 011 e atualize esta página.</div></div>
      : <MetaTemplatesManager
          initialTemplates={(templatesResult.data ?? []) as MetaTemplateRow[]}
          connections={(connectionsResult.data ?? []) as MetaTemplateConnection[]}
        />}
  </>;
}
