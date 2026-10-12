export const connectionDefaults = Object.freeze({url:'http://localhost:8000', protocol:'systemone', concurrency:0, probeCeiling:64, timeout:30, model:'', key:'', questionParallelism:true, controlMaxAge:4000});

export function normalizeEndpoint(value) {
  const text = String(value).trim();
  if (!text) throw Error('Enter an endpoint.');
  const u = new URL(/^[a-z][\w+.-]*:\/\//i.test(text) ? text : 'http://'+text);
  if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash || !['/','','/v1','/v1/'].includes(u.pathname)) throw Error('Use an HTTP(S) origin or /v1 URL without credentials, query or fragment.');
  if (['0.0.0.0','[::]'].includes(u.hostname)) throw Error('Use localhost or the server address, not its wildcard listen address.');
  return u.origin;
}
export function addressSpace(value) {
  const h = new URL(normalizeEndpoint(value)).hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');
  if (/^::ffff:[\da-f]{1,4}:[\da-f]{1,4}$/.test(h)) {const words=h.split(':').slice(-2).map(x=>parseInt(x,16));return addressSpace('http://'+[words[0]>>8,words[0]&255,words[1]>>8,words[1]&255].join('.'));}
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h)) return 'loopback';
  if (h.endsWith('.local') || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || /^(f[cd][\da-f]{2}:|fe[89ab][\da-f]:)/.test(h) || ['host.docker.internal','gateway.docker.internal'].includes(h)) return 'local';
  return null;
}
export function connectionFetchOptions(url) {
  const space = addressSpace(url);
  return {mode:'cors', credentials:'omit', redirect:'error', cache:'no-store', ...(space ? {targetAddressSpace:space} : {})};
}
export async function permissionState(url, permissions = globalThis.navigator?.permissions) {
  const space = addressSpace(url); if (!space || !permissions?.query) return 'unsupported';
  for (const name of [space === 'loopback' ? 'loopback-network' : 'local-network', 'local-network-access']) {
    try { const p = await permissions.query({name}); if (['granted','denied','prompt'].includes(p?.state)) return p.state; } catch {}
  }
  return 'unsupported';
}
export async function connectionError(error, url) {
  const permission = await permissionState(url);
  return error.message + (permission === 'denied' ? ' Allow Local network access in this site’s browser permissions, then reconnect.' : error.status ? '' : ' Check the address, local-network permission and server CORS (--cors). HTTPS pages may need an HTTPS endpoint or browser local-network permission; no proxy is used.');
}
