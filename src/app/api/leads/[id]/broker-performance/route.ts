import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:'Sessão expirada'},{status:401});
 const {id}=await params;
 const {data:lead,error}=await db.from('leads').select('id,organization_id').eq('id',id).eq('kind','corretor').maybeSingle();
 if(error||!lead)return NextResponse.json({error:'Corretor não encontrado'},{status:404});
 const [events,proposals]=await Promise.all([
 db.from('broker_business_events').select('*').eq('organization_id',lead.organization_id).eq('lead_id',id).order('occurred_on',{ascending:false}).limit(1000),
 db.from('proposals').select('id,proposal_number,status,proposed_price,snapshot,created_at').eq('organization_id',lead.organization_id).eq('lead_id',id).order('created_at',{ascending:false}).limit(1000)]);
 if(events.error||proposals.error)return NextResponse.json({error:'Falha ao carregar registros'},{status:500});
 return NextResponse.json({events:events.data,proposals:proposals.data});
}
