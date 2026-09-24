import { PageTopbar } from '@/components/PageTopbar';
import {
  WhatsAppChannelsManager,
  type WhatsAppChannelSummary,
} from '@/components/WhatsAppChannelsManager';
import { WhatsAppSettings, type Connection } from '@/components/WhatsAppSettings';
import { MetaLeadAdsConnection } from '@/components/MetaLeadAdsConnection';
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
  const slot = channel.role === 'cliente'
    ? 'clientes'
    : channel.routing_mode === 'direct_role' && !channel.legacy_connection_id
      ? 'corretores_extra'
      : 'corretores';
  return {
    id: channel.id,
    channel: slot,
    connection_mode: channel.connection_mode ?? null,
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
    .select('id,label,role,routing_mode,provider,connection_mode,business_id,waba_id,phone_number_id,display_phone_number,verified_name,quality_rating,status,messaging_limit,legacy_connection_id,registered_at,app_subscribed_at,last_tested_at,created_at,updated_at')
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
        routing_mode: item.channel === 'clientes' ? 'direct_role' : 'mixed_plantao',
        provider: 'meta_cloud',
        connection_mode: null,
        business_id: null,
        waba_id: '',
        phone_number_id: '',
        display_phone_number: item.display_phone_number,
        verified_name: item.verified_name,
        quality_rating: item.quality_rating,
        status: item.status,
        messaging_limit: null,
        legacy_connection_id: item.id,
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

  const { data: leadAdsConnection } = await admin
    .from('meta_lead_ads_connections')
    .select('page_id,page_name,status,last_tested_at,last_error')
    .eq('organization_id', organizationId)
    .maybeSingle();

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
        : <>
          <div className="info-box" style={{ marginBottom: 14 }}>
            A Coexistência geral permanece desativada para reconexões automáticas. O Canal 1 da Nara pode ser migrado explicitamente para coexistência, e o Canal 3 comercial continua disponível separadamente.
          </div>
          <WhatsAppSettings
            key={`${connectionVersion}:migration`}
            initialConnections={connections}
            visibleChannels={['clientes', 'corretores_extra']}
          />
        </>}

      <MetaLeadAdsConnection initial={{
        pageName: leadAdsConnection?.page_name ?? null,
        pageId: leadAdsConnection?.page_id ?? null,
        status: leadAdsConnection?.status ?? null,
        lastTestedAt: leadAdsConnection?.last_tested_at ?? null,
        lastError: leadAdsConnection?.last_error ?? null,
      }} />

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