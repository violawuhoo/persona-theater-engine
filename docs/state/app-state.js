// ============================================================
// APP STATE — docs/state/app-state.js
// Single source of mutable runtime state for Persona Theater.
// Loaded as a classic <script> before script.js.
// Do NOT use import/export — targets a browser classic-script context.
// ============================================================

const AppState = {

  // ── Timer ──────────────────────────────────────────────────
  gachaTimer: null,

  // ── Session flags ──────────────────────────────────────────
  isTheaterModeActive: false,

  // ── Persona selection ──────────────────────────────────────
  selectedPersona:    null,   // string persona ID, set only by activateFromDetail()
  currentPersonaData: null,   // full validated persona JSON, set by loadPersona()

  // ── UI position state ──────────────────────────────────────
  currentRotation:      0,    // cumulative wheel degrees (mod 360 not applied — intentional)
  currentCarouselIndex: 0,    // preserved across Browse ↔ Detail transitions

  // ── Theater session ────────────────────────────────────────
  currentSceneContext: { scene: '', target: '', scale: '' },  // bound during Theater activation
  usedGachaTips:       new Set(),                 // dedup within current session

  // ── Data registry ──────────────────────────────────────────
  runtimePersonaRegistry: [],   // built from manifest JSON by buildRuntimePersonaRegistry()
  runtimeManifestMeta:    null, // {schema_version, total_personas} — set once on load

  // ── Theater content buffer ─────────────────────────────────
  // .text properties are mutated by startTheater(); read by updateGuidance() + triggerGacha().
  // Index mapping: 0=底层逻辑, 1=行为特征, 2=语言风格, 3=反应机制 (matches wheel quadrants at 90° each)
  contentData: [
    { title: '底层逻辑', text: '' },
    { title: '行为特征', text: '' },
    { title: '语言风格', text: '' },
    { title: '反应机制', text: '' }
  ]

};
