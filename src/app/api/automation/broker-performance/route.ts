import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runBrokerPerformance } from '@/lib/broker-performance';
export const runtime='nodejs';
export const maxDuration=120;
async function run(request:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret || (request.headers.get('authorization')!==`Bearer ${secret}` && request.headers.get('x-cron-secret')!==secret))return NextResponse.json({error:'Não autorizado'},{status:401});
 return NextResponse.json({ok:true,results:await runBrokerPerformance(createAdminClient(),new URL(request.url).searchParams.get('enqueue')==='1')});
}
export const GET=run;
export const POST=run;
