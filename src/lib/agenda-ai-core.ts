import type { SupabaseClient } from '@supabase/supabase-js';
import { findAgendaConflicts } from '@/lib/agenda';
import type { AiTurn } from '@/lib/ai';
import { agendaActionFromText, shouldHandleAgendaTurn, type AgendaConversationMessage } from '@/lib/nara-agenda-intent';
import type { Lead } from '@/lib/types';
import { officeHours } from '@/lib/nara-office-hours';

type AdminClient = SupabaseClient;
export type AgendaAiResult =
  | { status: 'none' }
  | { status: 'needs_details'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'cancelled'; message: string }
  | { status: 'options'; message: string }
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
  const minutes = normalized.match(/\b(?:duracao|durar|por)\s+(\d{1,3})\s*(?:min|minutos)\b/);
  if (minutes) return Math.max(15, Math.min(180, Number(minutes[1])));
  const hours = normalized.match(/\b(?:duracao|durar|por)\s+(\d(?:[.,]5)?)\s*(?:h|hora|horas)\b/);
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
function withinOfficeHours(date: string, time: string, minutes: number, weekdayHours?: string, saturdayHours?: string) {
  const hours = officeHours(date,weekdayHours,saturdayHours);
  if (!hours) return false;
  const [hour, minute] = time.split(':').map(Number);
  const start = hour * 60 + minute;
  return start >= hours.open && start + minutes <= hours.close;
}
function slotStartIso(date: string, time: string) { return new Date(`${date}T${time}:00-03:00`).toISOString(); }
async function recentConversation(admin: AdminClient, leadId: string, resetAt?: string) {
  let query = admin.from('messages').select('direction,body,created_at').eq('lead_id', leadId)
    .neq('direction','system');
  if (resetAt) query = query.gte('created_at',resetAt);
  const { data } = await query.order('created_at',{ ascending:false }).limit(12);
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

async function ensureOfficeAddressTask(admin: AdminClient, organizationId: string, lead: Lead): Promise<boolean> {
  const dedupeKey = 'agenda:confirmar-endereco-escritorio';
  const { data: existing, error: existingError } = await admin.from('lead_tasks').select('id')
    .eq('organization_id', organizationId).eq('lead_id', lead.id).eq('dedupe_key', dedupeKey)
    .limit(1).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return false;

  const candidates = await candidateMembers(admin, organizationId, lead.owner_id);
  const assignedTo = candidates[0] ?? lead.owner_id ?? null;
  const dueAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await admin.from('lead_tasks').insert({
    organization_id: organizationId,
    lead_id: lead.id,
    assigned_to: assignedTo,
    assigned_mode: 'human',
    type: 'agenda_endereco',
    title: 'Confirmar endereço para visita da Nara',
    description: 'Preencher o endereço do escritório/decorado nas variáveis da Nara e confirmar ao cliente.',
    priority: 'high',
    status: 'pending',
    due_at: dueAt,
    created_by_kind: 'ai',
    dedupe_key: dedupeKey,
    metadata: { source: 'nara_agenda', missing: 'office_address' },
  });
  if (error) throw error;
  return true;
}

export async function maybeScheduleAgendaFromAi(args: { admin: AdminClient; organizationId: string; lead: Lead; turn: AiTurn; lastUserMessage: string; officeAddress?: string; weekdayHours?: string; saturdayHours?: string; }): Promise<AgendaAiResult> {
  const rows = await recentConversation(args.admin,args.lead.id,
    typeof args.lead.metadata?.nara_reset_at === 'string' ? args.lead.metadata.nara_reset_at : undefined);
  const chatHistory: AgendaConversationMessage[] = rows.map((row) => ({
    role: row.direction === 'in' ? 'user' : 'assistant',
    content: row.body,
  }));
  if (!shouldHandleAgendaTurn(chatHistory, args.lastUserMessage)) return {status:'none'};

  // Data/hora precisam ter sido informados pelo contato, nunca inventados na resposta da IA.
  const userText = rows.filter((row) => row.direction === 'in').slice(-6).map((row) => row.body).join('\n');
  const action = agendaActionFromText(args.lastUserMessage);
  const current = normalize(args.lastUserMessage);
  const { data: existing, error: existingError } = await args.admin.from('agenda_events')
    .select('id,assigned_to,starts_at,ends_at').eq('organization_id',args.organizationId)
    .eq('lead_id',args.lead.id).eq('status','scheduled').gte('starts_at',new Date().toISOString())
    .order('starts_at',{ascending:true}).limit(1).maybeSingle();
  if (existingError) throw existingError;

  if (existing && action !== 'reschedule' && action !== 'cancel') return {status:'none'};
  if (action === 'cancel' && existing) {
    const {error} = await args.admin.from('agenda_events').update({status:'cancelled'}).eq('id',existing.id).eq('status','scheduled');
    if (error) throw error;
    return {status:'cancelled',message:'Sua visita foi cancelada no CRM. Se quiser marcar outra data, é só me avisar.'};
  }
  if (!args.officeAddress?.trim()) {
    const createdTask = await ensureOfficeAddressTask(args.admin, args.organizationId, args.lead);
    return createdTask
      ? {status:'needs_details',message:'Vou pedir ao time para confirmar o endereço do escritório antes de marcar sua visita.'}
      : {status:'none'};
  }
  const date = parseDateFromText(args.lastUserMessage)
    || (action === 'reschedule' ? null : parseDateFromText(userText));
  const time = parseTimeFromText(args.lastUserMessage)
    || (action === 'reschedule' ? null : parseTimeFromText(userText));
  if (!date) return {status:'needs_details',message:'Qual dia você prefere para a visita?'};
  const candidates = await candidateMembers(args.admin,args.organizationId,args.lead.owner_id);
  if (!candidates.length) return {status:'needs_details',message:'Vou pedir ao time para confirmar quem ficará responsável pela visita.'};
  if (!time) {
    const hours = officeHours(date,args.weekdayHours,args.saturdayHours);
    if (!hours) return {status:'needs_details',message:'Ainda não tenho o expediente desse dia confirmado. Vou pedir ao time para combinar um horário com você.'};
    const preferred = /\bmanha\b/.test(current) ? [9,10,11] : /\btarde\b/.test(current) ? [14,15,16] : [];
    const slots = preferred.length ? preferred.map((h)=>h*60) : Array.from({length:Math.max(0,Math.floor((hours.close-hours.open-60)/60)+1)},(_,i)=>hours.open+i*60);
    const free:string[]=[];
    for (const slot of slots) {
      if (slot < hours.open || slot+60 > hours.close) continue;
      const label=`${String(Math.floor(slot/60)).padStart(2,'0')}:${String(slot%60).padStart(2,'0')}`;
      const start=slotStartIso(date,label); const end=new Date(new Date(start).getTime()+60*60_000).toISOString();
      if (new Date(start).getTime()<=Date.now()) continue;
      for (const id of candidates) {
        if (!(await findAgendaConflicts({organizationId:args.organizationId,assignedTo:id,startsAt:start,endsAt:end})).length) {free.push(label);break;}
      }
      if (free.length===3) break;
    }
    return free.length ? {status:'options',message:`Tenho estes horários livres em ${date.split('-').reverse().join('/')}: ${free.join(', ')}. Qual você prefere?`}
      : {status:'conflict',message:'Não encontrei horários livres nesse período. Qual outro dia funciona para você?'};
  }
  const minutes = durationMinutes(userText);
  if (!withinOfficeHours(date,time,minutes,args.weekdayHours,args.saturdayHours)) return {status:'needs_details',message:'Esse horário está fora do expediente confirmado do escritório. Qual outro horário você prefere?'};
  const startsAt = new Date(`${date}T${time}:00-03:00`);
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()-5*60_000)
    return {status:'needs_details',message:'Esse horário já passou. Qual outro dia e horário funciona melhor?'};
  const endsAt = new Date(startsAt.getTime()+minutes*60_000);
  const startsIso = startsAt.toISOString(); const endsIso = endsAt.toISOString();
  const {data:duplicate} = await args.admin.from('agenda_events').select('id,assigned_to,starts_at,ends_at')
    .eq('organization_id',args.organizationId).eq('lead_id',args.lead.id).eq('status','scheduled')
    .eq('starts_at',startsIso).maybeSingle();
  if (duplicate) return {status:'created',eventId:duplicate.id,assignedTo:duplicate.assigned_to,startsAt:duplicate.starts_at,endsAt:duplicate.ends_at};
  let assignedTo:string|null = null; let preferredBusy = false;
  for (const userId of candidates) {
    const conflicts = await findAgendaConflicts({organizationId:args.organizationId,assignedTo:userId,startsAt:startsIso,endsAt:endsIso});
    if (!conflicts.length) {assignedTo=userId;break;}
    if (userId===args.lead.owner_id) preferredBusy=true;
  }
  if (!assignedTo) return {status:'conflict',message:preferredBusy
    ? 'Esse horário já está ocupado na agenda do responsável. Pode me passar outro horário?'
    : 'Esse horário está ocupado na agenda da equipe. Pode me passar outro horário?'};
  const mode = appointmentMode(userText);
  const type = appointmentType(userText);
  const label = type==='apresentacao'?'Apresentação':type==='visita'?'Visita':type==='ligacao'?'Ligação':'Reunião';
  const {data:event,error} = await args.admin.from('agenda_events').insert({
    organization_id:args.organizationId,lead_id:args.lead.id,assigned_to:assignedTo,created_by_kind:'ai',
    agent:args.lead.kind==='cliente'?'nara':'plantao',title:`${label} · ${args.lead.name}`,
    description:args.turn.summary||args.turn.next_action||null,event_type:type,meeting_mode:mode,
    location: mode==='presencial' ? args.officeAddress || 'Escritório da Bossa (endereço a confirmar)' : null,
    starts_at:startsIso,ends_at:endsIso,metadata:{source:'whatsapp_ai',lead_name:args.lead.name,
      last_user_message:args.lastUserMessage,ai_summary:args.turn.summary},
  }).select('id,assigned_to,starts_at,ends_at').single();
  if (error) {
    if (error.code==='23P01') return {status:'conflict',message:'Esse horário acabou de ser ocupado. Pode me informar outra opção?'};
    throw error;
  }
  if (existing && existing.id!==event.id && action === 'reschedule') {
    const {error:cancelError}=await args.admin.from('agenda_events').update({status:'cancelled'}).eq('id',existing.id).eq('status','scheduled');
    if (cancelError) throw cancelError;
  }
  return {status:'created',eventId:event.id,assignedTo:event.assigned_to,startsAt:event.starts_at,endsAt:event.ends_at};
}
