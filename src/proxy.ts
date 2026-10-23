import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { isAllowedHomologationPath, isHomologation } from '@/lib/homologation/policy';
import { getHomologationPreflight } from '@/lib/homologation/server';

export async function proxy(request: NextRequest) {
  if (isHomologation()) {
    const path = request.nextUrl.pathname;
    if (path === '/api/homologation/preflight') return NextResponse.next();
    const report = await getHomologationPreflight();
    if (!report.writesAllowed || !isAllowedHomologationPath(path)) {
      return NextResponse.json({ ...report, writesAllowed: false,
        blockers: [...report.blockers, ...(isAllowedHomologationPath(path) ? [] : ['external-effect-route-blocked'])] },
      { status: report.writesAllowed ? 403 : 503, headers: {
        'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      } });
    }
    // The real local app, not an external reverse proxy, protects action POSTs and browser egress.
    const response = path.startsWith('/_next/static/') || path === '/_next/image'
      || ['/favicon.ico', '/crm-theme.js', '/bossa-logo.png'].includes(path)
      ? NextResponse.next() : await updateSession(request);
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:54521; font-src 'self' data:; media-src 'self' blob: http://127.0.0.1:54521; connect-src 'self' http://127.0.0.1:54521 ws://127.0.0.1:54521; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'");
    return response;
  }
  if (request.nextUrl.pathname === '/crm-theme.js' || request.nextUrl.pathname.startsWith('/_next/static/') || request.nextUrl.pathname.startsWith('/_next/image')
      || /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(request.nextUrl.pathname)) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ['/:path*'],
};
