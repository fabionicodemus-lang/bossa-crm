import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiTurn } from '@/lib/ai-v120';
import type { HybridDecision } from '@/lib/hybrid';
import type { Lead } from '@/lib/types';
import { plantaoCanReplyNow } from '@/lib/whatsapp/plantaoSchedule';

type QueueArgs = {
  admin: SupabaseClient;
  organizationId: string;
  lead: Lead;
  turn: AiTurn;
  decision: HybridDecision;
  lastUserMessage: string;
  sourceMessageId: string;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function concreteClientSignal(value: string) {
  return /\b(tenho|to com|estou com|meu|minha|um|uma) cliente\b/.test(value)
    || /\bcliente (?:interessad|quer|gostou|pediu|procura|busca|vai|esta|est[aá])\b/.test(value)
    || /\b(?:cliente ativo|cliente quente|cliente na mao|cliente na m[aã]o)\b/.test(value);
}

function proposalSignal(value: string) {
  return /\b(proposta|simulacao|simular|reservar|reserva|fechar|negociar|negociacao|contraproposta|desconto|condicao|entrada|reforco|parcelamento|fluxo de pagamento)\b/.test(value);
}

function appointmentSignal(value: string) {
  return /\b(agendar|agendamento|marcar|visita|visitar|reuniao|videochamada|ligacao|horario|receber o cliente|levar o cliente|ir na obra|conhecer a obra|cafe na obra)\b/.test(value);
}

function humanSignal(value: string) {
  return /\b(falar com a tais|falar com alguem|atendimento humano|me liga|pode me ligar|chama a tais|passa pra tais)\b/.test(value);
}

function materialSignal(value: string) {
  return /\b(folder|material|tabela|planta|plantas|foto|fotos|video|videos|book|catalogo|apresentacao|arquivo|pdf|midia|mídia)\b/.test(value);
}

function simpleNoise(value: string) {
  if (!value) return true;
  return /^(bom dia|boa tarde|boa noite|oi|ola|ol[aá]|obrigad[oa]|valeu|show|top|perfeito|blz|beleza|ok|👍|🙏)[.! ]*$/.test(value);
}

function alertReason(args: {
  text: string;
  turn: AiTurn;
  decision: HybridDecision;
}) {
  const value = normalize(args.text);
  if (simpleNoise(value)) return null;

  const hasClient = concreteClientSignal(value);
  const hasProposal = proposalSignal(value);
  const hasAppointment = appointmentSignal(value);
  const wantsHuman = humanSignal(value);
  const onlyMaterial = materialSignal(value)
    && !hasClient
    && !hasProposal
    && !hasAppointment
    && !wantsHuman
    && !args.decision.handoffRequired;

  if (onlyMaterial) return null;
  if (hasProposal) return 'Proposta / negociação';
  if (hasAppointment) return 'Agendamento / visita';
  if (hasClient) return 'Corretor com cliente';
  if (wantsHuman) return 'Solicitou atendimento humano';

  if (
    args.decision.handoffRequired
    && !materialSignal(value)
    && !simpleNoise(value)
  ) {
    return 'Oportunidade que exige ação humana';
  }

  return null;
}

function compactSummary(turn: AiTurn, lastUserMessage: string) {
  const summary = String(turn.summary || '').trim();
  if (summary && summary.length >= 12) return summary.slice(0, 900);
  return String(lastUserMessage || '').trim().slice(0, 900);
}

export async function queueBrokerAfterHoursAlert(args: QueueArgs) {
  if (args.lead.kind !== 'corretor') return { queued: false, reason: 'not_broker' };

  const plantaoActive = await plantaoCanReplyNow(args.admin, args.organizationId);
  if (!plantaoActive) return { queued: false, reason: 'inside_human_hours' };

  const reason = alertReason({
    text: args.lastUserMessage,
    turn: args.turn,
    decision: args.decision,
  });
  if (!reason) return { queued: false, reason: 'not_actionable' };

  const brokerName = String(args.lead.name || '').trim() || 'Corretor sem nome';
  const brokerPhone = String(args.lead.phone || '').trim() || 'Sem telefone';
  const bucket = Math.floor(Date.now() / (10 * 60_000));
  const alertKey = `${args.lead.id}:${bucket}`;

  const { data, error } = await args.admin
    .from('broker_after_hours_alert_jobs')
    .upsert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      source_message_id: args.sourceMessageId,
      alert_key: alertKey,
      reason,
      summary: compactSummary(args.turn, args.lastUserMessage),
      broker_name: brokerName,
      broker_phone: brokerPhone,
      status: 'queued',
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,alert_key',
      ignoreDuplicates: true,
    })
    .select('id,status')
    .maybeSingle();

  if (error) {
    console.error('[plantao after-hours alert queue]', error.message);
    return { queued: false, reason: 'queue_error' };
  }

  if (data?.id) {
    await args.admin.from('activities').insert({
      organization_id: args.organizationId,
      lead_id: args.lead.id,
      type: 'alerta_plantao_fora_horario',
      title: 'Plantão identificou oportunidade fora do horário',
      description: `${reason}: ${compactSummary(args.turn, args.lastUserMessage)}`,
      metadata: {
        alert_job_id: data.id,
        source_message_id: args.sourceMessageId,
        reason,
        broker_phone: brokerPhone,
      },
    });
  }

  return { queued: Boolean(data?.id), reason };
}
