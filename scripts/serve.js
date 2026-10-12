import { resolve, sep } from 'node:path';
const root = resolve(import.meta.dir, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.wav': 'audio/wav' };
const server = Bun.serve({
  hostname: '127.0.0.1', port: Number(process.env.PORT || 8198),
  async fetch(req) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', {status: 405});
    let path;
    try { path = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response('Bad path', {status: 400}); }
    if (path === '/') path = '/index.html';
    if (!/^\/(index\.html|(?:styles|green-light)\.css|vendor\/three\.js|src\/(?:(?:pigment|pacman)\/)?[a-z-]+\.(?:m?js)|assets\/green-light\/[a-z0-9-]+\.wav)$/.test(path)) return new Response('Not found', {status: 404});
    const full = resolve(root, '.' + path);
    if (!full.startsWith(root + sep)) return new Response('Forbidden', {status: 403});
    const file = Bun.file(full);
    if (!await file.exists()) return new Response('Not found', {status: 404});
    const ext = path.slice(path.lastIndexOf('.'));
    return new Response(req.method === 'HEAD' ? null : file, {headers: {'Content-Type': types[ext], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  }
});
console.log(`jev infer · http://127.0.0.1:${server.port}/`);
