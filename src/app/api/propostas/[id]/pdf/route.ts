import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProposalPdf, jpegDimensions, type ProposalPdfImage, type ProposalPdfScheduleRow } from '@/lib/simple-pdf';
import { BOSSA_LOGO_BASE64 } from '@/lib/brand-assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
}

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function jpegImage(bytes: Buffer): Promise<ProposalPdfImage | null> {
  const dimensions = jpegDimensions(bytes);
  return dimensions ? { bytes, ...dimensions } : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Usuário sem acesso à organização.' }, { status: 403 });

  const admin = createAdminClient();
  const { data: proposal, error: proposalError } = await admin.from('proposals')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (proposalError || !proposal) return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 });

  const [developmentResult, unitResult, leadResult, itemsResult] = await Promise.all([
    admin.from('developments').select('id,name,delivery_date,logo_path').eq('id', proposal.development_id).maybeSingle(),
    proposal.unit_id ? admin.from('development_units').select('unit_code').eq('id', proposal.unit_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    proposal.lead_id ? admin.from('leads').select('name,kind,company').eq('id', proposal.lead_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    admin.from('proposal_payment_items').select('kind,label,quantity,amount,start_date,interval_months,sort_order,metadata').eq('proposal_id', id).order('sort_order'),
  ]);

  if (developmentResult.error || !developmentResult.data) {
    return NextResponse.json({ error: 'O empreendimento da proposta não foi encontrado.' }, { status: 404 });
  }

  const development = developmentResult.data;
  const snapshot = (proposal.snapshot ?? {}) as Record<string, unknown>;
  const paymentPlan = (proposal.payment_plan ?? {}) as Record<string, unknown>;
  const clientName = String(snapshot.client_name ?? leadResult.data?.name ?? 'Cliente');
  const leadName = String(snapshot.lead_name ?? leadResult.data?.name ?? clientName);
  const origin = snapshot.origin === 'corretor'
    ? `Origem: corretor / imobiliária${leadResult.data?.company ? ` · ${leadResult.data.company}` : ''}`
    : 'Origem: cliente direto';

  const schedule: ProposalPdfScheduleRow[] = (itemsResult.data ?? []).map((item) => ({
    label: item.label || item.kind,
    quantity: String(item.quantity ?? 0),
    amount: money.format(numberValue(item.amount)),
    firstDue: formatDate(item.start_date),
    total: money.format(numberValue(item.amount) * numberValue(item.quantity)),
  }));

  const bossaBytes = Buffer.from(BOSSA_LOGO_BASE64, 'base64');
  const bossaLogo = await jpegImage(bossaBytes);
  if (!bossaLogo) return NextResponse.json({ error: 'O logo institucional não pôde ser carregado.' }, { status: 500 });

  let developmentLogo: ProposalPdfImage | null = null;
  if (development.logo_path) {
    const { data: logoBlob } = await admin.storage.from('development-files').download(development.logo_path);
    if (logoBlob) developmentLogo = await jpegImage(Buffer.from(await logoBlob.arrayBuffer()));
  }

  const proposedPrice = numberValue(proposal.proposed_price);
  const discountAmount = numberValue(proposal.discount_amount);
  const discountPercent = numberValue(snapshot.discount_percent);
  const pdf = createProposalPdf({
    proposalNumber: String(proposal.proposal_number),
    proposalDate: formatDate(String(snapshot.proposal_date ?? paymentPlan.proposal_date ?? proposal.created_at)),
    validity: formatDate(proposal.valid_until),
    clientName,
    originLabel: origin,
    leadName,
    developmentName: development.name,
    unitCode: String(snapshot.unit_code ?? unitResult.data?.unit_code ?? ''),
    deliveryDate: formatDate(String(snapshot.delivery_date ?? paymentPlan.delivery_date ?? development.delivery_date ?? '')),
    responsibleName: String(snapshot.responsible_name ?? 'Bossa Empreendimentos'),
    listPrice: money.format(numberValue(proposal.list_price)),
    proposedPrice: money.format(proposedPrice),
    discount: `${money.format(discountAmount)} · ${percent.format(discountPercent)}%`,
    paidUntilKeys: money.format(numberValue(snapshot.paid_until_keys_amount)),
    paidUntilKeysPercent: `${percent.format(numberValue(snapshot.paid_until_keys_percent))}%`,
    schedule,
    notes: proposal.notes ?? '',
    bossaLogo,
    developmentLogo,
  });

  const filename = `proposta-${proposal.proposal_number}-${safeFileName(clientName || development.name)}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
