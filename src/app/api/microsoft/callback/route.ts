import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { encryptMicrosoftToken, microsoftCurrentUser, microsoftExchangeCode, microsoftIsConfigured } from '@/lib/microsoft-calendar';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
const BASE = 'https://crm.bossaempreendimentos.com.br';
const CORPORATE_DOMAIN = '@bossaempreendimentos.com.br';
function equal(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function redirectWithStatus(status: string) {
  const response = NextResponse.redirect(`${BASE}/agenda?microsoft=${encodeURIComponent(status)}`);
  for (const name of ['bossa_ms_state','bossa_ms_verifier','bossa_ms_user']) {
    response.cookies.set(name, '', { path: '/api/microsoft', maxAge: 0, httpOnly: true, secure: true, sameSite: 'lax' });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return redirectWithStatus('login');
  const state = request.nextUrl.searchParams.get('state') || '';
  const storedState = request.cookies.get('bossa_ms_state')?.value || '';
  const verifier = request.cookies.get('bossa_ms_verifier')?.value || '';
  const storedUser = request.cookies.get('bossa_ms_user')?.value || '';
  if (!state || !storedState || !verifier || !equal(state, storedState) || !equal(context.userId, storedUser)) return redirectWithStatus('invalid_state');
  if (request.nextUrl.searchParams.get('error')) return redirectWithStatus('denied');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || !microsoftIsConfigured()) return redirectWithStatus('setup');
  try {
    const tokens = await microsoftExchangeCode(code, verifier);
    const person = await microsoftCurrentUser(tokens.access_token!);
    const options = [person.mail, person.userPrincipalName].filter(Boolean).map((value) => String(value).trim().toLowerCase());
    const email = options.find((value) => value.endsWith(CORPORATE_DOMAIN)) || '';
    // Aceita o login corporativo da Bossa mesmo quando o usuário acessa o CRM com outro e-mail.
    // Nenhum e-mail pessoal ou de organização externa pode ser associado ao CRM.
    if (!person.id || !email) return redirectWithStatus('wrong_account');
    const tenant = process.env.MICROSOFT_TENANT_ID || 'organizations';
    const admin = createAdminClient();
    const { error } = await admin.from('microsoft_calendar_connections').upsert({
      organization_id: context.organization.id, user_id: context.userId,
      microsoft_user_id: person.id, microsoft_email: email, tenant_id: tenant,
      access_token_ciphertext: encryptMicrosoftToken(tokens.access_token!),
      refresh_token_ciphertext: encryptMicrosoftToken(tokens.refresh_token!),
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      last_error: null,
    }, { onConflict: 'organization_id,user_id' });
    if (error) throw error;
    return redirectWithStatus('connected');
  } catch (error) {
    console.error('[microsoft oauth callback]', error instanceof Error ? error.message : 'Erro');
    return redirectWithStatus('error');
  }
}
