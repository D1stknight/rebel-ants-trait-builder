// Simple Upstash Redis adapter using the REST API (no extra packages).
// Works on Vercel Node runtimes (fetch is available server-side).

const { KV_REST_API_URL, KV_REST_API_TOKEN } = process.env;

async function cmd(command, ...args) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    throw new Error('KV_REST_API_URL or KV_REST_API_TOKEN is missing in env');
  }
  const url = `${KV_REST_API_URL}/${command}/${args.map(a => encodeURIComponent(a)).join('/')}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
    cache: 'no-store'
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`[Upstash ${command}] ${r.status} ${text}`);
  }
  return r.json();
}

async function kvSet(key, value) {
  const v = (typeof value === 'string') ? value : JSON.stringify(value);
  return cmd('SET', key, v);
}

async function kvGet(key) {
  const out = await cmd('GET', key);
  const raw = out?.result ?? null;
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

async function sadd(key, member) {
  const m = (typeof member === 'string') ? member : JSON.stringify(member);
  return cmd('SADD', key, m);
}

module.exports = { cmd, kvSet, kvGet, sadd };
