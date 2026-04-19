# Persona Theater — Refactor Phase 1
## State Extraction from `script.js`
> Audit date: 2026-04-19 | Status: Phase A complete, Phase B implemented

---

## A. Structure Audit

### A1. Responsibility Mapping

The entire product currently lives in one 1298-line file (`docs/script.js`). Below is what each group contains, mapped to **actual function and variable names**.

---

#### UI / DOM Manipulation

These functions read from or write to the DOM. They contain inline HTML strings, `getElementById`, `classList`, `style`, etc.

| Function | What it does |
|---|---|
| `initCarousel()` | Builds Browse card HTML into `#carousel`, creates dots, attaches scroll listener |
| `buildQuadrantBlock(params)` | Returns an HTML string for the E/O/R/B quadrant grid |
| `updateGuidance(index)` | Writes `contentData[index]` into `#guidance-title` / `#guidance-content` |
| `rotateWheel(delta)` | Updates `currentRotation`, applies CSS transform to `#main-wheel`, calls `updateGuidance` |
| `showModal(message, opts)` | Shows `#modal-overlay`, wires confirm/cancel buttons, returns Promise |
| `showAlert()` | Thin wrapper around `showModal` with `type:'alert'` |
| `showConfirm()` | Thin wrapper around `showModal` with `type:'confirm'` |
| `showError(msg)` | Calls `showAlert` with red color |
| `resetCarouselButtons()` | Restores all `.btn` CTAs in the carousel to "了解更多" / enabled state |
| `openPersonaDetail()` | Loads data, populates 5 `#detail-*` elements, hides Browse, shows Detail with animation |
| `closePersonaDetail()` | Fades Detail out, reveals Browse, restores scroll position |
| `activateFromDetail()` | Fades Detail out, shows Config, sets `#active-persona-display` |
| `startTheater()` | Populates `#sync-overlay`, races AI, then hides Config and shows `#theater-screen` |
| `exitTheater()` | Hides `#theater-screen`, shows Browse, resets `#main-wheel` transform |

The IIFE `initWheelInteraction()` (lines 1104–1134) is also purely UI — it wires touch/click events on `#main-wheel`.

---

#### State Management

All mutable globals are declared at the top of `script.js` (lines 19–27 and 36–37 and 1082–1087). There is no state module — state is plain `let` variables in the global scope.

| Variable | Type | Purpose |
|---|---|---|
| `gachaTimer` | `number\|null` | Holds `setInterval` ID |
| `isTheaterModeActive` | `boolean` | Gates gacha tick |
| `selectedPersona` | `string\|null` | Active persona ID |
| `currentPersonaData` | `object\|null` | Full loaded persona JSON |
| `currentRotation` | `number` | Wheel degrees (incremented per click) |
| `currentCarouselIndex` | `number` | Scroll position index for Browse ↔ Detail round-trip |
| `currentSceneContext` | `{scene, scale}` | Bound at Theater start; read by gacha |
| `usedGachaTips` | `Set<string>` | Dedup gacha tips within session |
| `runtimePersonaRegistry` | `Array` | Built from manifest; shared lookup table |
| `runtimeManifestMeta` | `object\|null` | Schema version + count metadata |
| `contentData` | `Array[4]` | The 4 theater content blocks; **declared as `const` but mutated via `.text`** |

---

#### Flow / Navigation Control

These functions are the navigation state machine. Each one transitions between one screen and another by toggling `.hidden` classes.

```
Browse ──openPersonaDetail()──► Detail
Detail ──closePersonaDetail()──► Browse
Detail ──activateFromDetail()──► Config
Config ──startTheater()─────────► Theater (via sync overlay)
Theater ──exitTheater()──────────► Browse
```

`selectPersona()` is a bypass-safe stub that always routes to `openPersonaDetail()` — it exists to catch any old direct-activation calls.

---

#### Core Product Logic

| Function | What it does |
|---|---|
| `startGachaSystem()` | Starts a `setInterval` that calls `triggerGacha()` every 10 seconds |
| `triggerGacha()` | Checks state, generates a tip, optionally rewrites it via AI, shows modal |
| `generateSceneTip(persona, sceneContext, theaterContent)` | Builds a weighted pool from `reaction_cues` / `scene_tactics` / `taboos`, deduplicates, returns one tip |
| `hasSemanticOverlap(tip, theaterContent)` | Substring scan — returns true if 8+ consecutive chars of the tip appear in theater content |
| `rewriteTipImperative(originalLine, sceneLabel)` | AI call to compress a tip to ≤20 chars imperative form |
| `extractTheaterContent(data, scene, target, scale)` | Produces `{mind, body, speech, reaction}` from `theater_support` + scenario/target overlays |
| `callAIWithPersonaProtocol(...)` | Constructs full system prompt from persona fields + overlays, calls Moonshot API, returns `{mind, body, speech, reaction}` |

---

#### Data Access / Mapping

| Function | What it does |
|---|---|
| `loadPersonaManifest()` | `fetch` the manifest JSON, validate shape, store `runtimeManifestMeta` |
| `buildRuntimePersonaRegistry(manifest)` | Filter + normalize manifest entries → stores into `runtimePersonaRegistry` |
| `ensureRuntimeRegistry()` | Lazy init: returns registry if populated, otherwise loads it |
| `loadPersona(personaId)` | Looks up path in registry, fetches JSON, validates schema, **assigns to `currentPersonaData`** |
| `loadPersonaIndex()` | Loads all personas in parallel via `Promise.allSettled`, returns array for carousel |
| `normalizePersonaSchema(raw)` | Schema validator — rejects old format, warns on missing fields, returns raw unchanged |
| `normalizeManifestPath(pathValue)` | Normalizes relative paths to `./` prefix |
| `extractBrowseContent(persona)` | Reads `consumer_fields` only → returns `{name, quadrant, slogan}` |
| `extractDetailContent(persona)` | Reads `consumer_fields` only → returns `{core_essence, social_essence, expressions, taboos}` |

---

#### Utility Functions

| Function | What it does |
|---|---|
| `safeStr(val, fallback)` | Returns string or fallback; guards against null/undefined |
| `safeGet(obj, path, fallback)` | Deep property access via dot-path string |
| `getPersonaColor()` | Reads `selectedPersona` + `runtimePersonaRegistry` → returns hex/hsl color |
| `getColorForPersonaId(id)` | Checks `LEGACY_PERSONA_COLORS` first, falls back to deterministic hash |
| `deterministicColorFromId(id)` | Hash-based HSL color from persona ID string |
| `stableField(value)` | Returns value verbatim or the `MISSING` sentinel — never fabricates |
| `selectableLines(candidates, max)` | Dedup + truncate line pool |

---

### A2. Global State Analysis

**All global variables:**

```
gachaTimer           — line 19
isTheaterModeActive  — line 20
selectedPersona      — line 21
currentPersonaData   — line 22
currentRotation      — line 23
currentCarouselIndex — line 24
currentSceneContext  — line 25
usedGachaTips        — line 26
runtimePersonaRegistry — line 36
runtimeManifestMeta  — line 37
contentData          — line 1082  ← declared far from other state
```

**Shared mutable state — who reads and writes each variable:**

| Variable | Written by | Read by |
|---|---|---|
| `gachaTimer` | `startGachaSystem`, `exitTheater` | `startGachaSystem`, `exitTheater` |
| `isTheaterModeActive` | `startTheater`, `exitTheater` | gacha interval tick |
| `selectedPersona` | `activateFromDetail`, `exitTheater` | `getPersonaColor` |
| `currentPersonaData` | `loadPersona` (side effect), `openPersonaDetail` (error clear), `closePersonaDetail`, `exitTheater` | `openPersonaDetail`, `activateFromDetail`, `startTheater`, `triggerGacha`, `generateSceneTip` |
| `currentRotation` | `rotateWheel`, `exitTheater` | `rotateWheel` |
| `currentCarouselIndex` | scroll listener in `initCarousel`, `openPersonaDetail` | `closePersonaDetail` |
| `currentSceneContext` | `startTheater`, `exitTheater` | `triggerGacha` → `generateSceneTip` |
| `usedGachaTips` | `startTheater` (clear), `exitTheater` (clear), `generateSceneTip` (add) | `generateSceneTip` |
| `runtimePersonaRegistry` | `buildRuntimePersonaRegistry` | `ensureRuntimeRegistry`, `getPersonaColor`, `loadPersona`, `openPersonaDetail`, `activateFromDetail` |
| `runtimeManifestMeta` | `loadPersonaManifest` | not read after assignment (metadata only) |
| `contentData` | `startTheater` (writes all 4 `.text`) | `updateGuidance`, `triggerGacha` (via `theaterText`) |

**Risky state patterns:**

1. **`loadPersona()` mutates `currentPersonaData` as a side effect.** It also returns the same value. `openPersonaDetail` calls it and then reads `currentPersonaData` as if it were a returned value — this creates implicit ordering coupling: any future caller that forgets to `await` before reading the global will get stale data.

2. **`contentData` is `const` but mutated.** Declared at line 1082 with `const`, but `startTheater()` writes directly to `contentData[0].text`. This is legal JS but visually contradicts the `const` keyword — it reads like immutable data to a new reader.

3. **`currentCarouselIndex` is set in two independent places** (scroll listener + `openPersonaDetail`). If the scroll listener fires after `openPersonaDetail` captures the index but before the transition completes, the value could be overwritten. Low probability but a hidden dependency.

4. **`usedGachaTips` is cleared in both `startTheater` and `exitTheater`.** This means the clearing responsibility is split — if either is removed or refactored, tip dedup might break silently.

---

### A3. Key Function Map

**Most important functions (by number of globals they touch):**

| Function | Globals touched | Responsibility mix |
|---|---|---|
| `exitTheater()` | 7 | State reset + DOM nav — high coupling |
| `startTheater()` | 4 + `contentData` | DOM read + AI orchestration + state write + timer start |
| `openPersonaDetail()` | `currentPersonaData`, `currentCarouselIndex` | Data load + DOM render + navigation |
| `activateFromDetail()` | `selectedPersona`, `currentPersonaData` | State set + DOM nav |
| `triggerGacha()` | `currentPersonaData`, `currentSceneContext`, `contentData` | Pure product logic + modal UI |
| `generateSceneTip()` | `usedGachaTips` | Pure logic — **safest to test in isolation** |
| `loadPersona()` | `currentPersonaData` | Data access + **hidden global side effect** |

**Tightly coupled function pairs:**

- `startTheater()` ↔ `updateGuidance()` — both depend on `contentData` index structure
- `startTheater()` ↔ `startGachaSystem()` — gacha must start only after `isTheaterModeActive = true`
- `loadPersona()` ↔ `openPersonaDetail()` — caller relies on the side effect, not just the return value
- `rotateWheel()` ↔ `updateGuidance()` — rotation arithmetic assumes 4 slots at 90° each
- `generateSceneTip()` ↔ `usedGachaTips` — global Set is the dedup memory; no clean interface

**Functions that mix responsibilities:**

- `startTheater()` — reads form DOM + manages overlay DOM + assigns `currentSceneContext` + clears `usedGachaTips` + fills `contentData` + calls AI + starts gacha timer. Six jobs.
- `openPersonaDetail()` — fetches data + validates + renders 5 DOM elements + manages navigation + sets carousel index.
- `loadPersona()` — fetches JSON + validates schema + **assigns global** `currentPersonaData` + returns same value.
- `exitTheater()` — resets 7 globals + manipulates 5 DOM elements + clears timer.

---

### A4. Coupling & Risk Areas

**Where UI and logic are tightly mixed:**

- `startTheater()` reads `document.getElementById('intention-input').value` directly. This means testing the theater startup logic requires a live DOM.
- `triggerGacha()` calls `showAlert()` (modal UI) at the end of a data-generation pipeline. The logic and display are in the same function.
- `openPersonaDetail()` interleaves data loading with DOM rendering — the `await loadPersona()` call is immediately followed by `document.getElementById(...)` writes.

**Where state is mutated across unrelated parts:**

- `currentPersonaData` is cleared in 3 different places (`closePersonaDetail`, `openPersonaDetail` error path, `exitTheater`). If one is missed during a refactor, stale data persists into the next session.
- `usedGachaTips` cleared in `startTheater` AND `exitTheater` — two unrelated lifecycle events share a side effect.

**HIGH RISK to modify:**

1. `startTheater()` — timing contract between `SYNC_DURATION_MS`, AI race, and the `setTimeout` that flips the screen. Any change here can break the calibration overlay.
2. `loadPersona()` — the global side effect on `currentPersonaData` is load-bearing; callers depend on it even though the function also returns the value.
3. `exitTheater()` — the full reset. Missing any one clear causes ghost state in the next session.
4. The `initWheelInteraction` IIFE — closures over `touchStartX`/`touchStartY` locals; do not touch.
5. `contentData` index structure — `updateGuidance(index)` maps 0-3 to wheel quadrants via `(Math.abs(currentRotation / 90)) % 4`. Any reorder breaks the wheel-to-content mapping.

---

### A5. Refactor Opportunity

**Safest to extract FIRST (Phase 1):**
- All global `let` declarations + `contentData` → dedicated `AppState` namespace object
- This is zero-behavior-change: same mutation patterns, just namespaced

**Safe for Phase 2 (after Phase 1 is stable):**
- Constants (`CONFIG`, `SCENARIO_OVERLAYS`, `TARGET_OVERLAYS`, `SCHEMA_DEFAULTS`, `MISSING`) → `constants.js`
- Utilities (`safeStr`, `safeGet`, `stableField`, `selectableLines`) → `utils.js`

**Safe for Phase 3:**
- Pure data functions: `extractBrowseContent`, `extractDetailContent`, `extractTheaterContent`, `generateSceneTip`, `hasSemanticOverlap` → `theater-logic.js`

**Do NOT touch yet:**
- `startTheater()` — too many interleaved responsibilities; extract only after state is isolated
- `openPersonaDetail()` — async DOM flow; risky without integration tests
- `callAIWithPersonaProtocol()` — standalone but has no tests; defer to Phase 4
- `initWheelInteraction` IIFE — touch event closures; leave entirely until last

---

---

## B. Refactor Plan (Phase 1 — State Only)

### B1. New File Proposal

**`docs/state/app-state.js`**

Loaded as a classic `<script>` tag before `script.js`. Creates a global `AppState` object. No ES modules, no `import/export` — consistent with how `script.js` is currently loaded.

Why a namespace object instead of individual `let` globals? Because it:
- Makes state ownership explicit and searchable (`AppState.` prefix)
- Groups all mutable session state in one place
- Does not change the JS runtime semantics (still plain property assignment)
- Does not require `type="module"` or a bundler
- Is reversible — if something breaks, remove the file and revert two lines

---

### B2. State Design

**What moves to `AppState`:**

```
gachaTimer           → AppState.gachaTimer
isTheaterModeActive  → AppState.isTheaterModeActive
selectedPersona      → AppState.selectedPersona
currentPersonaData   → AppState.currentPersonaData
currentRotation      → AppState.currentRotation
currentCarouselIndex → AppState.currentCarouselIndex
currentSceneContext  → AppState.currentSceneContext
usedGachaTips        → AppState.usedGachaTips
runtimePersonaRegistry → AppState.runtimePersonaRegistry
runtimeManifestMeta  → AppState.runtimeManifestMeta
contentData          → AppState.contentData
```

**What remains in `script.js` (not moved in Phase 1):**
- `CONFIG` — configuration constants, not mutable session state
- `PERSONA_MANIFEST_PATH` — a string constant, not state
- `LEGACY_PERSONA_COLORS` — a data constant, not state
- `SCENARIO_OVERLAYS` — large data constant, not state
- `TARGET_OVERLAYS` — data constant, not state
- `SCHEMA_DEFAULTS` — data constant, not state
- `MISSING` — sentinel string constant, not state

Constants are deferred to Phase 2.

**Structure of `AppState`:**

```js
const AppState = {
  // ── Timer ─────────────────────────────────
  gachaTimer: null,

  // ── Session flags ─────────────────────────
  isTheaterModeActive: false,

  // ── Persona selection ─────────────────────
  selectedPersona:    null,
  currentPersonaData: null,

  // ── UI position state ─────────────────────
  currentRotation:      0,
  currentCarouselIndex: 0,

  // ── Theater session ───────────────────────
  currentSceneContext: { scene: '', scale: '' },
  usedGachaTips:       new Set(),

  // ── Data registry ─────────────────────────
  runtimePersonaRegistry: [],
  runtimeManifestMeta:    null,

  // ── Theater content buffer ─────────────────
  // contentData[0-3].text is mutated in startTheater()
  // and read by updateGuidance() and triggerGacha()
  contentData: [
    { title: '底层逻辑', text: '正在同步人格底色...请稍后。' },
    { title: '行为特征', text: '正在校准肢体语言...请稍后。' },
    { title: '语言风格', text: '正在加载话术补丁...请稍后。' },
    { title: '反应机制', text: '正在预设应激方案...请稍后。' }
  ]
};
```

---

### B3. Migration Plan

**What moves:** 11 variable declarations removed from `script.js` lines 19–27, 36–37, 1082–1087.

**What remains:** Everything else — all functions, all constants, all data.

**How existing code references new state:** Every occurrence of a bare variable name is prefixed with `AppState.`. Full reference table:

| Old reference | Appears in | New reference |
|---|---|---|
| `gachaTimer` | `startGachaSystem`, `exitTheater` | `AppState.gachaTimer` |
| `isTheaterModeActive` | gacha tick, `startTheater`, `exitTheater` | `AppState.isTheaterModeActive` |
| `selectedPersona` | `getPersonaColor`, `activateFromDetail`, `exitTheater` | `AppState.selectedPersona` |
| `currentPersonaData` | `loadPersona`, `openPersonaDetail`, `closePersonaDetail`, `activateFromDetail`, `startTheater`, `triggerGacha`, `exitTheater` | `AppState.currentPersonaData` |
| `currentRotation` | `rotateWheel`, `exitTheater` | `AppState.currentRotation` |
| `currentCarouselIndex` | scroll listener, `openPersonaDetail`, `closePersonaDetail` | `AppState.currentCarouselIndex` |
| `currentSceneContext` | `startTheater`, `triggerGacha`, `exitTheater` | `AppState.currentSceneContext` |
| `usedGachaTips` | `startTheater`, `generateSceneTip`, `exitTheater` | `AppState.usedGachaTips` |
| `runtimePersonaRegistry` | `buildRuntimePersonaRegistry`, `ensureRuntimeRegistry`, `getPersonaColor`, `loadPersona`, `openPersonaDetail`, `activateFromDetail` | `AppState.runtimePersonaRegistry` |
| `runtimeManifestMeta` | `loadPersonaManifest` | `AppState.runtimeManifestMeta` |
| `contentData` | `startTheater`, `updateGuidance`, `triggerGacha` | `AppState.contentData` |

**How to avoid breaking current behavior:**
- `AppState` is a plain object on `window` — property assignment `AppState.x = y` is identical in semantics to `let x; x = y` for every mutation in the codebase
- `Set` methods (`.clear()`, `.add()`, `.has()`) work identically on `AppState.usedGachaTips`
- Array index mutation `AppState.contentData[0].text = '...'` works identically
- Object property reset `AppState.currentSceneContext = { scene: '', scale: '' }` works identically

---

### B4. Behavior Preservation

**Navigation flow:** `currentCarouselIndex` is set in the scroll listener and in `openPersonaDetail`; it is read in `closePersonaDetail` to restore scroll. The migration changes only the name of the property that holds the index — the scroll restoration math is unchanged.

**Persona activation:** `activateFromDetail()` sets `AppState.selectedPersona` before transitioning to Config. `startTheater()` reads `AppState.currentPersonaData` (already loaded). Neither the sequencing nor the conditions change.

**Reset behavior:** `exitTheater()` currently resets 7 globals. After migration, it resets 7 `AppState.*` properties. Same 7 things, same values, same order.

**Gacha behavior:** The interval still starts via `AppState.gachaTimer = setInterval(...)`, the tick still checks `AppState.isTheaterModeActive`, `generateSceneTip` still reads `AppState.usedGachaTips`. The dedup Set mutation pattern is identical.

---

---

## C. Code Changes

### C1. New file: `docs/state/app-state.js`

```js
// ============================================================
// APP STATE — docs/state/app-state.js
// Single source of mutable runtime state for Persona Theater.
// Loaded as a classic <script> before script.js.
// Do NOT import/export — this file targets a browser classic-script context.
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
  currentSceneContext: { scene: '', scale: '' },  // bound during Theater activation
  usedGachaTips:       new Set(),                 // dedup within current session

  // ── Data registry ──────────────────────────────────────────
  runtimePersonaRegistry: [],   // built from manifest JSON by buildRuntimePersonaRegistry()
  runtimeManifestMeta:    null, // {schema_version, total_personas} — set once on load

  // ── Theater content buffer ─────────────────────────────────
  // .text properties are mutated by startTheater(); read by updateGuidance() + triggerGacha().
  // Index mapping: 0=底层逻辑, 1=行为特征, 2=语言风格, 3=反应机制 (matches wheel quadrants)
  contentData: [
    { title: '底层逻辑', text: '正在同步人格底色...请稍后。' },
    { title: '行为特征', text: '正在校准肢体语言...请稍后。' },
    { title: '语言风格', text: '正在加载话术补丁...请稍后。' },
    { title: '反应机制', text: '正在预设应激方案...请稍后。' }
  ]

};
```

### C2. Change: `docs/index.html`

Add one line before the existing `script.js` tag:

```html
  <!-- State module: must load before script.js -->
  <script src="state/app-state.js"></script>
  <script src="script.js"></script>
```

### C3. Changes: `docs/script.js`

#### Remove: Global declarations (lines 19–27, 36–37, 1082–1087)

Remove these 11 declarations entirely:

```js
// REMOVE ALL OF THESE:
let gachaTimer          = null;
let isTheaterModeActive = false;
let selectedPersona     = null;
let currentPersonaData  = null;
let currentRotation     = 0;
let currentCarouselIndex = 0;
let currentSceneContext = { scene: '', scale: '' };
let usedGachaTips       = new Set();
let runtimePersonaRegistry = [];
let runtimeManifestMeta    = null;
const contentData = [ ... ];   // 4-item array at line 1082
```

#### Replace: All bare variable references with `AppState.*`

See the complete list in Section B3. All replacements are mechanical name substitutions — no logic changes.

---

---

## D. Risk & Validation

### D1. Possible Bugs Introduced

| Risk | Where | Mitigation |
|---|---|---|
| `AppState` not loaded when `script.js` runs | If `<script>` order is wrong in HTML | Load `state/app-state.js` FIRST — verified in C2 |
| A bare variable name missed during replacement | Any function | After editing, `grep` for each old variable name in script.js to confirm zero occurrences |
| `contentData` index structure shifted | `updateGuidance`, `rotateWheel` | Do NOT reorder the 4 items in `AppState.contentData` — indices 0-3 map directly to wheel quadrants |
| `usedGachaTips` re-initialized as empty Set | `AppState` object literal | `new Set()` in the object literal is correct — matches original line 26 |
| `currentSceneContext` object reference replaced | `exitTheater` resets it as `= { scene: '', scale: '' }` | This replaces the object on `AppState.currentSceneContext` — correct, same semantics |
| `loadPersona()` side effect on `currentPersonaData` | `openPersonaDetail` reads `AppState.currentPersonaData` after `await loadPersona()` | Ensure line 394 (`currentPersonaData = normalizePersonaSchema(raw)`) is replaced with `AppState.currentPersonaData = ...` AND line 636 (`const data = currentPersonaData`) becomes `const data = AppState.currentPersonaData` |

### D2. What to Grep for After Editing

Run these after completing `script.js` edits to confirm no bare globals remain:

```bash
grep -n "\bgachaTimer\b"           docs/script.js   # expect 0 results
grep -n "\bisTheaterModeActive\b"  docs/script.js   # expect 0 results
grep -n "\bselectedPersona\b"      docs/script.js   # expect 0 results
grep -n "\bcurrentPersonaData\b"   docs/script.js   # expect 0 results
grep -n "\bcurrentRotation\b"      docs/script.js   # expect 0 results
grep -n "\bcurrentCarouselIndex\b" docs/script.js   # expect 0 results
grep -n "\bcurrentSceneContext\b"  docs/script.js   # expect 0 results
grep -n "\busedGachaTips\b"        docs/script.js   # expect 0 results
grep -n "\bruntimePersonaRegistry\b" docs/script.js # expect 0 results
grep -n "\bruntimeManifestMeta\b"  docs/script.js   # expect 0 results
grep -n "\bcontentData\b"          docs/script.js   # expect 0 results (as bare name)
```

---

### D3. Manual Test Checklist (Validation)

After implementing all changes, verify the following manually in the browser:

#### Navigation
- [ ] App loads without JS errors in console
- [ ] Browse carousel renders all persona cards with correct names and colors
- [ ] Tapping "了解更多" on a card opens the Detail view with the correct persona name
- [ ] Detail view shows core essence, social essence, expressions, and taboos correctly
- [ ] Tapping "← 返回筛选" from Detail returns to Browse at the **same carousel position** (not reset to card 0)
- [ ] After returning from Detail, all carousel buttons are restored to "了解更多" / enabled

#### Persona Activation
- [ ] Tapping "激活面具" in Detail transitions to Config panel (Browse and Detail are hidden)
- [ ] Config panel header shows the correct persona display name in the correct persona color
- [ ] Config panel shows all 4 selectors (scene, target, scale, intention)
- [ ] Tapping "激活面具" twice in rapid succession does NOT double-activate (button is disabled after first tap)

#### Theater Startup
- [ ] Filling in intention and tapping "启动剧场模式" shows the calibration overlay with the persona name
- [ ] Calibration overlay progress bar animates for ~2.5 seconds then disappears
- [ ] Theater screen appears after the overlay with the 4-quadrant wheel
- [ ] Tapping the wheel rotates it and updates the guidance box content (4 different content blocks cycle)
- [ ] Swiping left/right on the wheel also rotates it correctly

#### Gacha
- [ ] After ~10 seconds in Theater, a gacha tip modal appears
- [ ] Gacha tip content is relevant to the scene (not a generic string)
- [ ] Dismissing and waiting another 10 seconds shows a different tip (dedup is working)
- [ ] Phone vibrates on gacha trigger (if vibration is available)

#### Exit & Reset
- [ ] Tapping "卸载面具" shows a confirmation modal
- [ ] Confirming exits Theater and returns to Browse carousel
- [ ] After exit, the wheel is reset to 0° (no rotation carried over)
- [ ] The intention input field is cleared
- [ ] Starting a new session with a different persona works correctly (no ghost state from previous session)
- [ ] Gacha stops firing after exiting Theater

#### Error States
- [ ] If network is offline, trying to open Detail shows an error modal (not a crash)
- [ ] Starting Theater without filling in the intention field shows the correct alert

---

## Commit Message

```
refactor: extract state management from main script (phase 1, no behavior change)

Move all mutable global variables into a single AppState namespace object
(docs/state/app-state.js). No logic changes, no behavior changes, no UI changes.
Load order preserved: app-state.js loads before script.js via classic script tags.
```
