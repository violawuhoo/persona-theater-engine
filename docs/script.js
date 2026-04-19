// ============================================================
// PERSONA THEATER SYSTEM — script.js
// Data contract: consumer_fields (Browse/Detail) + theater_support (Theater)
// Old fields (stable_fields, soft_fields, root_logic_core, etc.) are REMOVED.
// ============================================================

// ── CONFIGURATION ─────────────────────────────────────────────
// CONFIG → docs/constants.js

// ── GLOBAL STATE ─────────────────────────────────────────────
// Moved to docs/state/app-state.js as AppState.*
// All mutable session variables are now on the AppState namespace object.

// ── PERSONA REGISTRY (MANIFEST-DRIVEN) ───────────────────────
// PERSONA_MANIFEST_PATH, LEGACY_PERSONA_COLORS → docs/constants.js
// runtimePersonaRegistry, runtimeManifestMeta   → docs/state/app-state.js

// normalizeManifestPath, deterministicColorFromId, getColorForPersonaId → docs/utils.js

async function loadPersonaManifest() {
  console.log(`[Manifest] → Fetching: ${PERSONA_MANIFEST_PATH}`);
  const response = await fetch(PERSONA_MANIFEST_PATH, { cache: 'no-store' });
  console.log(`[Manifest] HTTP ${response.status} ${response.statusText} ← ${PERSONA_MANIFEST_PATH}`);

  if (!response.ok) {
    throw new Error(`Manifest HTTP ${response.status}`);
  }

  const manifest = await response.json();
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.personas)) {
    throw new Error('Manifest malformed: missing personas[]');
  }

  AppState.runtimeManifestMeta = {
    schema_version: safeStr(manifest.schema_version, 'unknown'),
    total_personas: Number(manifest.total_personas) || manifest.personas.length
  };
  console.log(`[Manifest] ✓ Loaded ${manifest.personas.length} entries (schema ${AppState.runtimeManifestMeta.schema_version}).`);
  return manifest;
}

function buildRuntimePersonaRegistry(manifest) {
  const seenIds = new Set();
  const list = (manifest.personas || []).map(entry => {
    const id = safeStr(entry.id).trim().toUpperCase();
    const path = normalizeManifestPath(entry.json_path);
    const status = safeStr(entry.status, 'active').toLowerCase();
    return {
      id,
      path,
      status,
      color: getColorForPersonaId(id),
      name: safeStr(entry.name, id),
      subtitle: safeStr(entry.subtitle, 'Protocol Ready'),
      archetype: safeStr(entry.archetype, '未分类原型')
    };
  }).filter(entry => {
    if (!entry.id || !entry.path) {
      console.warn('[Manifest] ⚠ Skipping invalid entry:', entry);
      return false;
    }
    if (entry.status !== 'active') {
      console.log(`[Manifest] ↷ Skipping non-active persona: ${entry.id} (${entry.status})`);
      return false;
    }
    if (seenIds.has(entry.id)) {
      console.warn(`[Manifest] ⚠ Duplicate persona id in manifest: ${entry.id} — keeping first entry only.`);
      return false;
    }
    seenIds.add(entry.id);
    return true;
  });

  AppState.runtimePersonaRegistry = list;
  console.log(`[Manifest] ✓ Runtime registry built: ${AppState.runtimePersonaRegistry.length} personas.`);
  return AppState.runtimePersonaRegistry;
}

async function ensureRuntimeRegistry() {
  if (AppState.runtimePersonaRegistry.length > 0) return AppState.runtimePersonaRegistry;
  const manifest = await loadPersonaManifest();
  return buildRuntimePersonaRegistry(manifest);
}

// ── SCENARIO OVERLAYS, TARGET OVERLAYS, SCHEMA DEFAULTS ──────
// Moved to docs/constants.js

// ── UTILITIES ─────────────────────────────────────────────────
// safeStr, safeGet → docs/utils.js

// Returns the colour for the currently selected persona.
function getPersonaColor() {
  if (!AppState.selectedPersona) return '#00f2ff';
  const entry = AppState.runtimePersonaRegistry.find(p => p.id === AppState.selectedPersona);
  return entry ? entry.color : '#00f2ff';
}

// ── CUSTOM MODAL (replaces browser alert / confirm) ───────────

/**
 * showModal — core primitive.
 * Returns a Promise that resolves to true (confirm) or false (cancel).
 */
function showModal(message, { title = '提示', color = '#00f2ff', type = 'alert' } = {}) {
  return new Promise(resolve => {
    const overlay    = document.getElementById('modal-overlay');
    const titleEl    = document.getElementById('modal-title');
    const messageEl  = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn  = document.getElementById('modal-cancel');

    titleEl.innerText   = title;
    messageEl.innerText = message;
    confirmBtn.style.background = color;
    // Use dark text on light/neon colours; white on everything else.
    confirmBtn.style.color = ['#00f2ff', '#2ecc71', '#90b8b8'].includes(color) ? '#000' : '#fff';

    if (type === 'confirm') {
      cancelBtn.classList.remove('hidden');
    } else {
      cancelBtn.classList.add('hidden');
    }

    overlay.classList.remove('hidden');

    const done = (result) => {
      overlay.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick  = null;
      resolve(result);
    };

    confirmBtn.onclick = () => done(true);
    cancelBtn.onclick  = () => done(false);
  });
}

function showAlert(message, { title = '提示', color = '#00f2ff' } = {}) {
  return showModal(message, { title, color, type: 'alert' });
}

function showConfirm(message, { title = '确认操作', color = '#e74c3c' } = {}) {
  return showModal(message, { title, color, type: 'confirm' });
}

// ── SCHEMA VALIDATOR ──────────────────────────────────────────
// Validates that raw persona JSON conforms to the new contract.
// Throws an Error if the data is invalid or uses the old format.
// Returns the raw JSON unchanged — no remapping, no fallback fabrication.
function normalizePersonaSchema(raw) {
  if (!raw || typeof raw !== 'object') {
    console.error('[Schema] Raw data is null or not an object.');
    throw new Error('Persona data is null or not an object');
  }

  // Reject old format — stable_fields is not supported
  if (raw.stable_fields) {
    console.error(`[Schema] ✗ Old persona format detected in "${safeStr(raw.id)}" (stable_fields present). This format is no longer supported.`);
    throw new Error(`Persona "${safeStr(raw.id)}" uses old format (stable_fields). Please regenerate from the new compiler.`);
  }

  const cf = raw.consumer_fields;
  const ts = raw.theater_support;

  // consumer_fields must exist and be an object
  if (!cf || typeof cf !== 'object') {
    console.error(`[Schema] ✗ consumer_fields missing in "${safeStr(raw.id)}"`);
    throw new Error(`Persona "${safeStr(raw.id)}" is missing consumer_fields`);
  }

  // theater_support must exist and be an object
  if (!ts || typeof ts !== 'object') {
    console.error(`[Schema] ✗ theater_support missing in "${safeStr(raw.id)}"`);
    throw new Error(`Persona "${safeStr(raw.id)}" is missing theater_support`);
  }

  // Warn on missing consumer_fields sub-keys (do not fabricate)
  ['display_name', 'quadrants', 'slogan', 'core_essence', 'social_essence', 'signature_lines_pool', 'taboos'].forEach(key => {
    if (cf[key] === undefined || cf[key] === null) {
      console.warn(`[Schema] ⚠ consumer_fields.${key} missing in "${safeStr(raw.id)}" — field will render as missing marker`);
    }
  });

  // Warn on missing theater_support sub-keys (do not fabricate)
  ['logic_axes', 'scene_tactics', 'expression_modulators', 'reaction_cues'].forEach(key => {
    if (ts[key] === undefined || ts[key] === null) {
      console.warn(`[Schema] ⚠ theater_support.${key} missing in "${safeStr(raw.id)}" — theater output will be degraded`);
    }
  });

  console.log(`[Schema] ✓ Contract validated: ${safeStr(raw.id)} — ${safeStr(cf.display_name)}`);
  return raw;  // Pass-through: no remapping
}

// ── DYNAMIC LOADER ────────────────────────────────────────────
async function loadPersona(personaId) {
  try {
    await ensureRuntimeRegistry();
  } catch (e) {
    console.error('[DataManager] ✗ Registry initialization failed:', e.message);
    throw new Error(`Manifest registry init failed: ${e.message}`);
  }
  const cleanId = safeStr(personaId).trim().toUpperCase();
  const entry   = AppState.runtimePersonaRegistry.find(p => p.id.toUpperCase() === cleanId);

  if (!entry) {
    console.error(`[DataManager] ✗ Persona "${cleanId}" not found in runtime registry.`);
    console.log('[DataManager] Available IDs:', AppState.runtimePersonaRegistry.map(p => p.id).join(', '));
    throw new Error(`Persona "${cleanId}" not in registry.`);
  }

  console.log(`[DataManager] → Fetching: ${entry.path}`);

  let response;
  try {
    response = await fetch(entry.path, { cache: 'no-store' });
  } catch (networkErr) {
    console.error(`[DataManager] ✗ Network error fetching ${entry.path}:`, networkErr);
    throw new Error(`Network error: ${networkErr.message}`);
  }

  console.log(`[DataManager] HTTP ${response.status} ${response.statusText} ← ${entry.path}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${entry.path}`);
  }

  let raw;
  try {
    raw = await response.json();
    console.log(`[DataManager] ✓ JSON parsed. Top-level keys:`, Object.keys(raw));
  } catch (parseErr) {
    console.error(`[DataManager] ✗ JSON parse failed for ${entry.path}:`, parseErr);
    throw new Error(`JSON parse error: ${parseErr.message}`);
  }

  // Validate new contract — throws if invalid or old format
  AppState.currentPersonaData = normalizePersonaSchema(raw);

  if (safeStr(AppState.currentPersonaData.id).toUpperCase() !== cleanId) {
    console.warn(`[DataManager] ⚠ ID mismatch: selected ${cleanId}, loaded ${AppState.currentPersonaData.id}`);
  }
  console.log(`[DataManager] ✓ Persona ready: ${safeStr(AppState.currentPersonaData.consumer_fields.display_name)} (${cleanId})`);
  return AppState.currentPersonaData;
}

// ── INDEX INITIALIZATION ──────────────────────────────────────
// Fetches all registered JSONs; each persona JSON is stored directly
// in the index (plus a color property) so extract functions can read
// consumer_fields directly from the index item.
async function loadPersonaIndex() {
  let registry;
  try {
    registry = await ensureRuntimeRegistry();
  } catch (e) {
    console.error('[Index] ✗ Manifest load failed:', e.message);
    return [];
  }

  const index   = [];
  const results = await Promise.allSettled(
    registry.map(entry => fetch(entry.path, { cache: 'no-store' })
      .then(r => {
        console.log(`[Index] HTTP ${r.status} ← ${entry.path}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => ({ data, color: entry.color }))
    )
  );

  results.forEach((result, i) => {
    const entry = registry[i];
    if (result.status === 'fulfilled') {
      let persona;
      try {
        persona = normalizePersonaSchema(result.value.data);
      } catch (e) {
        console.warn(`[Index] ✗ Schema validation failed for ${entry.id}:`, e.message);
        index.push({
          id:     entry.id,
          color:  entry.color,
          failed: true
        });
        return;
      }
      // Merge color into the raw persona object for carousel use
      index.push({ ...persona, color: result.value.color });
    } else {
      console.warn(`[Index] ✗ Failed to load ${entry.id}:`, result.reason.message);
      index.push({
        id:     entry.id,
        color:  entry.color,
        failed: true
      });
    }
  });

  return index;
}

// ── CONTENT EXTRACTION LAYER ─────────────────────────────────
// All Browse, Detail, and Theater rendering must go through these functions.
// Direct inline field access on persona data is not permitted in render paths.
// Single data-source rule:
//   Browse / Detail → consumer_fields only
//   Theater        → theater_support only

// MISSING sentinel    → docs/constants.js
// stableField, selectableLines → docs/utils.js

// extractBrowseContent  → docs/data/content-extractors.js
// extractDetailContent  → docs/data/content-extractors.js

// ── BROWSE QUADRANT BLOCK ─────────────────────────────────────
// Builds a compact 2×2 E/O/R/B indicator grid from consumer_fields.quadrants.
// Values are plain numbers in [-1, 1]; scaled to integer percentages with sign.
function buildQuadrantBlock(params) {
  if (!params || typeof params !== 'object') return '';
  const dims  = ['E', 'O', 'R', 'B'];
  const cells = dims.map(k => {
    const v = params[k];
    if (typeof v !== 'number') return '';
    const pct = (v >= 0 ? '+' : '') + Math.round(v * 100);
    const col = v >= 0 ? '#00f2ff' : '#e05a20';
    return `<div style="display:flex;justify-content:space-between;align-items:center;` +
           `padding:3px 6px;background:rgba(255,255,255,0.04);border-radius:4px;">` +
           `<span style="font-size:9px;opacity:0.45;letter-spacing:.08em">${k}</span>` +
           `<span style="font-size:11px;font-weight:600;color:${col}">${pct}</span></div>`;
  }).filter(Boolean);
  if (cells.length === 0) return '';
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:8px 0;">${cells.join('')}</div>`;
}

// ── CAROUSEL UI ───────────────────────────────────────────────
async function initCarousel() {
  const carousel      = document.getElementById('carousel');
  const dotsContainer = document.getElementById('dots');

  carousel.innerHTML      = '<div class="load-error">正在加载人格数据库...</div>';
  dotsContainer.innerHTML = '';

  const personaIndex = await loadPersonaIndex();
  carousel.innerHTML = '';

  if (personaIndex.length === 0) {
    carousel.innerHTML = '<div class="load-error">人格数据库加载失败 — 请刷新重试。</div>';
    return;
  }

  personaIndex.forEach((p, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';

    const btnLabel    = p.failed ? '加载失败' : '了解更多';
    const btnDisable  = p.failed ? 'disabled'  : '';
    const onclickAttr = p.failed ? ''           : `onclick="openPersonaDetail('${p.id}')"`;

    // Browse card: rendered via extractBrowseContent (consumer_fields only)
    const browse       = p.failed ? null : extractBrowseContent(p);
    const quadrantHtml = browse ? buildQuadrantBlock(browse.quadrant) : '';
    const cardName     = browse ? browse.name   : p.id;
    const cardSlogan   = browse ? browse.slogan : MISSING;
    wrapper.innerHTML = `
      <div class="card ${p.failed ? 'card--failed' : ''}">
        <div class="title">${cardName}</div>
        ${quadrantHtml}
        <div class="desc">${p.failed ? '该人格协议加载失败' : `"${cardSlogan}"`}</div>
        <button class="btn" style="background:${p.color};box-shadow:0 0 18px ${p.color}44;"
                ${onclickAttr} ${btnDisable}>${btnLabel}</button>
      </div>
    `;
    carousel.appendChild(wrapper);

    const dot = document.createElement('div');
    dot.className = `dot ${i === 0 ? 'active' : ''}`;
    dot.style.background = i === 0 ? p.color : '';
    dotsContainer.appendChild(dot);
  });

  carousel.addEventListener('scroll', () => {
    const idx = Math.round(carousel.scrollLeft / window.innerWidth);
    AppState.currentCarouselIndex = idx;   // keep in sync so Detail can restore position
    document.querySelectorAll('.dot').forEach((d, i) => {
      const color = personaIndex[i] ? personaIndex[i].color : '#fff';
      d.classList.toggle('active', i === idx);
      d.style.background = i === idx ? color : '';
    });
  });

  console.log(`[Carousel] ✓ Rendered ${personaIndex.length} persona cards.`);
}

// ── PERSONA SELECTION ─────────────────────────────────────────
// Activation bypass removed. All callers must go through Detail.
function selectPersona(personaId) {
  console.warn('[Select] selectPersona() is a bypass-safe stub — routing to Detail instead.');
  openPersonaDetail(personaId);
}

// ── PERSONA DETAIL VIEW ───────────────────────────────────────
// Opens Detail for a persona WITHOUT activating it or entering Config.
async function openPersonaDetail(personaId) {
  const cleanId = safeStr(personaId).trim().toUpperCase();

  // Snapshot carousel position before leaving Browse
  const carousel = document.getElementById('carousel');
  AppState.currentCarouselIndex = Math.round(carousel.scrollLeft / window.innerWidth);

  try {
    await ensureRuntimeRegistry();
  } catch (e) {
    showError(`人格索引加载失败\n\n原因：${e.message}`);
    return;
  }

  const entry = AppState.runtimePersonaRegistry.find(p => p.id === cleanId);
  const color = entry ? entry.color : '#00f2ff';

  // Show transient loading state on the card button
  const btn = document.querySelector(`[onclick="openPersonaDetail('${personaId}')"]`);
  if (btn) { btn.textContent = '加载中...'; btn.disabled = true; }

  try {
    // loadPersona fetches + validates full data → stores in currentPersonaData
    // selectedPersona is NOT set here; that only happens in activateFromDetail()
    await loadPersona(cleanId);

    const data = AppState.currentPersonaData;

    // ── Populate fields via extraction layer ──────────────────
    // All reads go through consumer_fields via extractDetailContent().

    // Header: display_name (stable) — from consumer_fields
    const nameEl = document.getElementById('detail-persona-name');
    nameEl.innerText   = stableField(data.consumer_fields.display_name);
    nameEl.style.color = color;

    // All Detail content extracted through extractDetailContent (consumer_fields only)
    const detail = extractDetailContent(data);

    // 核心本质 (stable)
    document.getElementById('detail-core-essence').innerText   = detail.core_essence;

    // 社交本质 (stable)
    document.getElementById('detail-social-essence').innerText = detail.social_essence;

    // 典型表达 (selectable, max 3, deduped)
    const exprEl = document.getElementById('detail-expressions');
    exprEl.innerHTML = detail.expressions.length > 0
      ? detail.expressions.map(e => `<div class="detail-expr-line">↳ ${e}</div>`).join('')
      : `<div class="detail-expr-line">${MISSING}</div>`;

    // 人物禁忌 (stable strings, max 3 — no action/rule splitting)
    document.getElementById('detail-forbidden').innerText = detail.taboos.length > 0
      ? detail.taboos.join('\n\n')
      : MISSING;

    // Style activate button with persona colour
    const activateBtn = document.getElementById('detail-activate-btn');
    if (activateBtn) {
      activateBtn.style.background = color;
      activateBtn.style.boxShadow  = `0 0 18px ${color}44`;
      activateBtn.style.color      = ['#00f2ff','#2ecc71','#90b8b8'].includes(color) ? '#000' : '#fff';
    }

    // ── Navigate: hide Browse, show Detail with fade-in+slide-up ─
    document.getElementById('carousel').classList.add('hidden');
    document.getElementById('dots').classList.add('hidden');
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('hidden', 'detail-leaving');
    void panel.offsetWidth;                          // force reflow to restart animation
    panel.classList.add('detail-entering');
    setTimeout(() => panel.classList.remove('detail-entering'), 260);
    window.scrollTo(0, 0);

    console.log(`[Detail] ✓ Showing detail for: ${safeStr(data.consumer_fields.display_name)} (index ${AppState.currentCarouselIndex})`);
  } catch (e) {
    console.error('[Detail] ✗ Load failed:', e.message);
    showError(`人格协议加载失败\n\n原因：${e.message}\n\n请检查网络或刷新重试。`);
    if (btn) { btn.textContent = '了解更多'; btn.disabled = false; }
    AppState.currentPersonaData = null;
  }
}

// Bug 2 fix: reset every carousel CTA that may have been left in a loading/disabled state.
function resetCarouselButtons() {
  document.querySelectorAll('[onclick^="openPersonaDetail("]').forEach(btn => {
    btn.textContent = '了解更多';
    btn.disabled    = false;
  });
}

// Returns to Browse, restoring the exact carousel position.
function closePersonaDetail() {
  const panel = document.getElementById('detail-panel');
  panel.classList.add('detail-leaving');
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('detail-leaving');

    document.getElementById('carousel').classList.remove('hidden');
    document.getElementById('dots').classList.remove('hidden');

    // Restore carousel scroll position
    const carousel = document.getElementById('carousel');
    carousel.scrollLeft = AppState.currentCarouselIndex * window.innerWidth;

    // Clear transient persona load — not activated
    AppState.currentPersonaData = null;
    resetCarouselButtons();

    window.scrollTo(0, 0);
    console.log(`[Detail] ← Returned to Browse at carousel index ${AppState.currentCarouselIndex}`);
  }, 150);
}

// Called ONLY from Detail's 激活面具 button.
// This is the single authorised activation point.
function activateFromDetail() {
  if (!AppState.currentPersonaData) {
    showError('人格数据未加载，请重新选择。');
    return;
  }

  const cleanId = safeStr(AppState.currentPersonaData.id).toUpperCase();
  const entry   = AppState.runtimePersonaRegistry.find(p => p.id === cleanId);
  const color   = entry ? entry.color : '#00f2ff';

  // Fix 2: disable button immediately to block double-tap during 150ms transition
  const activateBtn = document.getElementById('detail-activate-btn');
  if (activateBtn) activateBtn.disabled = true;

  // Set activation state before transition so Config is ready
  AppState.selectedPersona = cleanId;
  const display = document.getElementById('active-persona-display');
  display.innerText   = safeStr(AppState.currentPersonaData.consumer_fields.display_name);
  display.style.color = color;

  // Fade out Detail, then show Config
  const panel = document.getElementById('detail-panel');
  panel.classList.add('detail-leaving');
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('detail-leaving');
    document.getElementById('config-panel').classList.remove('hidden');
    window.scrollTo(0, 0);
    console.log(`[Detail] ✓ Activated: ${safeStr(AppState.currentPersonaData.consumer_fields.display_name)} → Config`);
  }, 150);
}

// extractTheaterContent → docs/data/content-extractors.js

// ── THEATER STARTUP ───────────────────────────────────────────
// TIMING CONTRACT:
//   • Calibration overlay shows for exactly SYNC_DURATION_MS
//   • AI call is raced against AI_TIMEOUT_MS
//   • Theater opens at SYNC_DURATION_MS regardless of AI result
async function startTheater() {
  const intention = document.getElementById('intention-input').value.trim();
  const scene     = document.getElementById('scene-select').value;
  const target    = document.getElementById('target-select').value;
  const scale     = document.getElementById('scale-select').value;

  if (!intention) {
    await showAlert('请先输入你的戏纲', { title: '配置不完整' });
    return;
  }
  if (!AppState.currentPersonaData) {
    await showAlert('人格数据未加载，请重新选择面具。', { title: '数据错误', color: '#e74c3c' });
    return;
  }

  const personaDisplayName = safeStr(AppState.currentPersonaData.consumer_fields.display_name);
  AppState.currentSceneContext = { scene, target, scale };
  AppState.usedGachaTips.clear();
  console.log(`[Theater] Starting — Persona: ${AppState.currentPersonaData.id}, Scene: ${scene}, Target: ${target}`);

  // ── Phase 1: Show calibration overlay immediately ────────
  const syncOverlay     = document.getElementById('sync-overlay');
  const syncPersonaName = document.getElementById('sync-persona-name');
  syncPersonaName.innerText = personaDisplayName;

  const personaColor = getPersonaColor();

  const syncBox = syncOverlay.querySelector('.sync-box');
  if (syncBox) {
    syncBox.style.borderColor = personaColor;
    syncBox.style.boxShadow   = `0 0 20px ${personaColor}44`;
  }

  const progressFill = syncOverlay.querySelector('.sync-progress-fill');
  if (progressFill) {
    progressFill.style.background = personaColor;
    progressFill.style.boxShadow  = `0 0 10px ${personaColor}`;
    progressFill.style.animation  = 'none';
    progressFill.offsetHeight; // force reflow to restart animation
    progressFill.style.animation  = `progressLoad ${CONFIG.SYNC_DURATION_MS}ms ease-in-out forwards`;
  }

  syncOverlay.style.color = personaColor;
  syncOverlay.classList.remove('hidden');

  const syncStatus = document.querySelector('.sync-status');
  if (syncStatus) {
    syncStatus.innerHTML = `
      <span class="status-label">PERSONA_ID:</span>
        <span class="status-value">${AppState.currentPersonaData.id} — ${safeStr(AppState.currentPersonaData.archetype_id)}</span><br>
      <span class="status-label">ENV_SCAN:</span>
        <span class="status-value">${scene}</span><br>
      <span class="status-label">TARGET_LOCK:</span>
        <span class="status-value">${target}</span><br>
      <span class="status-label">FIELD_SCALE:</span>
        <span class="status-value">${scale}</span><br>
      <span class="status-label">EMOTION:</span>
        <span class="status-valueSuppress">SUPPRESSED</span>
    `;
  }

  // ── Phase 2: Extract local content immediately (theater_support) ─
  const localContent = extractTheaterContent(AppState.currentPersonaData, scene, target, scale);
  AppState.contentData[0].text = localContent.mind;
  AppState.contentData[1].text = localContent.body;
  AppState.contentData[2].text = localContent.speech;
  AppState.contentData[3].text = localContent.reaction;

  // ── Phase 3: Race AI call against timeout ────────────────
  const aiTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), CONFIG.AI_TIMEOUT_MS)
  );

  try {
    const aiContent = await Promise.race([
      callAIWithPersonaProtocol(AppState.currentPersonaData, scene, target, scale, intention),
      aiTimeout
    ]);
    if (aiContent.mind)     AppState.contentData[0].text = aiContent.mind;
    if (aiContent.body)     AppState.contentData[1].text = aiContent.body;
    if (aiContent.speech)   AppState.contentData[2].text = aiContent.speech;
    if (aiContent.reaction) AppState.contentData[3].text = aiContent.reaction;
    console.log('[Theater] ✓ AI enhancement applied.');
  } catch (e) {
    const reason = e.message === 'AI_TIMEOUT' ? 'timed out' : e.message;
    console.warn(`[Theater] AI ${reason} — running on local theater_support data.`);
  }

  // ── Phase 4: Transition at SYNC_DURATION_MS ──────────────
  setTimeout(() => {
    syncOverlay.classList.add('hidden');
    document.getElementById('config-panel').classList.add('hidden');
    document.getElementById('theater-screen').classList.remove('hidden');

    AppState.isTheaterModeActive = true;
    startGachaSystem();
    updateGuidance(0);

    console.log(`[Theater] ✓ ${personaDisplayName} — 面具激活完成。`);
  }, CONFIG.SYNC_DURATION_MS);
}

// ── AI PROTOCOL GENERATOR ─────────────────────────────────────
// Builds a prompt using ONLY consumer_fields and theater_support.
// No old-schema fields (core_directive, root_logic_core, etc.) are read here.
async function callAIWithPersonaProtocol(personaData, scene, target, scale, intention) {
  const url = 'https://api.moonshot.cn/v1/chat/completions';

  const cf = personaData.consumer_fields || {};
  const ts = personaData.theater_support || {};

  // consumer_fields — display layer
  const displayName  = safeStr(cf.display_name,  MISSING);
  const slogan       = safeStr(cf.slogan,         MISSING);
  const taboosList   = Array.isArray(cf.taboos) && cf.taboos.length > 0
    ? cf.taboos.map(t => `- ${safeStr(t)}`).join('\n')
    : '[禁忌列表缺失]';

  // theater_support — runtime layer
  const logicAxes      = ts.logic_axes            || {};
  const sceneTactics   = ts.scene_tactics         || {};
  const expressionMods = ts.expression_modulators || {};
  const reactionCues   = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];

  const isLargeScale = scale && (scale.includes('5-8') || scale.includes('>8'));
  const scaleTactic  = isLargeScale
    ? safeStr(sceneTactics.large_scale, safeStr(sceneTactics.small_scale))
    : safeStr(sceneTactics.small_scale, safeStr(sceneTactics.large_scale));

  const reactionCueSummary = reactionCues.map(c =>
    `${safeStr(c.trigger)}: ${safeStr(c.guidance)}`
  ).join('\n') || '[反应线索缺失]';

  // Pull scenario + target overlays for prompt injection
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;

  const systemPrompt = `你是 Persona Draft 的核心战术逻辑引擎。
严格依据以下【人格系统协议】进行深度行为对齐，不得混入其他人格特征。

━━ 人格协议 ━━
ID: ${safeStr(personaData.id)} | 名称: ${displayName}
原型: ${safeStr(personaData.archetype_id)}
核心口号: ${slogan}

━━ 战术逻辑轴 (theater_support.logic_axes) ━━
互动焦点: ${safeStr(logicAxes.interaction_focus)}
情感防护: ${safeStr(logicAxes.emotional_guard)}
权力动作: ${safeStr(logicAxes.power_move)}

━━ 输出风格模块 (theater_support.expression_modulators) ━━
语言模式: ${safeStr(expressionMods.delivery_mode)}
肢体基准: ${safeStr(expressionMods.physicality)}

━━ 反应线索 (theater_support.reaction_cues) ━━
${reactionCueSummary}

━━ 场景战术 (theater_support.scene_tactics) ━━
${scaleTactic || '[场景战术缺失]'}

━━ 绝对禁忌 (consumer_fields.taboos) ━━
${taboosList}

━━ 实验场域配置 ━━
场景: ${scene}
核心对手: ${target}
场域规模: ${scale}
核心目的: ${intention}

━━ 战场特殊规则（本场域专属，优先级高于通用协议）━━
${sceneOverlay ? `场域动力学: ${sceneOverlay.dynamics}` : '无特殊场域规则。'}
${targetProfile ? `目标档案: ${targetProfile}` : ''}

━━ 生成任务 ━━
基于以上完整协议与场域参数，生成四维实战指令。
每个维度必须体现【本场域的特殊动力学】与【人格协议的融合】，而非通用人格描述。
不同场景的输出必须有显著差异——「商务谈判」和「私人相亲」的指令风格应截然不同。
禁止将 consumer_fields 的展示文本（口号、核心本质等）原样复读进输出。

必须只输出纯 JSON，不带任何解释或 markdown 标记：
{"mind":"...","body":"...","speech":"...","reaction":"..."}

规则：去人类化，保持指令冷峻、精准、逻辑优先。严禁废话。场域感知优先。`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.KIMI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: '立即同步人格参数，输出四维实战指令。' }
      ],
      temperature: 0.65
    })
  });

  console.log(`[AI] HTTP ${response.status}`);
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);

  const data  = await response.json();
  const raw   = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI returned empty content');

  const clean  = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  ['mind', 'body', 'speech', 'reaction'].forEach(k => {
    if (!parsed[k] || typeof parsed[k] !== 'string') {
      console.warn(`[AI] ⚠ Missing or invalid field: "${k}"`);
      parsed[k] = '';
    }
  });

  console.log('[AI] ✓ Valid four-field response received.');
  return parsed;
}

// ── WHEEL + CONTENT DISPLAY ───────────────────────────────────
// contentData moved to AppState.contentData (see docs/state/app-state.js)

function updateGuidance(index) {
  const d = AppState.contentData[index] || AppState.contentData[0];
  document.getElementById('guidance-title').innerText   = d.title;
  document.getElementById('guidance-content').innerText = d.text;
}

function rotateWheel(delta) {
  AppState.currentRotation += delta;
  document.getElementById('main-wheel').style.transform = `rotate(${AppState.currentRotation}deg)`;
  const quadrant = (Math.abs(AppState.currentRotation / 90)) % 4;
  updateGuidance(quadrant);
  if (navigator.vibrate) navigator.vibrate(10);
}

// Wheel interaction: desktop click + mobile tap & swipe
(function initWheelInteraction() {
  const wheel = document.getElementById('main-wheel');
  let touchStartX = 0, touchStartY = 0;

  // Capture start position (passive — no scroll blocking needed here)
  wheel.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  // Classify gesture on release
  wheel.addEventListener('touchend', (e) => {
    const dx   = e.changedTouches[0].clientX - touchStartX;
    const dy   = e.changedTouches[0].clientY - touchStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 12) {
      // Tap → rotate forward (same as desktop click)
      rotateWheel(-90);
      e.preventDefault(); // prevent synthetic click from also firing
    } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
      // Horizontal swipe: left = forward, right = backward
      rotateWheel(dx > 0 ? 90 : -90);
      e.preventDefault();
    }
    // Vertical swipes fall through so the page can still scroll
  }); // intentionally NOT passive so e.preventDefault() works

  // Desktop mouse click
  wheel.addEventListener('click', () => rotateWheel(-90));
})();

// ── GACHA SYSTEM ──────────────────────────────────────────────
function startGachaSystem() {
  if (AppState.gachaTimer) clearInterval(AppState.gachaTimer);
  console.log('[Gacha] 场景锦囊已激活。');
  AppState.gachaTimer = setInterval(() => {
    if (AppState.isTheaterModeActive) triggerGacha();
  }, CONFIG.GACHA_INTERVAL_MS);
}

// ── SCENE TIP GENERATOR ───────────────────────────────────────
// Returns ONE actionable sentence bound to current scene/scale.
// Sources (priority): reaction_cues > scene_tactics > taboos
// Guarantees: no exact match with theaterContent, no repeat in session.
function generateSceneTip(persona, sceneContext, theaterContent) {
  if (!persona) return '[数据缺失]';

  const ts = persona.theater_support || {};
  const cf = persona.consumer_fields  || {};

  // ── P1: theater_support.reaction_cues[].guidance ──
  const cues = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];
  const p1   = cues
    .map(c => safeStr(c && c.guidance))
    .filter(s => s && s !== MISSING && s !== '[缺失]');

  // ── P2: theater_support.scene_tactics (scale-aware, split to sentences) ──
  const st        = ts.scene_tactics || {};
  const isLarge   = sceneContext.scale &&
    (sceneContext.scale.includes('5-8') || sceneContext.scale.includes('>8'));
  const rawTactic = isLarge
    ? safeStr(st.large_scale, safeStr(st.small_scale))
    : safeStr(st.small_scale, safeStr(st.large_scale));
  const p2 = (rawTactic && rawTactic !== MISSING && rawTactic !== '[缺失]')
    ? rawTactic.split(/[。；！？\n]/).map(s => s.trim()).filter(s => s.length > 5)
    : [];

  // ── P3: consumer_fields.taboos (limited) ──
  const p3 = (Array.isArray(cf.taboos) ? cf.taboos : [])
    .map(t => safeStr(t))
    .filter(s => s && s !== MISSING && s !== '[缺失]');

  // Weighted pool: P1 appears 3x (favored), P2 and P3 appear once each
  const weighted = [...p1, ...p1, ...p1, ...p2, ...p3];

  // ── Filter 1: not in usedGachaTips AND not exact substring of theaterContent ──
  const fresh = weighted.filter(s => !AppState.usedGachaTips.has(s) && !theaterContent.includes(s));

  // ── Filter 2: fallback — at least avoid exact theater match (allow re-use) ──
  const noOverlap = weighted.filter(s => !theaterContent.includes(s));

  const pool = fresh.length > 0 ? fresh : noOverlap;
  if (pool.length === 0) return '[数据缺失]';

  const pick = pool[Math.floor(Math.random() * pool.length)];
  AppState.usedGachaTips.add(pick);
  return pick;
}

// ── AI REWRITE HELPER ────────────────────────────────────────
// Converts a line to short imperative form (≤20 chars) using AI.
// Only called when semantic overlap is detected. Degrades gracefully.
async function rewriteTipImperative(originalLine, sceneLabel) {
  try {
    const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.KIMI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [
          {
            role: 'system',
            content: '你是行为指令转换器。将输入改写为1句祈使提醒句，保留原意，尽量≤20汉字，禁止解释，只输出结果句子。'
          },
          {
            role: 'user',
            content: `场景：${sceneLabel}\n原文：${originalLine}\n改写为祈使句：`
          }
        ],
        temperature: 0.3,
        max_tokens: 60
      })
    });
    if (!response.ok) return originalLine;
    const data   = await response.json();
    const result = data?.choices?.[0]?.message?.content?.trim();
    return result || originalLine;
  } catch {
    return originalLine;
  }
}

// hasSemanticOverlap → docs/domain/gacha-engine.js

async function triggerGacha() {
  // Don't stack modals if one is already open
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return;
  if (!AppState.currentPersonaData) return;

  // Collect all visible theater text to check for overlap
  const theaterText = AppState.contentData.map(d => d.text || '').join('\n');

  // Generate scene-bound tip from persona data
  let tip = generateSceneTip(AppState.currentPersonaData, AppState.currentSceneContext, theaterText);

  // If semantic overlap detected → rewrite to action form via AI
  if (tip !== '[数据缺失]' && hasSemanticOverlap(tip, theaterText)) {
    tip = await rewriteTipImperative(tip, AppState.currentSceneContext.scene);
  }

  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  await showAlert(tip, { title: '💡 场景锦囊', color: getPersonaColor() });
}

// ── EXIT THEATER ──────────────────────────────────────────────
async function exitTheater() {
  const confirmed = await showConfirm('确定要卸载当前人格面具吗？', {
    title: '卸载面具',
    color: '#e74c3c'
  });
  if (!confirmed) return;

  AppState.isTheaterModeActive = false;
  if (AppState.gachaTimer) clearInterval(AppState.gachaTimer);
  AppState.usedGachaTips.clear();
  AppState.currentSceneContext = { scene: '', target: '', scale: '' };

  document.getElementById('theater-screen').classList.add('hidden');
  document.getElementById('carousel').classList.remove('hidden');
  document.getElementById('dots').classList.remove('hidden');
  document.getElementById('intention-input').value = '';

  AppState.currentPersonaData  = null;
  AppState.selectedPersona     = null;
  AppState.currentRotation     = 0;
  document.getElementById('main-wheel').style.transform = 'rotate(0deg)';

  // Bug 2 fix: restore all carousel CTAs so the user can re-enter Detail
  resetCarouselButtons();

  console.log('[Theater] 面具已卸载，全局状态已清空。');
}

// ── ERROR DISPLAY ─────────────────────────────────────────────
function showError(msg) {
  console.error('[UI Error]', msg);
  showAlert(msg, { title: '错误', color: '#e74c3c' });
}

// ── THEATER REAL-TIME HELP (求助) ─────────────────────────────

/**
 * handleHelpClick — opens help modal in INPUT state.
 * Called by the 求助 button in theater-screen.
 */
function handleHelpClick() {
  const inputEl       = document.getElementById('helpInput');
  const errorEl       = document.getElementById('help-input-error');
  const inputSection  = document.getElementById('help-input-section');
  const resultSection = document.getElementById('help-result-section');
  const submitBtn     = document.getElementById('help-submit-btn');

  // Reset to INPUT state
  inputEl.value = '';
  errorEl.innerText = '';
  errorEl.classList.add('hidden');
  inputSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  submitBtn.disabled = false;
  submitBtn.innerText = '获取建议';

  document.getElementById('help-modal-overlay').classList.remove('hidden');
}

/**
 * requestSceneHelp — builds context-aware prompt and calls AI.
 * Returns a suggestion string.
 */
async function requestSceneHelp(userInput) {
  const persona = AppState.currentPersonaData;
  const scene   = AppState.currentSceneContext.scene;
  const target  = AppState.currentSceneContext.target;
  const scale   = AppState.currentSceneContext.scale;
  const content = AppState.contentData;

  const cf = (persona && persona.consumer_fields) || {};
  const ts = (persona && persona.theater_support)  || {};

  // Persona core essence / tone — prefer slogan, fall back to display_name
  const personaEssence = safeStr(cf.slogan || cf.display_name, '[人格特征缺失]');

  const prompt = `You are generating a real-time action suggestion inside an interactive scenario.

CONTEXT

Persona:
${personaEssence}

Scene:
${scene}

Target:
${target}

Current Situation:
${userInput}

Current Theater Content:
- Mind: ${content[0] ? content[0].text : ''}
- Body: ${content[1] ? content[1].text : ''}
- Speech: ${content[2] ? content[2].text : ''}
- Reaction: ${content[3] ? content[3].text : ''}

TASK

Generate ONE actionable instruction for what to do NEXT.

RULES (STRICT)
1. Output ONLY ONE suggestion.
2. Maximum 1–2 sentences.
3. Must be immediately executable.
4. Must reflect how THIS persona would act in THIS scene.
5. MUST NOT repeat or paraphrase the existing theater content.
6. MUST NOT explain reasoning.
7. MUST NOT give multiple options.
8. MUST NOT restate the user's situation.

STYLE
- Action-first (use verbs like: "say", "pause", "ask", "shift", "respond")
- Calm, controlled tone
- Light persona flavor (not exaggerated)

OUTPUT

Return ONLY the suggestion text. No labels. No explanation.`;

  const url      = 'https://api.moonshot.cn/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.KIMI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.65
    })
  });

  if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  const data = await response.json();
  const raw  = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI returned empty content');
  return raw.trim();
}

/**
 * _isHelpResponseInvalid — checks failure conditions defined in spec.
 */
function _isHelpResponseInvalid(text) {
  if (!text || text.trim() === '') return true;
  // Count sentence-ending punctuation; >2 means too long
  const sentenceCount = (text.match(/[.!?。！？]/g) || []).length;
  if (sentenceCount > 2) return true;
  if (text.includes('你可以')) return true;
  if (text.includes('建议'))   return true;
  if (text.includes('应该'))   return true;
  return false;
}

/**
 * onSubmitHelp — validates input, calls AI, switches modal to RESULT state.
 */
async function onSubmitHelp() {
  const inputEl       = document.getElementById('helpInput');
  const errorEl       = document.getElementById('help-input-error');
  const submitBtn     = document.getElementById('help-submit-btn');
  const inputSection  = document.getElementById('help-input-section');
  const resultSection = document.getElementById('help-result-section');
  const userInput     = inputEl.value.trim();

  // Validate — empty input
  if (!userInput) {
    errorEl.innerText = '请描述你当前的情况后再获取建议。';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  // Loading state
  submitBtn.disabled  = true;
  submitBtn.innerText = '生成中…';

  let suggestion = '';
  try {
    suggestion = await requestSceneHelp(userInput);
  } catch (e) {
    console.error('[Help] AI call failed:', e.message);
    suggestion = '';
  }

  // Restore button before state switch
  submitBtn.disabled  = false;
  submitBtn.innerText = '获取建议';

  // Failure handling per spec
  if (_isHelpResponseInvalid(suggestion)) {
    suggestion = '现在没抓到合适提示，再试一句更具体的情况。';
  }

  // Switch to RESULT state — same modal, no new overlay
  document.getElementById('help-result-text').innerText = suggestion;
  inputSection.classList.add('hidden');
  resultSection.classList.remove('hidden');
}

/**
 * onConfirmHelp — closes help modal, returns user to Theater.
 */
function onConfirmHelp() {
  document.getElementById('help-modal-overlay').classList.add('hidden');
}

// ── INIT ──────────────────────────────────────────────────────
console.log('[Init] Persona Theater System booting...');
initCarousel();
