// ============================================================
// GACHA ENGINE — docs/domain/gacha-engine.js
// Domain logic for gacha tip selection and deduplication.
// No AppState reads/writes. No DOM access. No network I/O.
// Dependencies: none
// Loaded as a classic <script> before state/app-state.js and script.js.
// Do NOT use import/export — targets a browser classic-script context.
// ============================================================

// ── SEMANTIC OVERLAP DETECTION ────────────────────────────────
// Returns true if tip shares ≥8 consecutive chars with theaterContent.
function hasSemanticOverlap(tip, theaterContent, minLen = 8) {
  if (!tip || tip.length < minLen) return false;
  for (let i = 0; i <= tip.length - minLen; i++) {
    if (theaterContent.includes(tip.substring(i, i + minLen))) return true;
  }
  return false;
}
