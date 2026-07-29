import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptToken, getWhatsAppTemplates, type MetaTemplateComponent } from '@/lib/whatsapp';

type Channel = 'clientes' | 'corretores';

function countVariables(text: string) {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function componentOf(components: MetaTemplateComponent[], type: string) {
  return components.find((component) => String(component.type).toUpperCase() === type);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role').eq('user_id', user.id).limit(1).maybeSingle();
  if (!membership || membership.role === 'viewer') {
    return NextResponse.json({ error: 'Você não possui permissão para sincronizar modelos.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { channel?: unknown };
  const channel = String(body.channel ?? '') as Channel;
  if (!['clientes', 'corretores'].includes(channel)) {
    return NextResponse.json({ error: 'Canal inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: connection } = await admin.from('whatsapp_connections')
    .select('id,waba_id,encrypted_access_token,status')
    .eq('organization_id', membership.organization_id)
    .eq('channel', channel)
    .eq('status', 'connected')
    .maybeSingle();
  if (!connection) return NextResponse.json({ error: 'O canal selecionado não está conectado.' }, { status: 409 });

  try {
    const result = await getWhatsAppTemplates({
      wabaId: connection.waba_id,
      accessToken: decryptToken(connection.encrypted_access_token),
    });
    const now = new Date().toISOString();
    const rows = (result.data ?? []).map((template) => {
      const components = template.components ?? [];
      const header = componentOf(components, 'HEADER');
      const bodyComponent = componentOf(components, 'BODY');
      const footer = componentOf(components, 'FOOTER');
      const buttons = componentOf(components, 'BUTTONS');
      const bodyText = String(bodyComponent?.text ?? '');
      const quality = typeof template.quality_score === 'string'
        ? template.quality_score
        : String(template.quality_score?.score ?? '');
      return {
        organization_id: membership.organization_id,
        whatsapp_connection_id: connection.id,
        meta_template_id: template.id ?? null,
        name: template.name,
        language: template.language,
        category: template.category,
        status: template.status,
        quality_score: quality || null,
        header_format: String(header?.format ?? 'NONE').toUpperCase(),
        body_text: bodyText,
        footer_text: footer?.text ? String(footer.text) : null,
        components,
        buttons: buttons?.buttons ?? [],
        variable_count: countVariables(bodyText),
        last_synced_at: now,
      };
    });

    if (rows.length) {
      const { error } = await admin.from('whatsapp_templates')
        .upsert(rows, { onConflict: 'whatsapp_connection_id,name,language' });
      if (error) throw error;
    }

    const { data: templates, error: readError } = await admin.from('whatsapp_templates')
      .select('*')
      .eq('organization_id', membership.organization_id)
      .eq('whatsapp_connection_id', connection.id)
      .order('status')
      .order('name');
    if (readError) throw readError;

    return NextResponse.json({ templates: templates ?? [], synced: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível sincronizar os modelos da Meta.' }, { status: 500 });
  }
}
