import { PageTopbar } from '@/components/PageTopbar';
import {
  WhatsAppChannelsManager,
  type WhatsAppChannelSummary,
  type WhatsAppMonthlyCount,
} from '@/components/WhatsAppChannelsManager';
import { WhatsAppSettings, type Connection } from '@/components/WhatsAppSettings';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

function isMigrationMissing(error: { code?: string; message?: string } | null) {
  return Boolean(
    error
    && (
      error.code === '42P01'
      || error.code === 'PGRST205'
      || error.message?.includes('whatsapp_channels')
    )
  );
}

export default async function WhatsAppPage() {
  const context = await requireAdmin();
  const admin = createAdminClient();
  const organizationId = context!.organization.id;

  const { data: channelRows, error: channelError } = await admin
    .from('whatsapp_channels')
    .select('id,label,role,provider,business_id,waba_id,phone_number_id,display_phone_number,verified_name,quality_rating,status,messaging_limit,registered_at,app_subscribed_at,last_tested_at,created_at,updated_at')
    .eq('organization_id', organizationId)
    .order('created_at');

  const migrationPending = isMigrationMissing(channelError);
  let channels = (channelRows ?? []) as WhatsAppChannelSummary[];
  let legacyConnections: Connection[] = [];

  if (migrationPending || process.env.FEATURE_EMBEDDED_SIGNUP === 'true') {
    const { data } = await admin
      .from('whatsapp_connections')
      .select('id,channel,business_id,waba_id,phone_number_id,display_phone_number,verified_name,quality_rating,status,connected_at,updated_at')
      .eq('organization_id', organizationId)
      .order('connected_at', { ascending: false });
    legacyConnections = (data ?? []) as Connection[];

    if (migrationPending) {
      channels = (data ?? []).map((item) => ({
        id: item.id,
        label: item.channel === 'clientes' ? 'Clientes finais · Nara' : 'Corretores · Plantão',
        role: item.channel === 'clientes' ? 'cliente' : 'corretor',
        provider: 'meta_cloud',
        business_id: item.business_id ?? null,
        waba_id: item.waba_id,
        phone_number_id: item.phone_number_id,
        display_phone_number: item.display_phone_number ?? null,
        verified_name: item.verified_name ?? null,
        quality_rating: item.quality_rating ?? null,
        status: item.status,
        messaging_limit: null,
        registered_at: item.status === 'connected' ? item.connected_at : null,
        app_subscribed_at: item.status === 'connected' ? item.connected_at : null,
        last_tested_at: item.updated_at ?? item.connected_at,
        created_at: item.connected_at,
        updated_at: item.updated_at ?? item.connected_at,
      })) as WhatsAppChannelSummary[];
    }
  }

  let monthlyCounts: WhatsAppMonthlyCount[] = [];
  if (!migrationPending) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const { data } = await admin
      .from('whatsapp_monthly_message_counts')
      .select('channel_id,channel_label,role,month,category,message_count')
      .eq('organization_id', organizationId)
      .gte('month', start.toISOString())
      .order('channel_label')
      .order('category');
    monthlyCounts = (data ?? []).map((item) => ({
      ...item,
      message_count: Number(item.message_count),
    })) as WhatsAppMonthlyCount[];
  }

  const embeddedSignupEnabled = process.env.FEATURE_EMBEDDED_SIGNUP === 'true';
  const connectionVersion = channels
    .map((item) => `${item.role}:${item.id}:${item.updated_at}`)
    .sort()
    .join('|');

  return <>
    <PageTopbar title="Canais WhatsApp" subtitle="Dois números próprios da Bossa conectados diretamente à Cloud API" />
    <div className="page-content">
      <div className="page-head">
        <div>
          <h2>Integração oficial do WhatsApp</h2>
          <p>Tokens, PIN e chamadas à Graph API permanecem exclusivamente no servidor.</p>
        </div>
      </div>

      <WhatsAppChannelsManager
        key={connectionVersion}
        initialChannels={channels}
        monthlyCounts={monthlyCounts}
        migrationPending={migrationPending}
      />

      {embeddedSignupEnabled && <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head"><div><h3>Legacy · Cadastro Incorporado</h3><small className="faint">Disponível apenas para preparação da Fase 2.</small></div></div>
        <div className="card-body">
          <div className="error-box" style={{ marginBottom: 14 }}>Feature flag FEATURE_EMBEDDED_SIGNUP ligada. Este fluxo não deve ser usado na operação atual da Bossa.</div>
          <WhatsAppSettings initialConnections={legacyConnections} />
        </div>
      </section>}
    </div>
  </>;
}
