'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BroadcastsManager,
  type AudienceDiagnostics,
  type Broadcast,
  type BroadcastConnection,
  type StageAudienceCount,
} from '@/components/BroadcastsManager';
import {
  MetaTemplatesManager,
  type MetaTemplateRow,
} from '@/components/MetaTemplatesManager';

export type BroadcastsTab = 'campanhas' | 'modelos';

export function BroadcastsWorkspace({
  organizationId,
  canEdit,
  initialTab,
  initialBroadcasts,
  initialTemplates,
  connections,
  stageCounts,
  audienceDiagnostics,
}: {
  organizationId: string;
  canEdit: boolean;
  initialTab: BroadcastsTab;
  initialBroadcasts: Broadcast[];
  initialTemplates: MetaTemplateRow[];
  connections: BroadcastConnection[];
  stageCounts: Record<string, StageAudienceCount>;
  audienceDiagnostics: Record<'cliente' | 'corretor', AudienceDiagnostics>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<BroadcastsTab>(initialTab);
  const [templates, setTemplates] = useState(initialTemplates);
  const [templatesReady, setTemplatesReady] = useState(initialTab !== 'modelos');
  const [templateSyncError, setTemplateSyncError] = useState('');

  const syncTemplates = useCallback(async () => {
    const connected = connections.filter((connection) => connection.status === 'connected');
    if (!connected.length) {
      setTemplatesReady(true);
      return;
    }

    setTemplatesReady(false);
    setTemplateSyncError('');

    try {
      const refreshed = await Promise.all(connected.map(async (connection) => {
        const response = await fetch('/api/transmissoes/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: connection.channel }),
        });
        const data = await response.json() as { templates?: MetaTemplateRow[]; error?: string };
        if (!response.ok) throw new Error(data.error || `Não foi possível sincronizar o canal ${connection.channel}.`);
        return { connectionId: connection.id, templates: data.templates ?? [] };
      }));

      setTemplates((current) => {
        const refreshedConnectionIds = new Set(refreshed.map((item) => item.connectionId));
        return [
          ...current.filter((template) => !refreshedConnectionIds.has(template.whatsapp_connection_id)),
          ...refreshed.flatMap((item) => item.templates),
        ];
      });
    } catch (caught) {
      setTemplateSyncError(caught instanceof Error ? caught.message : 'Não foi possível atualizar os modelos da Meta.');
    } finally {
      setTemplatesReady(true);
    }
  }, [connections]);

  useEffect(() => {
    if (tab !== 'modelos' || templatesReady) return;
    const timer = window.setTimeout(() => void syncTemplates(), 0);
    return () => window.clearTimeout(timer);
  }, [syncTemplates, tab, templatesReady]);

  // A aba fica na URL para que o atalho vindo da campanha, o botão de voltar do
  // navegador e um link compartilhado caiam todos no mesmo lugar.
  const openTab = useCallback((next: BroadcastsTab) => {
    if (next === 'modelos') setTemplatesReady(false);
    setTab(next);
    router.replace(next === 'campanhas' ? '/transmissoes' : `/transmissoes?aba=${next}`, { scroll: false });
  }, [router]);

  return <>
    <div className="tabs tabs-page" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'campanhas'}
        className={`tab ${tab === 'campanhas' ? 'on' : ''}`}
        onClick={() => openTab('campanhas')}
      >📣 Campanhas</button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'modelos'}
        className={`tab ${tab === 'modelos' ? 'on' : ''}`}
        onClick={() => openTab('modelos')}
      >🧩 Modelos da Meta</button>
    </div>

    {tab === 'campanhas'
      ? <BroadcastsManager
          organizationId={organizationId}
          canEdit={canEdit}
          initialBroadcasts={initialBroadcasts}
          initialTemplates={templates}
          connections={connections}
          stageCounts={stageCounts}
          audienceDiagnostics={audienceDiagnostics}
          onOpenTemplates={() => openTab('modelos')}
        />
      : !templatesReady
        ? <div className="page-content"><div className="info-box">Sincronizando modelos com a Meta…</div></div>
        : <>
            {templateSyncError && <div className="page-content" style={{ paddingBottom: 0 }}><div className="error-box">Não foi possível atualizar automaticamente: {templateSyncError}. Você ainda pode usar “Sincronizar Meta” manualmente.</div></div>}
            <MetaTemplatesManager
              initialTemplates={templates}
              connections={connections}
              canEdit={canEdit}
            />
          </>}
  </>;
}
