import { after, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateAiTurn } from '@/lib/ai';
import { loadAiContext } from '@/lib/ai-context';
import { recordAiUsage } from '@/lib/ai-usage';
import { applyHybridDecision } from '@/lib/hybrid-server';
import type { Lead } from '@/lib/types';
import { decryptToken, normalizeWaId, sendWhatsAppText } from '@/lib/whatsapp';

export const maxDuration = 60;

async function analyzeAfterHumanMessage(organizationId: string, leadId: string) {
  const admin = createAdminClient();
  const { data: leadData } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle();
  const lead = leadData as Lead | null;
  if (!lead || lead.opt_out) return;
  const context = await loadAiContext(admin, organizationId, lead.kind);
  if (context.config?.active === false) return;
  const { data: rows } = await admin.from('messages').select('direction,body')
    .eq('lead_id', leadId).neq('direction', 'system').order('created_at', { ascending: true }).limit(100);
  const history = (rows ?? []).map((row) => ({
    role: row.direction === 'in' ? 'user' as const : 'assistant' as const,
    content: row.body,
  }));
  if (!history.length) return;
  const turn = await generateAiTurn(lead, history, context);
  if (!turn) return;
  const lastUserMessage = [...history].reverse().find((item) => item.role === 'user')?.content ?? '';
  await applyHybridDecision({ admin, organizationId, lead, turn, lastUserMessage });
  await recordAiUsage({ admin, organizationId, leadId, records: turn.usage_records ?? [] });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

    const { data: membership } = await supabase.from('memberships')
      .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
    if (!membership || membership.role === 'viewer') {
      return NextResponse.json({ error: 'Você não possui permissão para enviar mensagens.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({})) as { leadId?: unknown; body?: unknown };
    const leadId = String(body.leadId ?? '');
    const text = String(body.body ?? '').trim().slice(0, 4096);
    if (!leadId || !text) return NextResponse.json({ error: 'Mensagem inválida.' }, { status: 400 });

    const admin = createAdminClient();
    const { data: leadData } = await admin.from('leads').select('*')
      .eq('id', leadId).eq('organization_id', membership.organization_id).maybeSingle();
    const lead = leadData as Lead | null;
    if (!lead) return NextResponse.json({ error: 'Contato não encontrado.' }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: 'O contato não possui telefone válido.' }, { status: 400 });
    if (lead.owner_mode === 'ai' && lead.ai_enabled) {
      return NextResponse.json({ error: 'Aceite a passagem ou assuma a conversa antes de enviar uma mensagem humana.' }, { status: 409 });
    }

    const channel = lead.kind === 'cliente' ? 'clientes' : 'corretores';
    const { data: connection } = await admin.from('whatsapp_connections')
      .select('id,phone_number_id,encrypted_access_token,status')
      .eq('organization_id', membership.organization_id).eq('channel', channel).eq('status', 'connected').maybeSingle();
    if (!connection) return NextResponse.json({ error: 'O canal do WhatsApp ainda não está conectado.' }, { status: 409 });

    const destination = normalizeWaId(lead.phone);
    if (!destination) return NextResponse.json({ error: 'O telefone do contato não possui dígitos válidos.' }, { status: 400 });
    const result = await sendWhatsAppText({
      phoneNumberId: connection.phone_number_id,
      accessToken: decryptToken(connection.encrypted_access_token),
      to: destination,
      body: text,
    });
    const now = new Date().toISOString();
    const { data: message, error } = await admin.from('messages').insert({
      organization_id: membership.organization_id,
      lead_id: lead.id,
      whatsapp_connection_id: connection.id,
      direction: 'out',
      sender_kind: 'humano',
      sender_user_id: user.id,
      body: text,
      status: 'sent',
      whatsapp_message_id: result.messages?.[0]?.id ?? null,
    }).select('*').single();
    if (error) throw error;

    await admin.from('leads').update({
      owner_id: lead.owner_id || user.id,
      owner_mode: 'human',
      ai_enabled: false,
      automation_paused: false,
      stage: ['agendado', 'pos_reuniao', 'proposta_negociacao'].includes(lead.stage) ? lead.stage : 'humano_ativo',
      last_outbound_at: now,
      last_human_activity_at: now,
      updated_at: now,
    }).eq('id', lead.id);
    await admin.from('lead_tasks').update({ status: 'completed', completed_at: now })
      .eq('lead_id', lead.id).eq('status', 'pending').in('dedupe_key', ['human:first-contact', 'handoff:pending']);
    await admin.from('activities').insert({
      organization_id: membership.organization_id,
      lead_id: lead.id,
      user_id: user.id,
      type: 'mensagem_humana',
      title: 'Consultor respondeu pelo WhatsApp',
      description: text,
      metadata: { message_id: message.id },
    });

    after(async () => {
      try { await analyzeAfterHumanMessage(membership.organization_id, lead.id); }
      catch (analysisError) {
        console.error('[silent hybrid analysis]', analysisError);
        await createAdminClient().from('activities').insert({
          organization_id: membership.organization_id,
          lead_id: lead.id,
          type: 'falha_analise_silenciosa',
          title: 'A análise silenciosa da IA falhou',
          description: analysisError instanceof Error ? analysisError.message : 'Erro desconhecido.',
          metadata: { message_id: message.id },
        });
      }
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error('[whatsapp send]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.' }, { status: 500 });
  }
}
