// api/_lib/redisAdapter.js
// Minimal Upstash Redis REST helper that stores JSON values.
// We use base64 encoding so any string is safe over the REST path.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  throw new Error('Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars');
}

const ENC = '?_encoding=base64';
const b64 = (v) => Buffer.from(String(v)).toString('base64');

async function call(cmd, ...parts) {
  const url = [KV_URL, cmd, ...parts.map(b64)].join('/') + ENC;
  const method = cmd === 'get' ? 'GET' : 'POST';
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`KV ${cmd} failed: ${res.status} ${txt}`);
  }
  return res.json();
}

const key = (...parts) => ['contest', ...parts].join(':');

// --- Public helpers ---

export async function getActiveContestId() {
  const { result } = await call('get', key('active'));
  return result || null;
}

export async function setActiveContestId(id) {
  await call('set', key('active'), id);
  return id;
}

export async function saveContestMeta(contestId, metaObj) {
  await call('set', key('meta', contestId), JSON.stringify(metaObj));
}

export async function saveEntry(contestId, id, name, url, caption) {
  // Coerce to safe strings; store one JSON payload
  const entry = {
    id,
    name: String(name ?? 'Anonymous'),
    caption: String(caption ?? ''),
    url: String(url ?? ''),
    votes: 0,
    createdAt: Date.now(),
  };

  await call('set', key('entry', contestId, id), JSON.stringify(entry));
  await call('sadd', key('entries', contestId), id);  // keep list of ids

  // Optional: track a set of all contests we’ve ever opened
  await call('sadd', key('all'), contestId);

  return entry;
}
