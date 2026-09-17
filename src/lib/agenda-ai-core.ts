import type { SupabaseClient } from '@supabase/supabase-js';
import { findAgendaConflicts } from '@/lib/agenda';
import type { AiTurn } from '@/lib/ai';
import type { Lead } from '@/lib/types';

type AdminClient = SupabaseClient;
export type AgendaAiResult =
  | { status: 'none' }
  | { status: 'needs_details'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'created'; eventId: string; assignedTo: string; startsAt: string; endsAt: string };

const weekdays: Record<string, number> = {
  domingo: 0, segunda: 1, 'segunda-feira': 1, terca: 2, 'terça': 2, 'terça-feira': 2,
  quarta: 3, 'quarta-feira': 3, quinta: 4, 'quinta-feira': 4, sexta: 5, 'sexta-feira': 5,
  sabado: 6, 'sábado': 6,
};
function normalize(text: string) { return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function saoPauloDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { year: Number(get('year')), month: Number(get('month')), day: Number(get('day')) };
}
function ymd(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`; }
function parseDateFromText(raw: string, now = new Date()): string | null {
  const text = normalize(raw);
  const todayParts = saoPauloDateParts(now);
  const today = new Date(`${ymd(todayParts.year, todayParts.month, todayParts.day)}T12:00:00-03:00`);
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (numeric) {
    let year = numeric[3] ? Number(numeric[3]) : todayParts.year;
    if (year < 100) year += 2000;
    const date = new Date(`${ymd(year, Number(numeric[2]), Number(numeric[1]))}T12:00:00-03:00`);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== Number(numeric[2]) || date.getDate() !== Number(numeric[1])) return null;
    return ymd(year, Number(numeric[2]), Number(numeric[1]));
  }
  if (/\bamanha\b/.test(text)) { const date = new Date(today); date.setDate(date.getDate() + 1); return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate()); }
  if (/\bhoje\b/.test(text)) return ymd(todayParts.year, todayParts.month, todayParts.day);
  for (const [name, target] of Object.entries(weekdays)) {
    if (!new RegExp(`\\b${normalize(name)}\\b`).test(text)) continue;
    const current = today.getDay();
    let delta = (target - current + 7) % 7;
    if (delta === 0 && !/\bhoje\b/.test(text)) delta = 7;
    const date = new Date(today); date.setDate(date.getDate() + delta);
    return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  return null;
}
function parseTimeFromText(raw: string): string | null {
  const text = normalize(raw);
  const explicit = text.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)?\b/);
  if (explicit) return `${String(Number(explicit[1])).padStart(2,'0')}:${String(Number(explicit[2] || 0)).padStart(2,'0')}`;
  const plain = text.match(/\b(?:as|por volta das|perto das)\s+([01]?\d|2[0-3])\b/);
  if (plain) return `${String(Number(plain[1])).padStart(2,'0')}:00`;
  return null;
}
function durationMinutes(text: string) {
  const normalized = normalize(text);
  const minutes = normalized.match(/\b(\d{1,3})\s*(?:min|minutos)\b/);
  if (minutes) return Math.max(15, Math.min(180, Number(minutes[1])));
  const hours = normalized.match(/\b(\d(?:[.,]5)?)\s*(?:h|hora|horas)\b/);
  if (hours) return Math.max(15, Math.min(180, Math.round(Number(hours[1].replace(',', '.')) * 60)));
  return 60;
}
function appointmentMode(text: string) {
  const value = normalize(text);
  if (/\b(video|videochamada|meet|online|teams)\b/.test(value)) return 'video' as const;
  if (/\b(ligacao|ligar|telefone|chamada)\b/.test(value)) return 'telefone' as const;
  return 'presencial' as const;
}
function appointmentType(text: string) {
  const value = normalize(text);
  if (/\bapresenta/.test(value)) return 'apresentacao' as const;
  if (/\bvisita|decorado|conhecer pessoalmente\b/.test(value)) return 'visita' as const;
  if (/\bligacao|ligar|telefone\b/.test(value)) return 'ligacao' as const;
  return 'reuniao_cliente' as const;
}
function hasSchedulingIntent(text: string, turn: AiTurn) {
  const value = normalize(text);
  return turn.stage === 'agendado' || turn.classification === 'agendamento'
    || /\b(agendar|marcar|agenda|visita|videochamada|reuniao|ligacao|pode ser|combinado|fechado)\b/.test(value);
}
async function recentConversation(admin: AdminClient, leadId: string) {
  const { data } = await admin.from('messages').select('direction,body,created_at').eq('lead_id', leadId)
    .neq('direction','system').order('created_at',{ ascending:false }).limit(12);
  return [...(data || [])].reverse() as Array<{direction:string; body:string; created_at:string}>;
}
async function candidateMembers(admin: AdminClient, organizationId: string, preferred: string | null) {
  const { data } = await admin.from('memberships').select('user_id,role,created_at')
    .eq('organization_id',organizationId).in('role',['admin','comercial']).order('created_at',{ascending:true});
  const ids = (data || []).map((row) => String(row.user_id));
  if (preferred && ids.includes(preferred)) return [preferred];
  const commercials = (data || []).filter((row) => row.role === 'comercial').map((row) => String(row.user_id));
  const admins = (data || []).filter((row) => row.role === 'admin').map((row) => String(row.user_id));
  return [...commercials,...admins];
}

export async function maybeScheduleAgendaFromAi(args: { admin: AdminClient; organizationId: string; lead: Lead; turn: AiTurn; lastUserMessage: string; }): Promise<AgendaAiResult> {
  if (!hasSchedulingIntent(args.lastUserMessage,args.turn)) return {status:'none'};
  const rows = await recentConversation(args.admin,args.lead.id);
  const recentText = rows.slice(-8).map((row)=>row.body).join('\n');
  // Data/hora precisam ter sido informados pelo contato, nunca inventados na resposta da IA.
  const userText = rows.filter((row) => row.direction === 'in').slice(-6).map((row) => row.body).join('\n');
  const date = parseDateFromText(args.lastUserMessage) || parseDateFromText(userText);
  const time = parseTimeFromText(args.lastUserMessage) || parseTimeFromText(userText);
  if (!date || !time) return {status:'needs_details',message:'Para marcar, preciso confirmar a data e o horário exatos.'};
  const startsAt = new Date(`${date}T${time}:00-03:00`);
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()-5*60_000)
    return {status:'needs_details',message:'Esse horário já passou. Qual outro dia e horário funciona melhor?'};
  const minutes = durationMinutes(recentText);
  const endsAt = new Date(startsAt.getTime()+minutes*60_000);
  const startsIso = startsAt.toISOString(); const endsIso = endsAt.toISOString();
  const {data:duplicate} = await args.admin.from('agenda_events').select('id,assigned_to,starts_at,ends_at')
    .eq('organization_id',args.organizationId).eq('lead_id',args.lead.id).eq('status','scheduled')
    .eq('starts_at',startsIso).maybeSingle();
  if (duplicate) return {status:'created',eventId:duplicate.id,assignedTo:duplicate.assigned_to,startsAt:duplicate.starts_at,endsAt:duplicate.ends_at};
  const candidates = await candidateMembers(args.admin,args.organizationId,args.lead.owner_id);
  if (!candidates.length) return {status:'needs_details',message:'Vou pedir ao time para confirmar quem ficará responsável por esse horário.'};
  let assignedTo:string|null = null; let preferredBusy = false;
  for (const userId of candidates) {
    const conflicts = await findAgendaConflicts({organizationId:args.organizationId,assignedTo:userId,startsAt:startsIso,endsAt:endsIso});
    if (!conflicts.length) {assignedTo=userId;break;}
    if (userId===args.lead.owner_id) preferredBusy=true;
  }
  if (!assignedTo) return {status:'conflict',message:preferredBusy
    ? 'Esse horário já está ocupado na agenda do responsável. Pode me passar outro horário?'
    : 'Esse horário está ocupado na agenda da equipe. Pode me passar outro horário?'};
  const mode = appointmentMode(recentText);
  const type = appointmentType(recentText);
  const label = type==='apresentacao'?'Apresentação':type==='visita'?'Visita':type==='ligacao'?'Ligação':'Reunião';
  const {data:event,error} = await args.admin.from('agenda_events').insert({
    organization_id:args.organizationId,lead_id:args.lead.id,assigned_to:assignedTo,created_by_kind:'ai',
    agent:args.lead.kind==='cliente'?'nara':'plantao',title:`${label} · ${args.lead.name}`,
    description:args.turn.summary||args.turn.next_action||null,event_type:type,meeting_mode:mode,
    starts_at:startsIso,ends_at:endsIso,metadata:{source:'whatsapp_ai',lead_name:args.lead.name,
      last_user_message:args.lastUserMessage,ai_summary:args.turn.summary},
  }).select('id,assigned_to,starts_at,ends_at').single();
  if (error) {
    if (error.code==='23P01') return {status:'conflict',message:'Esse horário acabou de ser ocupado. Pode me informar outra opção?'};
    throw error;
  }
  return {status:'created',eventId:event.id,assignedTo:event.assigned_to,startsAt:event.starts_at,endsAt:event.ends_at};
}
