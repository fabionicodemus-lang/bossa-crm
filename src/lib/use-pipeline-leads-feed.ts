'use client';

import { useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Lead, LeadKind } from '@/lib/types';

// A lista de leads não precisa aparecer no mesmo milissegundo que a conversa —
// para um kanban, ~15s é imperceptível. Por isso aqui basta a sincronização
// incremental, sem o socket em tempo real: cada ciclo busca apenas os leads que
// mudaram desde o último cursor, o que quase sempre volta vazio.
const POLL_INTERVAL_MS = 15_000;
const CATCH_UP_LIMIT = 500;

export type PipelineLeadsFeed = {
  organizationId: string;
  kind: LeadKind;
  // Cursor: o maior `updated_at` já conhecido pela tela. O gatilho
  // `leads_set_updated_at` bumpa esse campo em todo update, então ele captura
  // troca de etapa, novo lead do webhook e arquivamento sem exceção.
  latestUpdatedAt: () => string | null;
  onLeads: (rows: Lead[]) => void;
};

export function usePipelineLeadsFeed(feed: PipelineLeadsFeed) {
  const feedRef = useRef(feed);
  useEffect(() => {
    feedRef.current = feed;
  });

  const catchUp = useCallback(async () => {
    const supabase = createClient();
    const since = feedRef.current.latestUpdatedAt();

    // `gte` (e não `gt`) reprocessa a linha exatamente no cursor, então uma
    // gravação no mesmo instante do último ciclo nunca escapa. A deduplicação
    // por `updated_at` no consumidor absorve esse reprocessamento barato.
    let query = supabase
      .from('leads')
      .select('*')
      .eq('organization_id', feedRef.current.organizationId)
      .eq('kind', feedRef.current.kind)
      .order('updated_at', { ascending: true })
      .limit(CATCH_UP_LIMIT);
    if (since) query = query.gte('updated_at', since);

    const { data, error } = await query;
    if (error) throw error;
    if (data?.length) feedRef.current.onLeads(data as Lead[]);
  }, []);

  useEffect(() => {
    const runCatchUp = () => {
      catchUp().catch((error) => console.error('[pipeline leads feed]', error));
    };

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      runCatchUp();
    }, POLL_INTERVAL_MS);

    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      runCatchUp();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', runCatchUp);

    // Fecha a janela entre o carregamento no servidor e o primeiro ciclo.
    runCatchUp();

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', runCatchUp);
    };
  }, [catchUp]);
}
