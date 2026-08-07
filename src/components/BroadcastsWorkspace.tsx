'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BroadcastsManager,
  type Broadcast,
  type BroadcastConnection,
} from '@/components/BroadcastsManager';
import {
  MetaTemplatesManager,
  type MetaTemplateRow,
} from '@/components/MetaTemplatesManager';

export type BroadcastsTab = 'campanhas' | 'modelos';

export function isBroadcastsTab(value: unknown): value is BroadcastsTab {
  return value === 'campanhas' || value === 'modelos';
}

export function BroadcastsWorkspace({
  organizationId,
  canEdit,
  initialTab,
  initialBroadcasts,
  initialTemplates,
  connections,
  stageCounts,
}: {
  organizationId: string;
  canEdit: boolean;
  initialTab: BroadcastsTab;
  initialBroadcasts: Broadcast[];
  initialTemplates: MetaTemplateRow[];
  connections: BroadcastConnection[];
  stageCounts: Record<string, { total: number; eligible: number }>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<BroadcastsTab>(initialTab);

  // A aba fica na URL para que o atalho vindo da campanha, o botão de voltar do
  // navegador e um link compartilhado caiam todos no mesmo lugar.
  const openTab = useCallback((next: BroadcastsTab) => {
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
          initialTemplates={initialTemplates}
          connections={connections}
          stageCounts={stageCounts}
          onOpenTemplates={() => openTab('modelos')}
        />
      : <MetaTemplatesManager
          initialTemplates={initialTemplates}
          connections={connections}
          canEdit={canEdit}
        />}
  </>;
}
