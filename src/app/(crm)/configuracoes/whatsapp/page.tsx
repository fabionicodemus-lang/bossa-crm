import { PageTopbar } from '@/components/PageTopbar';
import {
  WhatsAppChannelsManager,
  type WhatsAppChannelSummary,
} from '@/components/WhatsAppChannelsManager';
import { WhatsAppSettings, type Connection } from '@/components/WhatsAppSettings';
import {
  WhatsAppUsageSummary,
  type WhatsAppMonthlyCount,
} from '@/components/WhatsAppUsageSummary';
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

function channelToConnection(channel: WhatsAppChannelSummary): Connection {
  return {
    id: channel.id,
    channel: channel.role === 'cliente' ? 'clientes' : 'corretores',
    display_phone_number: channel.display_phone_number,
    verified_name: channel.verified_name,
    quality_rating: channel.quality_rating,
    status: channel.status,
    connected_at: channel.registered_at ?? channel.created_at,
  };
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
  let connections = channels.map(channelToConnection);

  if (migrationPending || connections.length === 0) {
    const { data } = await admin
      .from('whatsapp_connections')
      .select('id,channel,display_phone_number,verified_name,quality_rating,status,connected_at')
      .eq('organization_id', organizationId)
      .order('connected_at', { ascending: false });
    const legacyConnections = (data ?? []) as Connection[];

    if (connections.length === 0) connections = legacyConnections;
    if (migrationPending) {
      channels = legacyConnections.map((item) => ({
        id: item.id,
        label: item.channel === 'clientes' ? 'Clientes finais · Nara' : 'Corretores · Plantão',
        role: item.channel === 'clientes' ? 'cliente' : 'corretor',
        provider: 'meta_cloud',
        business_id: null,
        waba_id: '',
        phone_number_id: '',
        display_phone_number: item.display_phone_number,
        verified_name: item.verified_name,
        quality_rating: item.quality_rating,
        status: item.status,
        messaging_limit: null,
        registered_at: item.connected_at,
        app_subscribed_at: item.connected_at,
        last_tested_at: item.connected_at,
        created_at: item.connected_at,
        updated_at: item.connected_at,
      }));
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

  const coexistenceEnabled = process.env.FEATURE_EMBEDDED_SIGNUP !== 'false';
  const directConnectionEnabled = process.env.FEATURE_DIRECT_WHATSAPP_CONNECTION === 'true';
  const connectionVersion = channels
    .map((item) => `${item.role}:${item.id}:${item.updated_at}`)
    .sort()
    .join('|');

  return <>
    <PageTopbar
      title="Canais WhatsApp"
      subtitle="Use os mesmos números no WhatsApp Business e no Bossa CRM"
    />
    <div className="page-content">
      <div className="page-head">
        <div>
          <h2>Coexistência oficial da Meta</h2>
          <p>O WhatsApp continua no celular e as novas conversas também ficam disponíveis para Nara, Plantão e equipe comercial no CRM.</p>
        </div>
      </div>

      {migrationPending && <div className="error-box" style={{ marginBottom: 14 }}>
        A migração 012 ainda não foi localizada. Execute as migrations do WhatsApp antes de conectar os números.
      </div>}

      {coexistenceEnabled
        ? <WhatsAppSettings key={connectionVersion} initialConnections={connections} />
        : <div className="error-box">A Coexistência está desativada pela variável FEATURE_EMBEDDED_SIGNUP.</div>}

      <WhatsAppUsageSummary counts={monthlyCounts} />

      {directConnectionEnabled && <details style={{ marginTop: 14 }}>
        <summary className="btn btn-ghost">Diagnóstico avançado · conexão API-only</summary>
        <div style={{ marginTop: 14 }}>
          <div className="error-box" style={{ marginBottom: 14 }}>
            Use esta área somente para diagnóstico técnico. O fluxo normal da Bossa é a Coexistência acima.
          </div>
          <WhatsAppChannelsManager
            initialChannels={channels}
            monthlyCounts={[]}
            migrationPending={migrationPending}
          />
        </div>
      </details>}
    </div>
  </>;
}