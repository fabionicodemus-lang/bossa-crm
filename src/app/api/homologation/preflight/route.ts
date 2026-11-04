import { manualPilot, inspectManualPilot } from '@/lib/homologation/manual-pilot';
import { NextResponse } from 'next/server';
import { getHomologationPreflight } from '@/lib/homologation/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  if (manualPilot()) {
    const config = inspectManualPilot();
    return NextResponse.json({mode:'manual-pilot',configured:config.ready,commit:config.commit,deploymentOrigin:config.origin,projectId:process.env.VERCEL_PROJECT_ID,requires:'validated-human-session-and-rls',humanAcceptanceAllowed:false,blockers:config.blockers},
      {status:config.ready?200:503,headers:{'Cache-Control':'no-store'}});
  }
  const report = await getHomologationPreflight();
  return NextResponse.json(report, { status: report.writesAllowed ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } });
}
