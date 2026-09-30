import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@/lib/types';
import { isBrokerRoutingSignal, normalizeNaraRoutingText } from '@/lib/nara-contact-routing';

type AdminClient = SupabaseClient;

type AutoRouteResult = {
  routedToGeneral: boolean;
  reason?: string;
};

const BLOCKED_STAGES = new Set(['agendado', 'pos_reuniao', 'proposta_negociacao', 'fechado_ganho', 'encerrado']);

function operationalReason(text: string): string | null {
  const value = normalizeNaraRoutingText(text);
  if (!value || isBrokerRoutingSignal(value)) return null;

  if (/\b(?:setor de compras|departamento de compras|suprimentos|setor de suprimentos)\b/.test(value)) {
    return 'Contato buscando Compras/Suprimentos';
  }
  if (/\b(?:somos|sou|falo da|falo pela|venho em nome da|trabalho na|atuamos com)\b.{0,90}\b(?:empreiteira|engenharia|topografia|climatizacao|solucoes eletricas|quadros eletricos|andaimes|instalacoes de gas|rede de gas|pinturas|gesso|vidros|revestimentos|porcelanatos|compensados|bombas|motobombas|geradores|laudos|pos-obra|manual do proprietario)\b/.test(value)) {
    return 'Fornecedor/prestador técnico para obras';
  }
  if (/\b(?:oferecemos|prestamos|trabalhamos com|gostaria de apresentar)\b.{0,100}\b(?:mao de obra|servicos? de obra|servicos? tecnicos|pintura|gesso|pedreiro|encanador|impermeabilizacao|alvenaria|reboco|contrapiso|ceramica|instalacao|manutencao)\b/.test(value)) {
    return 'Prestador de serviço / mão de obra';
  }
  if (/\b(?:fornecedor|fornecedora|somos fornecedores|fabricamos|fornecemos)\b.{0,100}\b(?:construcao|obra|construtora|material|equipamento|produto|suprimentos)\b/.test(value)) {
    return 'Fornecedor de materiais/equipamentos';
  }
  if (/\b(?:marmita|marmitaria|bolos?|sobremesas?|alimentacao)\b/.test(value)
      && /\b(?:fornecedor|empresa|trabalhamos|fazemos|vendemos|atendemos)\b/.test(value)) {
    return 'Fornecedor de alimentação';
  }
  if (/\b(?:social media|agencia de marketing|equipe de midia|midias|marketing e divulgacao|fortalecimento de marcas)\b/.test(value)) {
    return 'Fornecedor de marketing/mídia';
  }
  if (/\b(?:software cypecad|demonstracao.*software|software.*engenharia)\b/.test(value)) {
    return 'Fornecedor de software de engenharia';
  }
  if (/\b(?:oficina|concessionaria|seguradora)\b/.test(value)
      && /\b(?:carro|veiculo|fiorino|orcamento|franquia|conserto)\b/.test(value)) {
    return 'Contato operacional de veículo/seguro';
  }
  if (/\b(?:responsavel tecnico|setor de engenharia|engenheiro da construtora)\b/.test(value)
      && /\b(?:apresentar|servico|produto|orcamento|fornecedor|parceria|tabela comercial)\b/.test(value)) {
    return 'Fornecedor/prestador buscando Engenharia';
  }
  return null;
}

export function clearlyOperationalNonBrokerReason(text: string): string | null {
  return operationalReason(text);
}

export async function autoRouteEarlyOperationalBroker(args: {
  admin: AdminClient;
  lead: Lead;
  sourceMessageId: string;
}): Promise<AutoRouteResult> {
  if (args.lead.kind !== 'corretor') return { routedToGeneral: false };
  if (args.lead.creci || BLOCKED_STAGES.has(args.lead.stage)) return { routedToGeneral: false };
  if (args.lead.priority_class === 'A1' || args.lead.priority_class === 'A2') return { routedToGeneral: false };

  const [{ data: source }, { data: recentMessages, count }, { count: proposalCount }] = await Promise.all([
    args.admin.from('messages').select('body').eq('id', args.sourceMessageId).maybeSingle(),
    args.admin.from('messages')
      .select('body,direction', { count: 'exact' })
      .eq('lead_id', args.lead.id)
      .order('created_at', { ascending: false })
      .limit(12),
    args.admin.from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', args.lead.id),
  ]);

  if ((proposalCount ?? 0) > 0 || (count ?? 0) > 12) return { routedToGeneral: false };

  const transcript = (recentMessages ?? [])
    .map((row) => String(row.body ?? ''))
    .filter(Boolean)
    .join('\n');

  if (isBrokerRoutingSignal(transcript)) return { routedToGeneral: false };

  const reason = operationalReason(`${String(source?.body ?? '')}\n${transcript}`);
  if (!reason) return { routedToGeneral: false };

  const now = new Date().toISOString();
  const metadata = {
    ...(args.lead.metadata ?? {}),
    auto_kind_triage_status: 'operational_non_broker',
    auto_kind_triage_reason: reason,
    auto_kind_triage_at: now,
    auto_kind_triage_source_message_id: args.sourceMessageId,
    contact_kind_routed_from: 'corretor',
    contact_kind_routed_to: 'geral',
    contact_kind_routed_at: now,
  };

  const { error } = await args.admin.from('leads').update({
    kind: 'geral',
    stage: 'novo_triagem',
    priority_class: null,
    ai_enabled: false,
    automation_paused: true,
    owner_mode: 'human',
    metadata,
    updated_at: now,
  }).eq('id', args.lead.id);
  if (error) throw error;

  await args.admin.from('lead_tasks')
    .update({ status: 'cancelled', completed_at: now })
    .eq('lead_id', args.lead.id)
    .eq('created_by_kind', 'ai')
    .in('status', ['pending', 'overdue']);

  await args.admin.from('activities').insert({
    organization_id: args.lead.organization_id,
    lead_id: args.lead.id,
    type: 'reclassificacao_pipeline',
    title: 'Contato movido automaticamente para Geral',
    description: reason,
    metadata: {
      source: 'whatsapp_auto_kind_triage',
      previous_kind: 'corretor',
      new_kind: 'geral',
      reason,
      source_message_id: args.sourceMessageId,
    },
  });

  return { routedToGeneral: true, reason };
}
