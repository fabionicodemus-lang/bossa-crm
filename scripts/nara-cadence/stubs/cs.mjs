export const sent=[];
const provider={ listTemplates: async()=>({data:globalThis.REMOTE_TEMPLATES??[]}), createTemplate: async(t)=>({id:'t',status:'PENDING',category:'MARKETING'}),
  sendText: async(a)=>{sent.push({kind:'text',...a});return {messageId:'w'+sent.length,raw:{}}},
  sendTemplate: async(a)=>{sent.push({kind:'template',...a});return {messageId:'w'+sent.length,raw:{}}} };
export function channelAccess(){return {provider,accessToken:'x',wabaId:'w',phoneNumberId:'p'}}
export async function findChannelByRole(){return {id:'ch',organization_id:'org',legacy_connection_id:null,waba_id:'w'}}
export async function findChannelById(){return null}
export async function ensureConversation(){return {id:'conv'}}
