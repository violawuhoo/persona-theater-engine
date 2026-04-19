// ============================================================
// UTILITIES — docs/utils.js
// Pure helper functions with no side effects.
// Dependencies: constants.js (MISSING, LEGACY_PERSONA_COLORS) must load first.
// Loaded as a classic <script> before app-state.js and script.js.
// Do NOT use import/export — targets a browser classic-script context.
// ============================================================

// ── SAFE ACCESSORS ────────────────────────────────────────────

// Safe string getter — returns fallback if val is not a usable string.
function safeStr(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return String(val);
  return val.trim() || fallback;
}

// Safe deep-get — safeGet(obj, 'a.b.c', defaultValue)
function safeGet(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return fallback;
    return acc[key] !== undefined ? acc[key] : fallback;
  }, obj);
}

// ── PATH UTILITIES ────────────────────────────────────────────

// Normalizes a manifest-relative path to always start with ./
function normalizeManifestPath(pathValue) {
  const raw = safeStr(pathValue).trim();
  if (!raw) return '';
  if (raw.startsWith('./')) return raw;
  if (raw.startsWith('/')) return `.${raw}`;
  return `./${raw}`;
}

// ── COLOR UTILITIES ───────────────────────────────────────────

// Deterministic HSL color from a persona ID string (hash-based).
function deterministicColorFromId(id) {
  const seed = safeStr(id, 'UNKNOWN');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 72% 55%)`;
}

// Returns the display color for any persona ID.
// Checks LEGACY_PERSONA_COLORS first; falls back to deterministic hash color.
function getColorForPersonaId(id) {
  const cleanId = safeStr(id).trim().toUpperCase();
  return LEGACY_PERSONA_COLORS[cleanId] || deterministicColorFromId(cleanId);
}

// ── FIELD EXTRACTION HELPERS ──────────────────────────────────

// Stable read: returns value verbatim; MISSING sentinel if absent or empty.
// Never fabricates a replacement — callers must handle the MISSING marker.
function stableField(value) {
  const s = safeStr(value);
  return s.length > 0 ? s : MISSING;
}

// Selectable extraction: deduplicates and truncates a pool of candidate lines.
// Strips leading ↳ markers, splits on first newline, enforces max count.
// No rewriting permitted — output must be verbatim source text.
function selectableLines(candidates, max) {
  const seen   = new Set();
  const result = [];
  for (const raw of candidates) {
    const line = safeStr(raw).split('\n')[0].replace(/^↳\s*/, '').trim();
    if (line.length > 3 && !seen.has(line)) {
      seen.add(line);
      result.push(line);
      if (result.length >= max) break;
    }
  }
  return result;
}
