import { NextResponse } from 'next/server';
import { getHomologationPreflight } from '@/lib/homologation/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const report = await getHomologationPreflight();
  return NextResponse.json(report, { status: report.writesAllowed ? 200 : 503,
    headers: { 'Cache-Control': 'no-store, max-age=0', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } });
}
