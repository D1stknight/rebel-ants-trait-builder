// ============================================================================
// 00-fetch-guard-and-helpers.js
// Original app.js lines 1-126 (126 lines)
// ============================================================================

;
/* ===============================
   CONFIG (Phase 2 safe minimal)
   =============================== */
;(() => {
  if (window.__RA_WM_CONFIG_MIN__) return;
  window.__RA_WM_CONFIG_MIN__ = true;

  const qs = new URLSearchParams(location.search);

  const CONTRACT =
    qs.get('contract') ||
    (window._RA_CONTRACT && String(window._RA_CONTRACT)) ||
    "0x96C1469c1C76E3Bb0e37c23a830d0Eea6BCf9221";

  const RESERVOIR = "https://api.reservoir.tools/tokens/v7?media=true&tokens=";

  if (!window.__APECHAIN_RPC) {
    window.__APECHAIN_RPC = "https://rpc.apecoinchain.org";
  }

 // overlay / ring image source
const qsWM = qs.get('wm');
const FALLBACK = "/assets/overlay.png?v=wm10";  // <- use the path that actually exists
const candidate = isAllowedAssetURL(qsWM) ? qsWM : FALLBACK;

function validateAndExport(src){
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    window.WM_SRC = src;
    window.dispatchEvent(new CustomEvent('ra-wm-src-ready', { detail: { src, ok: true } }));
  };
  img.onerror = () => {
    if (src !== FALLBACK) {
      validateAndExport(FALLBACK);
    } else {
      window.WM_SRC = FALLBACK;
      window.dispatchEvent(new CustomEvent('ra-wm-src-ready', { detail: { src: FALLBACK, ok: false } }));
    }
  };
  img.src = src;
}

// kick it off
validateAndExport(candidate);

  // Export environment snapshot
  window.RA_ENV = Object.freeze({
    contract: CONTRACT,
    reservoirAPI: RESERVOIR,
    apechainRPC: window.__APECHAIN_RPC
  });
})(); // end CONFIGG

/* ======================================================================
   Reservoir hot‑swap → proxy to our server route (/api/token-media)
   - Intercepts fetches to api.reservoir.tools/tokens/v7
   - For each addr:id, calls /api/token-media (same origin, no CORS)
   - Returns the same shape { tokens:[ { token:{ image,imageSmall,imageLarge,... } } ] }
   ====================================================================== */
(() => {
  const ORIG_FETCH = window.fetch.bind(window);

  function isResTokens(u) {
    if (!u) return false;
    try { return /:\/\/[^/]*reservoir\.tools\/tokens\/v7/i.test(String(u)); }
    catch { return false; }
  }

  function parseTokensParam(val) {
    const out = [];
    if (!val) return out;
    String(val).split(',').forEach(p => {
      const [addr, id] = p.split(':');
      if (addr && id != null) out.push({ contract: addr.trim(), tokenId: String(id).trim() });
    });
    return out;
  }

  // Build the exact JSON shape the app expects back from Reservoir
  function wrapToken(contract, tokenId, image) {
    const img = image || '';
    return {
      token: {
        contract,
        tokenId: String(tokenId),
        name: `#${tokenId}`,
        imageSmall: img,
        image: img,
        imageLarge: img
      }
    };
  }

  window.fetch = async function(input, init) {
    try {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (!isResTokens(url)) {
        return ORIG_FETCH(input, init);
      }

      const u = new URL(url, location.origin);
      const wanted = parseTokensParam(u.searchParams.get('tokens')); // "0x..:123,0x..:7"

      const results = await Promise.all(wanted.map(async ({ contract, tokenId }) => {
        try {
          const r = await fetch(
            `/api/token-media?contract=${encodeURIComponent(contract)}&id=${encodeURIComponent(tokenId)}`,
            { cache: 'no-store' }
          );
          const j = await r.json().catch(() => null);
          return wrapToken(contract, tokenId, j && j.image || '');
        } catch {
          return wrapToken(contract, tokenId, '');
        }
      }));

      const body = JSON.stringify({ tokens: results });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      // If anything fails here, fall back to the original fetch (may 502)
      return ORIG_FETCH(input, init);
    }
  };
})();