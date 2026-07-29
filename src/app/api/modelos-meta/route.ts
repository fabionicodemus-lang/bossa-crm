import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createWhatsAppTemplate,
  decryptToken,
  uploadMetaTemplateMedia,
  type MetaTemplateComponent,
} from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 60;

type TemplateCategory = 'MARKETING' | 'UTILITY';
type HeaderFormat = 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
type ButtonInput = {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  value?: string;
  example?: string;
};

const mediaTypes: Record<Exclude<HeaderFormat, 'NONE' | 'TEXT'>, string[]> = {
  IMAGE: ['image/jpeg', 'image/png'],
  VIDEO: ['video/mp4', 'video/3gpp'],
  DOCUMENT: [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
};

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '').trim();
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 512);
}

function variableCount(value: string) {
  const numbers = [...value.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  if (!numbers.length) return 0;
  const unique = [...new Set(numbers)].sort((a, b) => a - b);
  if (unique.some((number, index) => number !== index + 1)) {
    throw new Error('As variáveis do corpo devem ser sequenciais: {{1}}, {{2}}, {{3}}.');
  }
  return unique[unique.length - 1];
}

function parseJsonArray<T>(value: string, label: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed as T[];
  } catch {
    throw new Error(`${label} inválidos.`);
  }
}

function validatedButtons(value: string) {
  const source = parseJsonArray<ButtonInput>(value, 'Botões');
  if (source.length > 3) throw new Error('Use no máximo três botões.');
  let urlCount = 0;
  let phoneCount = 0;
  let quickCount = 0;

  return source.map((button) => {
    const label = String(button.text ?? '').trim().slice(0, 25);
    if (!label) throw new Error('Informe o texto de todos os botões.');

    if (button.type === 'QUICK_REPLY') {
      quickCount++;
      if (quickCount > 3) throw new Error('Use no máximo três respostas rápidas.');
      return { type: 'QUICK_REPLY', text: label };
    }

    if (button.type === 'URL') {
      urlCount++;
      if (urlCount > 2) throw new Error('Use no máximo dois botões de site.');
      const url = String(button.value ?? '').trim();
      if (!/^https:\/\//i.test(url)) throw new Error('O botão de site deve usar uma URL HTTPS.');
      const result: Record<string, unknown> = { type: 'URL', text: label, url };
      if (url.includes('{{1}}')) {
        const example = String(button.example ?? '').trim();
        if (!example) throw new Error('Informe um exemplo para a variável do botão de site.');
        result.example = [example];
      }
      return result;
    }

    if (button.type === 'PHONE_NUMBER') {
      phoneCount++;
      if (phoneCount > 1) throw new Error('Use no máximo um botão de telefone.');
      const phone = String(button.value ?? '').replace(/[^\d+]/g, '');
      if (phone.replace(/\D/g, '').length < 10) throw new Error('Informe um telefone válido com DDI.');
      return { type: 'PHONE_NUMBER', text: label, phone_number: phone };
    }

    throw new Error('Tipo de botão inválido.');
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401 });

  const { data: membership } = await supabase.from('memberships')
    .select('organization_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Somente administradores podem criar modelos na Meta.' }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const connectionId = text(form, 'connection_id');
    const name = normalizeName(text(form, 'name'));
    const language = text(form, 'language') || 'pt_BR';
    const category = text(form, 'category').toUpperCase() as TemplateCategory;
    const headerFormat = text(form, 'header_format').toUpperCase() as HeaderFormat;
    const headerText = text(form, 'header_text');
    const bodyText = text(form, 'body_text');
    const footerText = text(form, 'footer_text');
    const examples = parseJsonArray<string>(text(form, 'body_examples'), 'Exemplos das variáveis');
    const buttons = validatedButtons(text(form, 'buttons'));

    if (!connectionId) throw new Error('Selecione o canal do WhatsApp.');
    if (name.length < 2) throw new Error('Informe um nome válido para o modelo.');
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error('O nome deve conter apenas letras minúsculas, números e sublinhado.');
    if (!['MARKETING', 'UTILITY'].includes(category)) throw new Error('Categoria inválida.');
    if (!['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) throw new Error('Cabeçalho inválido.');
    if (!/^[a-z]{2,3}_[A-Z]{2}$/.test(language)) throw new Error('Idioma inválido.');
    if (!bodyText || bodyText.length > 1024) throw new Error('O corpo deve ter entre 1 e 1.024 caracteres.');
    if (footerText.length > 60) throw new Error('O rodapé pode ter no máximo 60 caracteres.');

    const count = variableCount(bodyText);
    if (examples.length !== count || examples.some((example) => !String(example).trim())) {
      throw new Error(`Informe exatamente ${count} exemplo(s) para as variáveis do corpo.`);
    }

    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin.from('whatsapp_connections')
      .select('id,waba_id,encrypted_access_token,status,channel')
      .eq('id', connectionId)
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection || connection.status !== 'connected') throw new Error('O canal selecionado não está conectado.');

    const accessToken = decryptToken(connection.encrypted_access_token);
    const components: MetaTemplateComponent[] = [];

    if (headerFormat === 'TEXT') {
      if (!headerText || headerText.length > 60) throw new Error('O cabeçalho de texto deve ter entre 1 e 60 caracteres.');
      if (/\{\{\d+\}\}/.test(headerText)) throw new Error('Nesta versão, o cabeçalho de texto deve ser fixo, sem variáveis.');
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)) {
      const fileValue = form.get('header_file');
      const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
      if (!file) throw new Error('Selecione o arquivo de exemplo do cabeçalho.');
      const accepted = mediaTypes[headerFormat as keyof typeof mediaTypes];
      if (!accepted.includes(file.type)) throw new Error(`Formato de arquivo incompatível com cabeçalho ${headerFormat}.`);
      if (file.size > 100 * 1024 * 1024) throw new Error('O arquivo pode ter no máximo 100 MB.');
      const handle = await uploadMetaTemplateMedia({
        accessToken,
        fileName: file.name,
        fileType: file.type,
        bytes: await file.arrayBuffer(),
      });
      components.push({ type: 'HEADER', format: headerFormat, example: { header_handle: [handle] } });
    }

    const bodyComponent: MetaTemplateComponent = { type: 'BODY', text: bodyText };
    if (count > 0) bodyComponent.example = { body_text: [examples.map((example) => String(example).trim())] };
    components.push(bodyComponent);
    if (footerText) components.push({ type: 'FOOTER', text: footerText });
    if (buttons.length) components.push({ type: 'BUTTONS', buttons });

    const result = await createWhatsAppTemplate({
      wabaId: connection.waba_id,
      accessToken,
      name,
      language,
      category,
      components,
    });

    const now = new Date().toISOString();
    const row = {
      organization_id: membership.organization_id,
      whatsapp_connection_id: connection.id,
      meta_template_id: result.id ?? null,
      name,
      language,
      category: result.category ?? category,
      status: result.status ?? 'PENDING',
      quality_score: null,
      rejected_reason: null,
      header_format: headerFormat,
      body_text: bodyText,
      footer_text: footerText || null,
      components,
      buttons,
      variable_count: count,
      source: 'CRM',
      submitted_at: now,
      last_synced_at: now,
    };

    const { data: template, error: saveError } = await admin.from('whatsapp_templates')
      .upsert(row, { onConflict: 'whatsapp_connection_id,name,language' })
      .select('*')
      .single();
    if (saveError) throw saveError;

    return NextResponse.json({ template, meta: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o modelo para a Meta.' }, { status: 400 });
  }
}
