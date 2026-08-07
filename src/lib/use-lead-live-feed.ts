'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Activity, LeadTask, Message } from '@/lib/types';

// A conversa precisa aparecer para o comercial no mesmo instante em que o
// cliente envia. O Realtime resolve o caminho feliz, mas ele cai em silêncio
// quando o token expira, quando a aba dorme ou quando a rede oscila. Por isso o
// feed combina três garantias: assinatura Realtime, reconexão com recuo
// exponencial e uma sincronização incremental que fecha qualquer buraco.
// Enquanto o Realtime está de pé ele entrega em milissegundos e a sincronização
// quase sempre volta vazia; o intervalo curto existe para o caso degradado, em
// que o socket caiu e a mensagem não pode esperar.
const POLL_INTERVAL_LIVE_MS = 15_000;
const POLL_INTERVAL_DEGRADED_MS = 4_000;
const FIRST_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 20_000;
const CATCH_UP_LIMIT = 200;

export type LeadFeedStatus = 'connecting' | 'live' | 'reconnecting';

export type LeadFeedHandlers = {
  onMessages: (rows: Message[]) => void;
  onActivities: (rows: Activity[]) => void;
  onTaskInsert: (row: LeadTask) => void;
  onTaskUpdate: (row: LeadTask) => void;
  latestMessageAt: () => string | null;
  latestActivityAt: () => string | null;
};

type ChangePayload<T> = { new: T };

export function useLeadLiveFeed(leadId: string, handlers: LeadFeedHandlers) {
  const [status, setStatus] = useState<LeadFeedStatus>('connecting');
  // O objeto de handlers é recriado a cada render do detalhe do lead. Mantê-lo
  // em ref evita derrubar e reassinar o canal Realtime a cada render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Busca apenas o que entrou depois do último registro conhecido. Com os
  // índices (lead_id, created_at) o custo é irrisório e quase sempre retorna
  // zero linhas, então pode rodar de forma agressiva.
  const catchUp = useCallback(async () => {
    const supabase = createClient();
    const messageSince = handlersRef.current.latestMessageAt();
    const activitySince = handlersRef.current.latestActivityAt();

    let messageQuery = supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
      .limit(CATCH_UP_LIMIT);
    if (messageSince) messageQuery = messageQuery.gte('created_at', messageSince);

    let activityQuery = supabase
      .from('activities')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(CATCH_UP_LIMIT);
    if (activitySince) activityQuery = activityQuery.gte('created_at', activitySince);

    const [messageResult, activityResult] = await Promise.all([messageQuery, activityQuery]);
    if (messageResult.error) throw messageResult.error;
    if (activityResult.error) throw activityResult.error;

    if (messageResult.data?.length) handlersRef.current.onMessages(messageResult.data as Message[]);
    if (activityResult.data?.length) handlersRef.current.onActivities(activityResult.data as Activity[]);
  }, [leadId]);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempt = 0;
    let reconnectTimer: number | undefined;

    const runCatchUp = () => {
      catchUp().catch((error) => console.error('[lead feed catch-up]', error));
    };

    // Rede de segurança: mesmo com o Realtime derrubado, a conversa nunca
    // atrasa mais do que um intervalo de polling. O passo acelera enquanto o
    // canal não está de pé e volta ao ritmo lento assim que ele assina.
    let pollTimer: number | undefined;
    const startPolling = (interval: number) => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        runCatchUp();
      }, interval);
    };

    const teardownChannel = () => {
      if (!channel) return;
      const current = channel;
      channel = null;
      void supabase.removeChannel(current);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, FIRST_RECONNECT_DELAY_MS * 2 ** attempt);
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        teardownChannel();
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (disposed) return;
      // Sem o token do usuário o socket entra como `anon` e o RLS de `messages`
      // simplesmente não entrega nada — a conversa fica muda até um F5.
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) await supabase.realtime.setAuth(token);
      } catch (error) {
        console.error('[lead feed auth]', error);
      }
      if (disposed) return;

      channel = supabase
        .channel(`lead-${leadId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` }, (payload: ChangePayload<Message>) => {
          handlersRef.current.onMessages([payload.new]);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` }, (payload: ChangePayload<Message>) => {
          handlersRef.current.onMessages([payload.new]);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities', filter: `lead_id=eq.${leadId}` }, (payload: ChangePayload<Activity>) => {
          handlersRef.current.onActivities([payload.new]);
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_tasks', filter: `lead_id=eq.${leadId}` }, (payload: ChangePayload<LeadTask>) => {
          handlersRef.current.onTaskInsert(payload.new);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lead_tasks', filter: `lead_id=eq.${leadId}` }, (payload: ChangePayload<LeadTask>) => {
          handlersRef.current.onTaskUpdate(payload.new);
        })
        .subscribe((state: string) => {
          if (disposed) return;
          if (state === 'SUBSCRIBED') {
            attempt = 0;
            setStatus('live');
            startPolling(POLL_INTERVAL_LIVE_MS);
            // Cobre a janela entre a renderização no servidor e a assinatura.
            runCatchUp();
            return;
          }
          if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            setStatus('reconnecting');
            startPolling(POLL_INTERVAL_DEGRADED_MS);
            scheduleReconnect();
          }
        });
    };

    void connect();
    startPolling(POLL_INTERVAL_DEGRADED_MS);

    const resync = () => {
      if (document.visibilityState !== 'visible') return;
      runCatchUp();
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('online', runCatchUp);

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('online', runCatchUp);
      teardownChannel();
    };
  }, [leadId, catchUp]);

  return status;
}
