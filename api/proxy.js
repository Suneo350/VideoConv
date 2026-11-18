// Vercel Edge Function: meneruskan file video (mp4/webm) agar bisa dibaca halaman ini.
export const config = { runtime: 'edge' };

const MAX_BYTES = 300 * 1024 * 1024; // 300 MB
const BLOCKED = ['youtube.com', 'youtu.be', 'googlevideo.com', 'tiktok.com', 'instagram.com',
  'facebook.com', 'fb.watch', 'twitter.com', 'x.com', 'netflix.com'];

const err = (status, msg) => new Response(JSON.stringify({ error: msg }), {
  status, headers: { 'content-type': 'application/json' },
});

function isPrivate(h) {
  return h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.includes(':') ||
    /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}
const bad = (u) => isPrivate(u.hostname) ||
  BLOCKED.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));

export default async function handler(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return err(405, 'Metode tidak diizinkan.');
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return err(403, 'Proxy hanya untuk halaman ini.');

  let target;
  try { target = new URL(new URL(request.url).searchParams.get('url')); }
  catch { return err(400, 'Link tidak valid.'); }
  if (!/^https?:$/.test(target.protocol)) return err(400, 'Hanya link http/https.');
  if (bad(target)) return err(403, 'Link ini tidak diizinkan lewat proxy. Situs seperti YouTube tidak mendukung pengunduhan di luar aplikasinya.');

  const headers = new Headers({ 'user-agent': 'Mozilla/5.0 (compatible; video-ke-gambar)' });
  const range = request.headers.get('range');
  if (range) headers.set('range', range);

  let up;
  try { up = await fetch(target, { method: request.method, headers, redirect: 'follow' }); }
  catch { return err(502, 'Tidak bisa mengambil video dari link itu.'); }
  if (bad(new URL(up.url))) return err(403, 'Link dialihkan ke alamat yang tidak diizinkan.');
  if (!up.ok) return err(502, 'Server video membalas kode ' + up.status + '.');

  const type = (up.headers.get('content-type') || '').toLowerCase();
  const okType = ['video/', 'application/octet-stream', 'application/mp4', 'application/ogg']
    .some((t) => type.startsWith(t));
  if (!okType) return err(415, 'Link itu bukan file video langsung (mp4/webm).');

  const cr = up.headers.get('content-range');
  const total = cr ? parseInt(cr.split('/')[1], 10) : parseInt(up.headers.get('content-length') || '0', 10);
  if (total > MAX_BYTES) return err(413, 'Video terlalu besar untuk proxy (maks 300 MB).');

  const out = new Headers({ 'content-type': type, 'cache-control': 'private, max-age=3600' });
  const cl = up.headers.get('content-length');
  if (cl && !up.headers.get('content-encoding')) out.set('content-length', cl);
  if (cr) out.set('content-range', cr);
  if (up.status === 206 || up.headers.get('accept-ranges') === 'bytes') out.set('accept-ranges', 'bytes');

  return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
}
