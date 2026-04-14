# System Consistency Report
**Generated**: 2026-04-14  
**Source of truth**: GitHub origin/main  
**Local branch**: main (up-to-date with origin/main)

---

## Executive Summary

The persona-theater-engine project demonstrates **strong internal consistency** across the database layer, docs mirror, and frontend integration. All four personas (ARCH01-04) are fully present with all required schema fields intact. The frontend has been enhanced with scenario-aware overlays that inject context-specific tactical instructions alongside persona core logic. The most recent commit (339b7c9) adds SCENARIO_OVERLAYS and TARGET_OVERLAYS with proper extraction and blending into the Theater Mode interface.

**Critical security issue found**: An API key (sk-Y4KxeIZ2zA7n4BMW8SMnSyfRdUPZ3l0aHyxwyMkH1yfVtS2S) is hardcoded and exposed in git history.

---

## 1. Branch Consistency

### Local branches:
- **main** (currently checked out)
  - Tracking: origin/main
  - Status: up-to-date with origin/main
  - HEAD commit: 339b7c9 (feat: scenario-aware Theater Mode with per-scene tactical differentiation)

- **backup-local** 
  - Diverged from main at commit d81dfe3
  - 5 commits behind main (last commit: d81dfe3)
  - Not tracking any remote branch

### Remote tracking:
- **origin/main**
  - HEAD commit: 339b7c9 (same as local main)
  - origin/HEAD → origin/main (correctly set)

### Analysis:
- No local commits ahead of origin/main
- No uncommitted changes on main branch
- backup-local is an orphaned local branch (not affecting main)
- No branch drift — local main is perfectly aligned with remote

---

## 2. Local vs Remote Divergence

### Git status:
```
On branch main
Your branch is up to date with 'origin/main'.
No uncommitted changes on tracked files.
```

### Comparison of key files (local HEAD vs origin/main):
- `database/personas/ARCH01.json` — **MATCH** (identical)
- `database/personas/ARCH02.json` — **MATCH** (identical)
- `database/personas/ARCH03.json` — **MATCH** (identical)
- `database/personas/ARCH04.json` — **MATCH** (identical)
- `docs/database/personas/ARCH01-04.json` — **MATCH** (mirrors match database exactly)
- `docs/script.js` — **MATCH** (includes all SCENARIO_OVERLAYS, TARGET_OVERLAYS, and extraction logic from latest commit)
- `docs/index.html` — **MATCH** (config panel includes scene/target/scale dropdowns)

### Conclusion:
Local filesystem is in perfect sync with origin/main. No hidden or uncommitted changes.

---

## 3. Database Layer

### 3.1 Schema Audit

**Expected schema fields**:
1. `id` — persona identifier
2. `name` — persona name (Chinese)
3. `subtitle` — persona subtitle (English)
4. `archetype` — classification string
5. `core_directive` — core instruction
6. `root_logic_core` — object with social_essence, self_positioning, power_source
7. `cognitive_filtering_algorithm` — object with filtering rules
8. `physical_execution_constraints` — object with gaze_protocol, breathing_protocol, hand_constraints, latency_buffer
9. `universal_forbidden_actions` — array of {action, rule} objects
10. `dynamic_response_protocols` — object mapping scenario keys to response blocks
11. `reference_archetypes` — array of {name, principle} objects

**Manifest file status**: 
- **NOT FOUND** — No `database/manifests/personas.manifest.json` file exists
- No `database/schemas/persona.schema.json` file exists
- The system uses a hardcoded PERSONA_REGISTRY in script.js instead

### 3.2 Persona Registry

The project uses a **hardcoded registry** in script.js (lines 27-32):

```javascript
const PERSONA_REGISTRY = [
  { id: 'ARCH01', path: './database/personas/ARCH01.json', color: '#7ca4d8' },
  { id: 'ARCH02', path: './database/personas/ARCH02.json', color: '#90b8b8' },
  { id: 'ARCH03', path: './database/personas/ARCH03.json', color: '#6a6a6a' },
  { id: 'ARCH04', path: './database/personas/ARCH04.json', color: '#e05a20' }
];
```

Path format: `./database/personas/ARCH0X.json`  
Serving context: Frontend is served from `/docs/` (GitHub Pages), so paths resolve to `/docs/database/personas/ARCH0X.json`

### 3.3 Persona JSON Files Audit

All 4 persona files validated (ARCH01-04):

| Persona | ID Match | Schema Complete | Status |
|---------|----------|-----------------|--------|
| ARCH01 | ✓ ARCH01 | ✓ ALL 11 fields | **VALID** |
| ARCH02 | ✓ ARCH02 | ✓ ALL 11 fields | **VALID** |
| ARCH03 | ✓ ARCH03 | ✓ ALL 11 fields | **VALID** |
| ARCH04 | ✓ ARCH04 | ✓ ALL 11 fields | **VALID** |

**All required fields present in each persona:**
- ✓ id, name, subtitle, archetype, core_directive
- ✓ root_logic_core (social_essence, self_positioning, power_source)
- ✓ cognitive_filtering_algorithm (multiple filters)
- ✓ physical_execution_constraints (center_of_gravity, gaze_protocol, breathing_protocol, hand_constraints, latency_buffer, spatial_sovereignty)
- ✓ universal_forbidden_actions (3-7 forbidden actions per persona)
- ✓ dynamic_response_protocols (6-12 scenario handlers per persona)
- ✓ reference_archetypes (2-3 historical/mythological references per persona)

**Data integrity**: 
- All persona IDs match filenames and internal id fields
- All Chinese names properly encoded
- All English subtitles match persona concepts
- All protocol content is substantive

---

## 4. Docs Mirror Audit

### 4.1 Directory Structure

**Source**: `/database/personas/` contains:
- ARCH01.json, ARCH01.md
- ARCH02.json, ARCH02.md
- ARCH03.json, ARCH03.md
- ARCH04.json, ARCH04.md

**Mirror**: `/docs/database/personas/` contains:
- ARCH01.json, ARCH01.md
- ARCH02.json, ARCH02.md
- ARCH03.json, ARCH03.md
- ARCH04.json, ARCH04.md

### 4.2 File Comparison

- ✓ All 4 persona JSON files are **bit-identical** between database/ and docs/database/
- ✓ All 4 persona markdown files are **bit-identical**
- ✓ Complete mirror — all 8 files present in both locations
- ✓ File sizes match perfectly

### Conclusion:
Docs mirror is in perfect sync with database source.

---

## 5. Frontend Integration

### 5.1 script.js Key Components

1. **CONFIG block** (lines 9-14)
   - ✓ KIMI_API_KEY present
   - ✓ AI_TIMEOUT_MS: 2000
   - ✓ SYNC_DURATION_MS: 2500
   - ✓ GACHA_INTERVAL_MS: 10000

2. **PERSONA_REGISTRY** (lines 27-32)
   - ✓ All 4 personas listed with correct paths
   - ✓ Color assignments for each persona

3. **SCENARIO_OVERLAYS** (lines 40-101)
   - ✓ Covers 6 scenes:
     - 商务谈判/签约
     - 半正式晚宴/酒局
     - 部门会议/述职
     - 面试/潜在合伙人面谈
     - 私人社交/相亲
     - 偶然遭遇战
   - ✓ Each scene has dynamics, priority_protocols, and tactical_focus (mind/body/speech/reaction)
   - ✓ All 4 subsections fully populated

4. **TARGET_OVERLAYS** (lines 104-110)
   - ✓ Covers 5 target types:
     - 甲方/决策者
     - 竞争对手/同行
     - 下属/执行层
     - 朋友/熟人
     - 陌生人/潜在资源
   - ✓ Each target has psychological profile text

5. **extractTheaterContent()** (lines 461-587)
   - ✓ Blends persona data + scene overlay + target profile
   - ✓ Builds four dimensions: mind (心法), body (姿态), speech (语言), reaction (反应)
   - ✓ Scene overlay injects tactical_focus content
   - ✓ Persona protocols used as bonus reference material
   - ✓ Forbidden actions appended to reaction quadrant

6. **startTheater()** (lines 594-692)
   - ✓ Reads scene, target, scale, intention from form inputs
   - ✓ Shows sync overlay with persona metadata
   - ✓ Calls extractTheaterContent() to build local content
   - ✓ Races AI call against CONFIG.AI_TIMEOUT_MS
   - ✓ Falls back to local protocol data if AI times out

7. **callAIWithPersonaProtocol()** (lines 695-760+)
   - ✓ Hits Moonshot.cn API
   - ✓ Constructs system prompt with complete persona context
   - ✓ Includes '━━ 战场特殊规则' section with scene dynamics and target profile
   - ✓ Injects priority protocol list for current scene

### 5.2 index.html Structure

- ✓ Config panel with scene, target, scale, intention inputs
- ✓ Scene dropdown: all 6 scenes listed
- ✓ Target dropdown: all 5 targets listed
- ✓ Theater screen with 4-sector wheel
- ✓ Sync overlay for calibration sequence

### 5.3 Path Resolution

**Frontend context**: Served from `/docs/` root  
**Path in registry**: `./database/personas/ARCH01.json`  
**Resolution**: `/docs/database/personas/ARCH01.json` ✓ **EXISTS**

---

## 6. Cross-Layer Consistency

### 6.1 Data Flow Chain

```
database/personas/ARCH01.json (source)
    ↓ [mirrored to]
docs/database/personas/ARCH01.json
    ↓ [referenced in]
PERSONA_REGISTRY[0].path
    ↓ [fetched by]
fetch(entry.path)
    ↓ [loaded as]
currentPersonaData
    ↓ [used by]
extractTheaterContent(currentPersonaData, scene, target)
```

Result: **✓ VALID** — all paths resolve correctly

### 6.2 Scenario Overlay Coverage

**6 scenes in SCENARIO_OVERLAYS**: All populated ✓
**6 scenes in frontend dropdown**: All listed ✓
**Match**: **✓ PERFECT**

### 6.3 Target Profile Coverage

**5 targets in TARGET_OVERLAYS**: All populated ✓
**5 targets in frontend dropdown**: All listed ✓
**Match**: **✓ PERFECT**

### 6.4 Scaling Risks

1. **Hardcoded PERSONA_REGISTRY** — Adding personas requires editing JavaScript
2. **Hardcoded SCENARIO_OVERLAYS/TARGET_OVERLAYS** — Not in structured format, difficult to maintain
3. **No manifest-based auto-discovery** — Doesn't scale beyond ~10 personas
4. **Relative paths** — Depend on /docs/ serving context; break if server path changes

---

## 7. Issues (Blocking)

### Issue #1: Exposed API Key in Public Repository
**Severity**: 🔴 CRITICAL  
**File**: `/docs/script.js` line 10  
**Content**: `KIMI_API_KEY: 'sk-Y4KxeIZ2zA7n4BMW8SMnSyfRdUPZ3l0aHyxwyMkH1yfVtS2S'`

This key is hardcoded in a public repository. Comment indicates prior exposure in git history.

**Impact**:
- Any user can use this API key
- Risk of quota exhaustion and financial charges
- Cannot deploy to production with exposed credentials

**Action Required**: Rotate key immediately and remove from git history.

---

## 8. Warnings (Non-Blocking)

### Warning #1: Missing Manifest File
No `database/manifests/personas.manifest.json` exists. Uses hardcoded PERSONA_REGISTRY instead. Doesn't scale beyond ~4 personas.

### Warning #2: Hardcoded Overlays
SCENARIO_OVERLAYS and TARGET_OVERLAYS are JS object literals (70 lines total). Should be external JSON for maintainability.

### Warning #3: Relative Path Fragility
Paths depend on serving from `/docs/` root. Breaks if URL structure changes (e.g., subdirectory deployment).

### Warning #4: No Schema Validation
Persona JSON files loaded with loose validation. Missing fields silently filled with defaults.

### Warning #5: Missing .gitignore for Secrets
No explicit exclusion for `.env` or secret files. Risk of accidental credential commits.

---

## 9. Confirmed Correct

✓ **All 4 Personas Present and Valid** — ARCH01-04 complete with all required fields  
✓ **Perfect Docs Mirror** — Byte-for-byte identical across all files  
✓ **Scenario-Aware Theater Mode Fully Integrated** — 6 scenes + 5 targets properly blended with persona logic  
✓ **Proper Data Fallbacks** — Graceful handling of missing fields  
✓ **Local-First Architecture** — Can run entirely offline if AI times out  
✓ **No Branch Drift** — Local main perfectly synced with origin/main  
✓ **Frontend-Backend Alignment** — All config inputs properly threaded through system

---

## 10. Risk Assessment

| Area | Risk Level | Notes |
|------|-----------|-------|
| Database Layer | LOW | All files present, complete, and valid |
| Docs Mirror | LOW | Perfect sync between source and mirror |
| Frontend Integration | MEDIUM | Hardcoded API key (critical security risk) |
| Scaling | MEDIUM | Requires code edits to add personas beyond 4 |
| Deployment | CRITICAL | Cannot go live with exposed API key |

---

## 11. Recommended Next Steps

### Priority 1: Security (URGENT)
1. Rotate API key on Moonshot.cn immediately
2. Remove key from git history (git filter-branch)
3. Implement environment-based key injection (no hardcoding)

### Priority 2: Maintainability (NEXT)
4. Extract SCENARIO_OVERLAYS to `/database/overlays/scenarios.json`
5. Extract TARGET_OVERLAYS to `/database/overlays/targets.json`
6. Create `personas.manifest.json` for dynamic registry building

### Priority 3: Robustness (OPTIONAL)
7. Add JSON Schema validation
8. Add base path configuration for portable deployment
9. Update `.gitignore` to exclude secret files

---

## Conclusion

The system is **architecturally sound** and **data-consistent** across all layers. All four personas are complete, scenario and target overlays are properly integrated, and the local-first fallback architecture works correctly.

**The only blocking issue is the exposed API key.** Once rotated and removed from history, the system is production-ready from a consistency perspective.

