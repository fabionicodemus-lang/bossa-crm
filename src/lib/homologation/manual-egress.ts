import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { AsyncLocalStorage } from 'node:async_hooks';
import { inspectManualPilot, assertPilotRequest } from './manual-pilot';
const deny = () => {throw Error('MANUAL_PILOT_EGRESS_BLOCKED');};
export function installPilotNetworkGuard() {
  const state = globalThis as typeof globalThis & {__bossaManualPilotGuard?: boolean};
  if (state.__bossaManualPilotGuard) return;
  const transportContext = new AsyncLocalStorage<boolean>();
  const allowed = (o: {host?: string;hostname?: string;port?: string|number;path?: string;servername?: string;rejectUnauthorized?: boolean}) =>
    transportContext.getStore() === true && inspectManualPilot().ready && !o.path && (o.hostname??o.host)==='okhtfibuexfsgkobjxtu.supabase.co'
      && Number(o.port)===443 && o.rejectUnauthorized!==false && (!o.servername||o.servername==='okhtfibuexfsgkobjxtu.supabase.co');
  const options = (args: unknown[]) => {
    let first = args[0];if(Array.isArray(first))first=first[0];
    return (typeof first==='object'&&first!==null?first:{port:first,host:args[1]}) as Parameters<typeof allowed>[0];
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function(this: net.Socket,...args:unknown[]) {
    if (!allowed(options(args))) return deny();
    return Reflect.apply(connect,this,args);
  } as typeof connect;
  const tlsConnect = tls.connect;
  tls.connect = ((...args:unknown[])=>{if(!allowed(options(args)))return deny();return Reflect.apply(tlsConnect,tls,args);}) as typeof tlsConnect;
  http.request=deny;http.get=deny;https.request=deny;https.get=deny;
  const transport=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    if (!inspectManualPilot().ready) return deny();
    const headers = assertPilotRequest(input,init);
    return transportContext.run(true,()=>transport(input,{...init,headers,redirect:'error'}));
  };
  Object.defineProperty(state,'__bossaManualPilotGuard',{value:true,writable:false,configurable:false});
}
