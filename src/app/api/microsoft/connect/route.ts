import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCurrentContext } from '@/lib/auth';
import { microsoftAuthorizeUrl, microsoftIsConfigured } from '@/lib/microsoft-calendar';

export const runtime = 'nodejs';

export async function GET() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context) return NextResponse.redirect('https://crm.bossaempreendimentos.com.br/login');
  if (!['admin', 'comercial'].includes(context.role)) return NextResponse.redirect('https://crm.bossaempreendimentos.com.br/agenda?microsoft=forbidden');
  if (!microsoftIsConfigured()) return NextResponse.redirect('https://crm.bossaempreendimentos.com.br/agenda?microsoft=setup');
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const response = NextResponse.redirect(microsoftAuthorizeUrl(state, challenge));
  const options = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/api/microsoft', maxAge: 600 };
  response.cookies.set('bossa_ms_state', state, options);
  response.cookies.set('bossa_ms_verifier', verifier, options);
  response.cookies.set('bossa_ms_user', context.userId, options);
  return response;
}
