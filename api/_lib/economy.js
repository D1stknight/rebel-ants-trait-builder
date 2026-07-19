// api/_lib/economy.js — bridge to Rebel Economy Core (same protocol as the
// Playground's lib/economy.ts). Balances live ONLY in the central ledger.
const ECONOMY_BASE_URL = process.env.ECONOMY_BASE_URL || 'https://economy.rebelants.io';
const SERVICE_API_KEY = process.env.SERVICE_API_KEY || '';

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + SERVICE_API_KEY });
const billingConfigured = () => !!SERVICE_API_KEY;

// playerId "name:<slug>" (or any namespaced id) passes through as the economy key.
async function resolveByPlayerId(playerId){
  if (!playerId || !SERVICE_API_KEY) return null;
  try {
    const r = await fetch(ECONOMY_BASE_URL + '/api/internal/resolve', {
      method: 'POST', headers: authHeaders(), cache: 'no-store',
      body: JSON.stringify({ discordId: playerId, username: playerId, displayName: null })
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !j.ok) return null;
    return { userId: String(j.userId), displayName: j.displayName || null, balance: Number(j.balance || 0) };
  } catch { return null; }
}
async function move(kind, args){
  // Economy Core enforces type enums: debit accepts game_spend|spend,
  // credit accepts game_reward|refund|earn|claim_code. Unknown types are
  // rejected (this caused debit_failed with custom types like ai_overlay).
  const defType = (kind === 'debit') ? 'game_spend' : 'game_reward';
  try {
    const r = await fetch(ECONOMY_BASE_URL + '/api/internal/' + kind, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({
        userId: args.userId,
        amount: Math.max(0, Math.floor(args.amount)),
        type: args.type || defType,
        source: 'trait-builder',
        reason: args.reason,
        metadata: args.metadata,
        idempotencyKey: args.idempotencyKey
      })
    });
    const j = await r.json().catch(() => null);
    // IMPORTANT: unlike /resolve, the debit/credit responses do NOT include
    // an ok flag. Success = HTTP 2xx with a JSON body (and no explicit
    // ok:false). Requiring j.ok here caused successful debits to be
    // reported as debit_failed - charging the user with no generation.
    if (!r.ok || !j || j.ok === false) {
      console.error('[economy] ' + kind + ' failed', r.status, (j && (j.error || JSON.stringify(j).slice(0, 200))) || '');
      return { ok: false, error: (j && j.error) || ('HTTP ' + r.status) };
    }
    const bal = (j.balance != null) ? j.balance : j.newBalance;
    return { ok: true, balance: Number(bal != null ? bal : NaN) };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}
const debit  = (args) => move('debit',  args);
const credit = (args) => move('credit', args);
module.exports = { resolveByPlayerId, debit, credit, billingConfigured };
