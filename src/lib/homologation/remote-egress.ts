import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { assertRemoteSupabaseRequest, inspectConfiguration, REMOTE_SUPABASE_ORIGIN } from './policy';
import { getHomologationPreflight } from './server';

type GuardGlobal = typeof globalThis & { __bossaHomologationNetworkGuard?: string };
const deny = () => { throw new Error('HOMOLOGATION_EGRESS_BLOCKED'); };

export function installRemoteNetworkGuard() {
  if ((globalThis as GuardGlobal).__bossaHomologationNetworkGuard === 'remote-supabase-https-v1') return;
  // No direct HTTP client, Unix socket, SMTP, raw IP or alternate host/port is authorized.
  // Undici fetch reaches the pinned TLS host through the guarded net/tls connectors.
  const allowed = (options: { host?: string; hostname?: string; port?: number | string; path?: string; servername?: string; rejectUnauthorized?: boolean }) => {
    const host = options.hostname ?? options.host;
    return !inspectConfiguration().blockers.length && !options.path && host === new URL(REMOTE_SUPABASE_ORIGIN).hostname
      && options.rejectUnauthorized !== false && Number(options.port) === 443 && (!options.servername || options.servername === host);
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    let first = args[0]; if (Array.isArray(first)) first = first[0];
    const options = typeof first === 'object' && first !== null ? first
      : { port: first, host: typeof args[1] === 'string' ? args[1] : undefined };
    if (!allowed(options as Parameters<typeof allowed>[0])) return deny();
    return Reflect.apply(connect, this, args);
  } as typeof connect;
  const tlsConnect = tls.connect;
  tls.connect = ((...args: unknown[]) => {
    const options = typeof args[0] === 'object' && args[0] !== null ? args[0]
      : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
    if (!allowed(options as Parameters<typeof allowed>[0])) return deny();
    return Reflect.apply(tlsConnect, tls, args);
  }) as typeof tlsConnect;
  http.request = deny; http.get = deny; https.request = deny; https.get = deny;
  const transport = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (inspectConfiguration().blockers.length) return deny();
    const url = assertRemoteSupabaseRequest(input, init, true);
    const diagnostic = url.pathname === '/rest/v1/rpc/bossa_homologation_preflight';
    if (diagnostic) {
      // This RPC's reviewed contract is read-only. It is the only request allowed before DB proof.
      if (init?.body !== '{}') return deny();
    } else if (!(await getHomologationPreflight()).writesAllowed) return deny();
    return transport(input, { ...init, redirect: 'error' });
  };
  Object.defineProperty(globalThis, '__bossaHomologationNetworkGuard', {
    value: 'remote-supabase-https-v1', writable: false, configurable: false,
  });
}
