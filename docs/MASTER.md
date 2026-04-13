# Persona Draft — Master Context

# MASTER.md — Persona Draft (Identity Collapse Engine)
> Single context file for AI-assisted development. Inject this at the start of every Claude Code session.
> Last updated: April 2026

---

## 1. What This App Is

**Persona Draft** is a behavioral rehearsal and social simulation tool. Users "load" a complex persona (e.g. ARCH-01: Marie Antoinette) before a high-stakes interaction — a negotiation, a pitch, a difficult conversation — and receive a real-time HUD showing how to think, move, and speak as that persona.

The core experience is the **5-second Identity Collapse ritual**: a timed calibration overlay that synchronizes the user's physical and mental state with a 4,000-word persona DNA before they enter the interaction.

**Target users:** Professionals in high-pressure environments (VC/PE, negotiations), individuals practicing social performance, or those interested in logic-driven personality frameworks.

**Design philosophy:** This is a Tactical Engine, not a coach. No soothing language. No affirmations. Instructions are clinical, direct, and body-mind-speech aligned.

---

## 2. Current Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| AI Engine | Claude API (`claude-sonnet-4-20250514`) — replacing Gemini |
| Persona data | Paired `.md` (human-readable) + `.json` (machine-executable shadow files) |
| Local dev server | `npx serve src` or VS Code Live Server (required for CORS on local JSON fetch) |
| Version control | Git + GitHub |
| Deployment | TBD (currently local only) |

**Environment variables (names only — never commit values):**
- `CLAUDE_API_KEY` — for real-time tactical instruction generation

---

## 3. Repo Structure

```
/ (repo root)
├── .gitignore
├── README.md
├── MASTER.md  ← you are here (also lives in /docs)
│
├── docs/
│   ├── MASTER.md          ← this file
│   ├── PRD.md             ← product requirements
│   └── CHANGELOG.md       ← version history
│
├── src/
│   ├── index.html
│   ├── script.js          ← main logic (fetch, normalize, AI call, UI)
│   ├── style.css
│   └── js/                ← future: split script.js into modules
│       ├── engine.js      ← persona logic
│       ├── api.js         ← Claude API calls
│       └── ui.js          ← DOM / Theater mode
│
├── database/
│   └── personas/
│       ├── ARCH01.md      ← human-readable persona DNA
│       ├── ARCH01.json    ← machine-executable shadow file
│       ├── ARCH02.md
│       ├── ARCH02.json
│       ├── ARCH03.md
│       ├── ARCH03.json
│       ├── ARCH04.md
│       └── ARCH04.json
│
└── assets/
    └── (images, fonts, sounds)
```

**Important:** `script.js` lives in `/src`, so all fetch paths to persona files must use `../database/personas/` not `/database/personas/`.

---

## 4. Architecture

The app has three layers:

**Storage layer** — `/database/personas/` contains paired files per persona:
- `.md` file: full 4,000-word persona DNA for the user to read
- `.json` shadow file: structured, machine-readable subset sent to the AI (reduces token usage ~70%)

**Logic layer** — `script.js` does three things:
1. **Fetch** — grabs the correct JSON based on the user's persona/scenario selection
2. **Normalize** — cleans incoming data (handles dash variations `—` vs `——`, missing modules, malformed fields)
3. **Instruct** — sends a 3-layer tactical prompt to Claude API: System Layer + Persona Layer + Scenario Layer

**UI layer** — two modes:
1. **Calibration (Identity Collapse)** — 5-second timed overlay rendering `universal_constraints` from the persona JSON
2. **Theater mode** — real-time HUD mapping `activePersona.modules` to the current scene, updating Mind / Body / Speech panels in the DOM

---

## 5. Persona JSON Shadow File Format

Each `.json` file follows this structure:

```json
{
  "id": "ARCH-01",
  "name": "Marie Antoinette",
  "archetype": "The Queen",
  "universal_constraints": [
    "Never break eye contact during power assertions",
    "Speak only when silence has been maximized"
  ],
  "cognitive_filtering_algorithm": {
    "primary_filter": "...",
    "secondary_filter": "..."
  },
  "modules": {
    "negotiation": {
      "mind": "...",
      "body": "...",
      "speech": "..."
    },
    "pitch": {
      "mind": "...",
      "body": "...",
      "speech": "..."
    }
  }
}
```

**Known data quality issues:**
- ARCH-04 uses non-standard dash characters (`——`) which can break `.split()` — regex must be applied strictly
- Some personas are missing the `cognitive_filtering_algorithm` block — guard all `Object.entries()` calls with optional chaining

---

## 6. Claude API Integration

Replacing Gemini. The tactical prompt structure stays the same — only the API call changes.

**Endpoint:** `POST https://api.anthropic.com/v1/messages`

**Prompt structure (3 layers):**
```
System Layer:   "You are a Tactical Engine. No coaching. No affirmations. 
                 Clinical, direct instructions only."
Persona Layer:  [injected from shadow file JSON]
Scenario Layer: [user's selected scene, e.g. "negotiation", "pitch"]
```

**Example API call:**
```javascript
const response = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": CLAUDE_API_KEY,
    "anthropic-version": "2023-06-01"
  },
  body: JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: SYSTEM_LAYER,
    messages: [
      { role: "user", content: PERSONA_LAYER + SCENARIO_LAYER }
    ]
  })
});
const data = await response.json();
const instruction = data.content[0].text;
```

---

## 7. Known Bugs

| Bug | Location | Description |
|---|---|---|
| API race condition | `script.js` | If Claude API takes >2.5s, the Identity Collapse overlay finishes but the UI hangs waiting for data. Needs async decoupling — start the API call and the animation in parallel, render Theater mode only when both are resolved. |
| Dash character parsing | ARCH-04 JSON | Non-standard `——` characters break `.split()`. Fix: use regex `/[-—–]+/` instead of `.split('-')`. |
| Missing schema validation | `script.js` | If `cognitive_filtering_algorithm` block is absent from a persona file, `Object.entries()` throws silently. Fix: add optional chaining `persona.cognitive_filtering_algorithm?.` before all such calls. |

---

## 8. Features Built

- Dynamic persona loader — scans `/database/personas/` for JSON shadow files
- The Wheel UI — 360-degree persona and scenario selection interface
- Identity Collapse sequence — 5-second timed calibration overlay
- Theater mode — real-time HUD with Mind / Body / Speech panels
- Fault-tolerant engine — optional chaining and regex parsing for dirty persona data

## 9. Features Planned

| Feature | Priority | Description |
|---|---|---|
| Swap Gemini → Claude API | High | Already architected, needs implementation in `script.js` |
| Fix race condition | High | Decouple animation and API call |
| "The Echo" overlay | Medium | Ghost-text of original literary quotes behind clinical instructions |
| Physiological syncing | Medium | CSS breathing metronomes and haptic visual pulses |
| Fail-state feedback | Medium | "De-synchronization" button — user logs character breaks, receives logical reprimand |
| Schema validation | Medium | Validate persona JSON on load, surface errors clearly |
| iOS app | Future | Web MVP first, then native iOS |

---

## 10. How to Run Locally

```bash
# Clone the repo
git clone https://github.com/violawuhoo/persona-theater-engine.git
cd persona-theater-engine

# Option A — npx (no install needed)
npx serve src

# Option B — VS Code Live Server
# Right-click src/index.html → Open with Live Server
```

Then open `http://localhost:3000` (or whatever port Live Server uses).

**API key:** Create a `.env` file in the root (never commit this):
```
CLAUDE_API_KEY=your_key_here
```

Note: since this is a vanilla JS frontend with no build step, you'll need to load the API key carefully — either via a local proxy or by temporarily hardcoding during development (never commit). A lightweight Node proxy is recommended before any deployment.

---

## 11. Two-Laptop Workflow

- **ThinkPad X13 (Windows)** — daytime dev, Git Bash for terminal
- **MacBook Air** — nighttime dev, native Terminal
- Both clone the same GitHub repo
- Always `git pull` before starting a session
- Always `git push` at the end of a session
- Never work on the same file simultaneously on both machines

---

## 12. Session Startup Checklist for Claude Code

1. Read this MASTER.md
2. Run `git pull` to get latest changes
3. Check `docs/CHANGELOG.md` for what was last worked on
4. Start with the highest priority bug or feature from Section 9
