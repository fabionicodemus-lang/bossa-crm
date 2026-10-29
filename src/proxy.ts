import { manualPilot, inspectManualPilot, manualPilotPath } from '@/lib/homologation/manual-pilot';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { inspectConfiguration, isAllowedHomologationPath, isHomologation } from '@/lib/homologation/policy';
import { getHomologationPreflight } from '@/lib/homologation/server';

export async function proxy(request: NextRequest) {
  if (manualPilot()) {
    const pilot = inspectManualPilot();
    if (!pilot.ready || !pilot.origin || request.headers.get('host') !== new URL(pilot.origin).host) return NextResponse.json({error:'Manual pilot configuration blocked',blockers:pilot.blockers},{status:503});
    if (!manualPilotPath(request.nextUrl.pathname,request.method)) return NextResponse.json({error:'Módulo indisponível no piloto manual.'},{status:403});
    if (request.nextUrl.pathname === '/') return NextResponse.redirect(new URL('/clientes',request.url));
    const response = request.nextUrl.pathname.startsWith('/_next/static/') || ['/bossa-logo.png','/favicon.ico','/crm-theme.js'].includes(request.nextUrl.pathname) ? NextResponse.next() : await updateSession(request);
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://okhtfibuexfsgkobjxtu.supabase.co/rest/v1/ https://okhtfibuexfsgkobjxtu.supabase.co/auth/v1/token https://okhtfibuexfsgkobjxtu.supabase.co/auth/v1/user https://okhtfibuexfsgkobjxtu.supabase.co/auth/v1/logout https://okhtfibuexfsgkobjxtu.supabase.co/auth/v1/.well-known/jwks.json; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    return response;
  }
  if (isHomologation()) {
    const path = request.nextUrl.pathname;
    const config = inspectConfiguration();
    if (config.remote && config.deploymentOrigin
        && request.headers.get('host') !== new URL(config.deploymentOrigin).host) {
      return NextResponse.json({ writesAllowed: false, humanAcceptanceAllowed: false, blockers: ['deployment-origin-mismatch'] },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } });
    }
    if (path === '/api/homologation/preflight') return NextResponse.next();
    const report = await getHomologationPreflight();
    if (!report.writesAllowed || !isAllowedHomologationPath(path)) {
      return NextResponse.json({ ...report, writesAllowed: false,
        blockers: [...report.blockers, ...(isAllowedHomologationPath(path) ? [] : ['external-effect-route-blocked'])] },
      { status: report.writesAllowed ? 403 : 503, headers: {
        'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      } });
    }
    const databaseOrigin = report.databaseOrigin!;
    const remote = report.status === 'remote-isolated-only';
    const connectSources = remote
      ? `${databaseOrigin}/rest/v1/ ${databaseOrigin}/auth/v1/token ${databaseOrigin}/auth/v1/user ${databaseOrigin}/auth/v1/logout`
      : `${databaseOrigin} ws://127.0.0.1:54521`;
    const mediaSource = remote ? '' : ` ${databaseOrigin}`;
    // The real local app, not an external reverse proxy, protects action POSTs and browser egress.
    const response = path.startsWith('/_next/static/') || path === '/_next/image'
      || ['/favicon.ico', '/crm-theme.js', '/bossa-logo.png'].includes(path)
      ? NextResponse.next() : await updateSession(request);
    response.headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${mediaSource}; font-src 'self' data:; media-src 'self' blob:${mediaSource}; connect-src 'self' ${connectSources}; form-action 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);
    return response;
  }
  if (request.nextUrl.pathname === '/crm-theme.js' || request.nextUrl.pathname.startsWith('/_next/static/') || request.nextUrl.pathname.startsWith('/_next/image')
      || /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(request.nextUrl.pathname)) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: ['/:path*'],
};
