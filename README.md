# Persona Theater

A browser-based behavioral simulation tool. Choose a persona, pass its instinct check, then enter Theater Mode — a real-time guidance HUD that adapts to your scene, relationship position, and intention.

## How it works

1. **Browse** — swipe through persona cards; each has a slogan, quadrant profile, and core essence
2. **Detail** — read how the persona positions itself, moves, speaks, and what it never does; complete a short instinct check scenario to unlock activation
3. **Config** — pick a mode:
   - **沉浸模式** — choose a scene (9 options across 3 clusters); no target or intention required
   - **策略模式** — choose a scene + relationship position + intention; AI guidance is directed accordingly
4. **Theater** — real-time Mind / Body / Speech / Reaction panels driven by persona data + Moonshot AI; gacha tips surface scene-bound tactical reminders

## Project structure

```
docs/                        # All live files (served directly, no build step)
  index.html                 # App shell + inline tab/config event handlers
  style.css                  # Design system and all component styles
  script.js                  # Theater engine — state, AI calls, UI rendering
  constants.js               # SCENARIO_OVERLAYS, TARGET_OVERLAYS, CONFIG
  data/
    content-extractors.js    # Pure functions: persona JSON → view objects
    gacha-engine.js          # Tip scoring and semantic overlap detection
    utils.js                 # safeStr, stableField, selectableLines, etc.
  state/
    app-state.js             # Single mutable AppState object
  database/
    manifests/               # personas.manifest.json (registry)
    personas/                # ARCH0N.json — each contains consumer_fields + theater_support
```

## Setup

No build step required. Serve the `docs/` folder with any static file server:

```bash
# Python
python3 -m http.server 8080 --directory docs

# Node (npx)
npx serve docs
```

Then open `http://localhost:8080` in your browser.

## API

Theater Mode calls the [Moonshot AI (Kimi)](https://platform.moonshot.cn/) API at `https://api.moonshot.cn/v1/chat/completions`.

Set your API key in `docs/constants.js` under `CONFIG.KIMI_API_KEY`. **Do not commit real keys to a public repository** — proxy through a backend or inject at build time for production use.

## License

MIT — for experimental and educational use.
