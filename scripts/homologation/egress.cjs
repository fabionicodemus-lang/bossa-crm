/* eslint-disable @typescript-eslint/no-require-imports */
// Local synthetic tests ONLY. Also catches libraries using raw sockets instead of fetch.
// This is a safety boundary for this application, not a sandbox for arbitrary hostile code.
if (process.env.BOSSA_HOMOLOGATION_MODE !== 'local' || process.env.VERCEL_ENV) {
  throw new Error('HOMOLOGATION_LOCAL_PROCESS_REQUIRED');
}
const net = require('node:net'), tls = require('node:tls'), http = require('node:http'), https = require('node:https');
const allowed = (host, port) => ['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1'].includes(String(host).replace(/^\[|\]$/g, '')) && [54521, 3001].includes(Number(port));
function denied() { throw new Error('HOMOLOGATION_EGRESS_BLOCKED'); }
const originalFetch = globalThis.fetch;
globalThis.fetch = async function(input, options) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname, url.port || (url.protocol === 'https:' ? 443 : 80)) || url.username || url.password) denied();
  return originalFetch.call(this, input, { ...options, redirect: 'error' });
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  let a = args[0]; if (Array.isArray(a)) a = a[0];
  const opts = typeof a === 'object' ? a : { port: a, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (opts.path || !allowed(opts.host || opts.hostname || 'localhost', opts.port)) denied();
  return connect.apply(this, args);
};
for (const mod of [http, https]) {
  const original = mod.request;
  mod.request = function(...args) {
    const a = args[0], url = typeof a === 'string' || a instanceof URL ? new URL(a) : a;
    if (!allowed(url.hostname || url.host || 'localhost', url.port || (mod === https ? 443 : 80))) denied();
    return original.apply(this, args);
  };
  mod.get = function(...args) { const req = mod.request(...args); req.end(); return req; };
}
const tlsConnect = tls.connect;
tls.connect = function(...args) {
  const a = args[0], opts = typeof a === 'object' ? a : { port: a, host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (opts.path || !allowed(opts.host || opts.hostname || 'localhost', opts.port)) denied();
  return tlsConnect.apply(this, args);
};
Object.defineProperty(globalThis, '__bossaHomologationNetworkGuard', { value: 'loopback-54521-3001-v1', writable: false, configurable: false });
