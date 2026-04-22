# UI Sync Stability-First Audit (Post-Freeze Recovery)

Date: 2026-04-22
Scope: `docs/index.html`, `docs/script.js`

## 1) Currently enabled helpers (verified)

### A. Config card helper (enabled)
- Event-driven click handlers on `.config-card` update the linked hidden `<select>` and active card class.
- No observer, no interval.

### B. Detail tab helper (enabled)
- Event-driven click handlers toggle `.detail-tab--active`, `aria-selected`, and pane visibility.
- Default tab is set once via `setDetailTab('behavior')`.
- No observer, no interval.

## 2) Core flow stability status

Core flow remains implemented in main runtime logic:
- Browse (carousel) -> `openPersonaDetail(...)`
- Detail -> `activateFromDetail()`
- Config -> `startTheater()`
- Theater transition and runtime content

No observer-based helper is required for this base flow to execute.

## 3) UX regressions still present (by design)

Because high-risk helper sync was disabled, these presentation syncs are currently missing:

1. Hero content on Browse does not track the active carousel card
   - Hero title/slogan/quadrant can remain static placeholders.

2. Theater top bar values are not populated from active persona/scene/target
   - `#theater-display-name`, `#theater-display-scene`, `#theater-display-target` can stay as `—`.

3. Persona theme CSS variables do not update by active persona
   - Accent/glow/gradient remain at default values.

4. Detail hero support copy auto-sync is missing
   - `#detail-hero-slogan` and `#detail-hero-intro` do not automatically mirror derived detail content.

5. Wheel active-sector visual sync to guidance title is missing
   - Highlight state may not follow guidance title changes automatically.

6. Sync overlay localization patch is disabled
   - Status labels remain raw protocol keys (`PERSONA_ID`, `ENV_SCAN`, etc.), which is acceptable for stability.

## 4) Safest restoration plan (NO MutationObserver)

Priority order requested: persona theme -> theater top bar -> hero content.

### Priority 1 — Persona theme update (safe, trivial, event-driven)

Safest method:
1. Add a small `applyPersonaThemeByColor(color)` helper in `script.js`.
2. Call it only at deterministic points:
   - after `openPersonaDetail()` resolves persona and color
   - in `activateFromDetail()` when persona is confirmed
   - in `closePersonaDetail()` / `exitTheater()` to restore default theme
3. Optional: call on carousel `scroll` with throttling (e.g., `requestAnimationFrame`) if Browse hero/theme should track card pre-selection.

No observer needed.

### Priority 2 — Theater top bar update (safe, direct transition update)

Safest method:
1. Add `updateTheaterTopbar(name, scene, target)` helper in `script.js`.
2. Call it once in `startTheater()` after reading `scene/target` and `personaDisplayName`, before theater screen becomes visible.
3. Optionally re-call after AI race completes if any display text should differ (usually not needed).
4. Clear on `exitTheater()`.

No observer needed.

### Priority 3 — Hero content update (safe if tied to existing carousel events)

Safest method:
1. Add `updateBrowseHeroFromIndex(idx)` helper using existing rendered `.card` content or persona index data.
2. Invoke at controlled points only:
   - after `initCarousel()` initial render (idx 0)
   - inside existing carousel `scroll` handler when `currentCarouselIndex` changes
   - after restoring carousel position in `closePersonaDetail()`
3. Wire `#hero-enter-btn` click directly to the current visible card CTA once (event-driven), not via polling.

No observer needed.

## 5) Which fixes can be done without observer logic

All of the priority restorations can be done without MutationObserver:
- Persona theme update: YES (transition/event based)
- Theater top bar update: YES (transition/event based)
- Hero content update: YES (carousel event + explicit button handler)

Additional non-priority syncs that can also avoid observers:
- Detail hero support copy: YES (set directly in `openPersonaDetail()` where detail fields are already populated)
- Wheel active-sector highlight: YES (update directly in `updateGuidance(index)`)

## 6) Recommendation

Proceed with incremental restoration in exactly this order:
1. Persona theme updates (lowest risk, easiest rollback)
2. Theater top bar updates (single transition point)
3. Hero content updates (carousel-index-driven)

Keep all observer-based helpers disabled unless a future requirement proves an event-driven approach is insufficient.
