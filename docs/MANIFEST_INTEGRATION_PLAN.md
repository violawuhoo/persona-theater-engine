# Manifest Integration Plan (No Code Changes Applied)

Date: 2026-04-14 (UTC)

## Objective

Integrate runtime persona discovery with the existing manifest as the single source of truth, without changing persona content, schema, or manifest data.

## 1) Files that need changes

### Primary runtime file
- `docs/script.js`

### Why
- It currently hardcodes persona discovery and direct JSON paths via `PERSONA_REGISTRY`.
- All persona list building and per-persona load logic is based on that hardcoded registry.

## 2) Current hardcoded behavior found

### Hardcoded IDs / list
In `docs/script.js`:
- `PERSONA_REGISTRY` is a static array containing fixed entries for `ARCH01`~`ARCH04` and fixed JSON paths (`./database/personas/ARCHNN.json`) and colors.

### Direct file loading without manifest first
In `docs/script.js`:
- `loadPersona(personaId)` resolves `personaId` via `PERSONA_REGISTRY`, then fetches `entry.path` directly.
- `loadPersonaIndex()` iterates `PERSONA_REGISTRY` and fetches each persona JSON directly.
- UI color logic (`getPersonaColor`, `selectPersona`, `startTheater`) also depends on `PERSONA_REGISTRY` lookups.

## 3) Path and publish-structure considerations

### Existing publish mirror
- Runtime is served from `/docs` (`docs/index.html` loads `docs/script.js`).
- Published manifest exists at `docs/database/manifests/personas.manifest.json`.
- Manifest entry paths are repo-relative-style values like `database/personas/ARCH01.json`, which are valid when resolved from `/docs` as `./database/personas/ARCH01.json`.

### Risk to avoid
- Do not assume `/database/...` at server root is web-accessible.
- Keep fetch paths relative to current app base (`./database/...`) for docs-hosted preview.

## 4) Exact recommended loading flow

1. **Bootstrap manifest first**
   - Add a manifest loader function in `docs/script.js`, e.g. `loadPersonaManifest()`.
   - Primary fetch target (docs runtime): `./database/manifests/personas.manifest.json`.

2. **Build runtime registry from manifest**
   - Convert `manifest.personas[]` into runtime entries:
     - `id`, `name`, `subtitle`, `archetype`
     - resolved `json_path`
     - runtime `color` (derived deterministically; see note below)
   - Cache this as dynamic registry state (e.g. `runtimePersonaRegistry`).

3. **Initialize carousel from manifest-derived registry**
   - Update `loadPersonaIndex()` to consume `runtimePersonaRegistry`.
   - For each entry, fetch `json_path` from manifest-derived registry (not hardcoded paths).

4. **Load selected persona by manifest mapping**
   - Update `loadPersona(personaId)` to resolve ID from `runtimePersonaRegistry` and fetch mapped `json_path`.

5. **Preserve existing UI behavior**
   - Keep card rendering, button logic, and selection flow unchanged in structure.
   - Keep existing fallback behavior for failed persona fetches.

6. **Reuse dynamic registry everywhere colors/lookup are needed**
   - Replace `PERSONA_REGISTRY.find(...)` call sites with `runtimePersonaRegistry.find(...)` in:
     - `getPersonaColor()`
     - `selectPersona()`
     - `startTheater()`

## 5) Color handling plan (to keep UI behavior stable)

Current manifest does not carry a `color` field, while UI depends on color for cards and sync overlay.

Minimal safe approach:
- Keep existing four legacy colors as defaults in an internal color map by `id` for backward-compat.
- For new IDs not present in the map, derive deterministic color from ID hash (stable across runs).
- This avoids changing manifest content while preserving current UX for existing personas.

## 6) Minimal safe implementation plan (sequenced)

1. Add `loadPersonaManifest()` + manifest schema guard (`personas` array existence).
2. Add `buildRuntimePersonaRegistry(manifest)` to normalize entries and attach colors.
3. Run manifest bootstrap at app init before `initCarousel()`.
4. Refactor `loadPersonaIndex()` and `loadPersona()` to use runtime registry paths.
5. Refactor lookup-only helpers (`getPersonaColor`, selection/start paths) to runtime registry.
6. Keep existing error messaging and fallback cards unchanged.
7. Add lightweight console diagnostics for manifest load success/failure.

## 7) Validation checklist after implementation (future phase)

- App loads persona cards when manifest is present.
- Card count equals `manifest.total_personas`.
- Selecting each persona fetches exactly its manifest `json_path`.
- Existing UI states (carousel → config → theater) still work.
- Docs-hosted runtime works with `./database/...` paths only.

---

This document is planning-only. No runtime code changes have been applied in this phase.
