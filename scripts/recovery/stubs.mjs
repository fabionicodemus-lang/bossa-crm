export const getCurrentContext=async()=>globalThis.__recoveryTest.context;
export const createClient=async()=>globalThis.__recoveryTest.db;
export async function POST(request){const s=globalThis.__recoveryTest;s.agenda.push({body:await request.json(),key:request.headers.get('Idempotency-Key')});if(s.agendaFails)return Response.json({error:'Availability not confirmed'},{status:503});s.current.state='committed';s.current.record={id:s.recordId,title:'Visita confirmada'};return Response.json({event:s.current.record,warning:'Confira o Outlook'},{status:202});}
