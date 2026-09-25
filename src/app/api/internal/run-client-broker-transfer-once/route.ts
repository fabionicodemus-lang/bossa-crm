import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { routeClientBrokerFromBroadcast } from '@/lib/whatsapp/clientBrokerTransfer';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TOKEN_HASH = 'ca92d801319c30cab7956cd10423d479c7b1bb794972e456c42104be9fc759d5';

const TARGETS = [
  {
    leadId: '29fce288-331a-4ef6-aa70-45b8a7c467b9',
    sourceMessageId: 'b211e7b6-65eb-4402-87de-a5c273d9e2b9',
    sourceText: 'Eu sou corretor da Juliana Imóveis e já temos seus imóveis em nosso sistema',
    broadcastId: '0c63c931-c557-4425-8885-bd6ed71d4fcb',
  },
  {
    leadId: '324418f8-3e1d-4478-8f90-6aec6adc0435',
    sourceMessageId: '9be060e2-f5d7-4005-ae84-d1bc329c9df3',
    sourceText: 'marliwursterimoveis agradece seu contato. Litoral Catarinense qualidade de vida e investimento seguro creci 59131F',
    broadcastId: '0c63c931-c557-4425-8885-bd6ed71d4fcb',
  },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const digest = createHash('sha256').update(token).digest('hex');
  if (digest !== TOKEN_HASH) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const results = [];
  for (const target of TARGETS) {
    const { data: lead } = await admin.from('leads').select('*').eq('id', target.leadId).maybeSingle();
    if (!lead) {
      results.push({ leadId: target.leadId, error: 'Lead não encontrado.' });
      continue;
    }
    try {
      const result = await routeClientBrokerFromBroadcast({
        admin,
        lead,
        sourceMessageId: target.sourceMessageId,
        sourceText: target.sourceText,
        broadcastId: target.broadcastId,
        force: true,
      });
      results.push({ leadId: target.leadId, result });
    } catch (error) {
      results.push({
        leadId: target.leadId,
        error: error instanceof Error ? error.message : 'Falha desconhecida.',
      });
    }
  }

  return NextResponse.json({ ok: true, results });
}
