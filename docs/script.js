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

// Event-driven persona theme sync (no observer / polling).
function applyPersonaTheme(color) {
  const c = safeStr(color, '#00d4ff') || '#00d4ff';
  document.documentElement.style.setProperty('--persona-accent', c);
  document.documentElement.style.setProperty('--persona-glow', `${c}66`);
  document.documentElement.style.setProperty('--persona-gradient', `linear-gradient(180deg, ${c}, #0a1525)`);
}

function getCarouselPersonaColor(index) {
  const cards = document.querySelectorAll('#carousel .card');
  const idx = Math.max(0, Math.min(Number(index) || 0, cards.length - 1));
  const card = cards[idx];
  const btn = card ? card.querySelector('.btn[style]') : null;
  if (btn && btn.style && btn.style.background) return btn.style.background;
  const entry = AppState.runtimePersonaRegistry[idx];
  return entry && entry.color ? entry.color : '#00d4ff';
}

function applyPersonaThemeFromCarousel() {
  applyPersonaTheme(getCarouselPersonaColor(AppState.currentCarouselIndex));
}

function renderTheaterTopbar({ personaName = '—', scene = '—', target = '—' } = {}) {
  const nameEl = document.getElementById('theater-display-name');
  const sceneEl = document.getElementById('theater-display-scene');
  const targetEl = document.getElementById('theater-display-target');
  if (nameEl) nameEl.innerText = personaName || '—';
  if (sceneEl) sceneEl.innerText = scene || '—';
  if (targetEl) targetEl.innerText = target || '—';
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

function renderHeroFromPersona(personaData) {
  const heroName = document.getElementById('hero-persona-name');
  const heroSlogan = document.getElementById('hero-persona-slogan');
  const heroQuadrants = document.getElementById('hero-persona-quadrants');
  const heroEnterBtn = document.getElementById('hero-enter-btn');
  if (!heroName || !heroSlogan || !heroQuadrants || !heroEnterBtn || !personaData) return;

  const q = personaData.quadrant;
  const fallbackQuadrants = 'Dominant · Strategic · Controlled · Assertive';
  const labels = [
    { key: 'E', label: 'Expressive' },
    { key: 'O', label: 'Open' },
    { key: 'R', label: 'Rational' },
    { key: 'B', label: 'Bold' }
  ];
  const quadrantText = q && typeof q === 'object'
    ? labels.map(item => {
      const value = q[item.key];
      if (typeof value !== 'number') return null;
      return `${value >= 0 ? 'High' : 'Low'} ${item.label}`;
    }).filter(Boolean).join(' · ')
    : '';

  heroName.textContent = safeStr(personaData.name, 'SELECT PERSONA');
  heroSlogan.textContent = safeStr(personaData.slogan, '选择角色，开启你的现场策略剧场。');
  heroQuadrants.textContent = quadrantText || fallbackQuadrants;

  // Bind Hero CTA directly to the currently rendered Hero persona.
  if (personaData.id && !personaData.failed) {
    heroEnterBtn.dataset.personaId = safeStr(personaData.id).trim().toUpperCase();
    heroEnterBtn.disabled = false;
  } else {
    delete heroEnterBtn.dataset.personaId;
    heroEnterBtn.disabled = true;
  }
}

// ── CAROUSEL UI ───────────────────────────────────────────────
async function initCarousel() {
  const carousel      = document.getElementById('carousel');
  const dotsContainer = document.getElementById('dots');

  carousel.innerHTML      = '<div class="load-error">正在加载人格数据库...</div>';
  dotsContainer.innerHTML = '';

  const personaIndex = await loadPersonaIndex();
  const heroDataByIndex = [];
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
    heroDataByIndex.push({
      id: p.id,
      name: cardName,
      slogan: p.failed ? '该人格协议加载失败' : cardSlogan,
      quadrant: browse ? browse.quadrant : null,
      failed: !!p.failed
    });
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
    const prevIdx = AppState.currentCarouselIndex;
    const idx = Math.round(carousel.scrollLeft / window.innerWidth);
    AppState.currentCarouselIndex = idx;   // keep in sync so Detail can restore position
    if (idx !== prevIdx) renderHeroFromPersona(heroDataByIndex[idx]);
    applyPersonaTheme(getCarouselPersonaColor(idx));
    document.querySelectorAll('.dot').forEach((d, i) => {
      const color = personaIndex[i] ? personaIndex[i].color : '#fff';
      d.classList.toggle('active', i === idx);
      d.style.background = i === idx ? color : '';
    });
  });

  // Initial Browse accent follows first visible persona.
  AppState.currentCarouselIndex = 0;
  applyPersonaThemeFromCarousel();
  renderHeroFromPersona(heroDataByIndex[0]);

  // Hero CTA: open Detail for currently visible persona card.
  const heroEnterBtn = document.getElementById('hero-enter-btn');
  if (heroEnterBtn && !heroEnterBtn.dataset.boundDetail) {
    heroEnterBtn.addEventListener('click', () => {
      const personaId = safeStr(heroEnterBtn.dataset.personaId).trim().toUpperCase();
      if (!personaId) return;
      openPersonaDetail(personaId);
    });
    heroEnterBtn.dataset.boundDetail = '1';
  }

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
  resetDetailViewState();

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
  applyPersonaTheme(color);

  // Show transient loading state on the card button
  const btn = document.querySelector(`[onclick="openPersonaDetail('${personaId}')"]`);
  if (btn) { btn.textContent = '加载中...'; btn.disabled = true; }

  try {
    // loadPersona fetches + validates full data → stores in currentPersonaData
    // selectedPersona is NOT set here; that only happens in activateFromDetail()
    const data = await loadPersona(cleanId);
    AppState.currentPersonaData = data;

    // ── Populate fields via extraction layer ──────────────────
    // All reads go through consumer_fields via extractDetailContent().

    // Header: display_name (stable) — from consumer_fields
    const nameEl = document.getElementById('detail-persona-name');
    nameEl.innerText   = stableField(data.consumer_fields.display_name);
    nameEl.style.color = color;

    // All Detail content extracted through extractDetailContent (consumer_fields only)
    const detail = extractDetailContent(data);
    const detailView = buildDetailViewContent(data, detail);
    const heroSlogan = detailView.heroSlogan;
    const heroIntro = detailView.heroIntro;

    const heroSloganEl = document.getElementById('detail-hero-slogan');
    const heroIntroEl = document.getElementById('detail-hero-intro');
    const behaviorEl = document.getElementById('detail-behavior-pattern');
    const socialEl = document.getElementById('detail-social-essence');
    if (heroSloganEl) heroSloganEl.innerText = heroSlogan;
    if (heroIntroEl) heroIntroEl.innerText = heroIntro;
    renderDetailStructuredBlocks(behaviorEl, detailView.behavior);
    renderDetailStructuredBlocks(socialEl, detailView.social);

    // 核心本质 (stable)
    document.getElementById('detail-core-essence').innerText   = heroIntro;

    // 典型表达 (selectable, max 3, deduped)
    const exprEl = document.getElementById('detail-expressions');
    exprEl.innerHTML = detail.expressions.length > 0
      ? detail.expressions.map(e => `<div class="detail-expr-line">↳ ${escapeDetailHtml(normalizeDetailText(e))}</div>`).join('')
      : `<div class="detail-expr-line">${escapeDetailHtml(normalizeDetailText(''))}</div>`;

    // 人物禁忌 (stable strings, max 3 — no action/rule splitting)
    document.getElementById('detail-forbidden').innerText = detail.taboos.length > 0
      ? detail.taboos.map(t => normalizeDetailText(t)).join('\n\n')
      : normalizeDetailText('');

    // Instinct check
    populateInstinctCheck(detail.instinct_check, color, data);

    // Style activate button with persona colour (button starts disabled until instinct check done)
    const activateBtn = document.getElementById('detail-activate-btn');
    if (activateBtn) {
      activateBtn.style.background = color;
      activateBtn.style.boxShadow  = `0 0 18px ${color}44`;
      activateBtn.style.color      = ['#00f2ff','#2ecc71','#90b8b8'].includes(color) ? '#000' : '#fff';
      activateBtn.disabled = !!detail.instinct_check;
    }
    bindDetailActivateButton(data);

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
    resetDetailViewState();
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

function isInternalPlaceholderText(text) {
  const t = safeStr(text).toLowerCase();
  if (!t) return true;
  return (
    t === MISSING.toLowerCase() ||
    /\[.*缺失.*\]/.test(t) ||
    /sync|loading|加载|同步|校准|稍后|load\.\.\./.test(t)
  );
}

function toUserFacingDetailText(...candidates) {
  for (const candidate of candidates) {
    const value = safeStr(candidate);
    if (!isInternalPlaceholderText(value)) return value;
  }
  return '该人格画像已就绪，可进入 Persona 获取完整策略输出。';
}

function normalizeDetailText(...candidates) {
  return toUserFacingDetailText(...candidates)
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。；：、,.!?;:])\s*/g, '$1')
    .trim();
}

function escapeDetailHtml(value) {
  return safeStr(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripLeadingConceptLabel(text) {
  return normalizeDetailText(text)
    .replace(/^[【\[]?[^】\]：:]{1,12}[】\]]?[：:]\s*/, '')
    .trim();
}

function splitDetailClauses(text) {
  if (isInternalPlaceholderText(text)) return [];
  return normalizeDetailText(text)
    .split(/[。；;]\s*|，?并通过|\s{2,}/)
    .map(part => safeStr(part))
    .filter(Boolean)
    .map(stripLeadingConceptLabel)
    .filter(t => t.length > 0 && !isInternalPlaceholderText(t));
}

function splitDetailPhrases(text) {
  if (isInternalPlaceholderText(text)) return [];
  return normalizeDetailText(text)
    .split(/[、,，/]\s*/)
    .map(part => safeStr(part))
    .filter(Boolean)
    .map(stripLeadingConceptLabel)
    .filter(t => t.length > 0 && !isInternalPlaceholderText(t));
}

function pickDetailPhrase(sources, matcher) {
  for (const source of sources) {
    if (isInternalPlaceholderText(source)) continue;
    const phrases = splitDetailPhrases(source).concat(splitDetailClauses(source));
    const match = phrases.find(phrase => matcher.test(phrase));
    if (match) return match;
  }
  return '';
}

function hasHighContactDetailStyle(sources) {
  return sources.some(source => /高频|侵入|接触|靠近|拉拽|高分贝|热场|声浪|夸张|不间断|霸占/.test(normalizeDetailText(source)));
}

function observableBehaviorText(text, fallback) {
  if (isInternalPlaceholderText(text)) return fallback;
  const cleaned = stripLeadingConceptLabel(text)
    .replace(/\b(confident|charming|mysterious)\b/gi, '')
    .replace(/自信|迷人|神秘/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || isInternalPlaceholderText(cleaned)) return fallback;
  return cleaned;
}

function trimDetailSentenceEnd(text) {
  return normalizeDetailText(text).replace(/[。.]$/, '');
}

function phraseAsObservableAction(text, fallback, template) {
  const phrase = observableBehaviorText(text, '');
  if (!phrase) return fallback;
  return template(trimDetailSentenceEnd(phrase));
}

function buildSpeechDeliveryText(languageStyle, fallback) {
  if (isInternalPlaceholderText(languageStyle)) return fallback;
  const delivery = trimDetailSentenceEnd(languageStyle)
    .replace(/、?极强的情绪感染力/g, '')
    .replace(/去情绪化/g, '情绪词极少');
  return `以${delivery}开口；关键句前后保留可感知的停顿。`;
}

function buildDistanceHandlingText(sources, highContact, fallback) {
  const joined = sources.map(source => normalizeDetailText(source)).join(' ');
  if (/边界忽略|忽略社交距离|距离侵入|主动加大能量和距离侵入/.test(joined)) {
    return '主动缩短社交距离；对方后退时换话题维持连接，而不是立刻撤离。';
  }
  if (/重申边界|不放松距离|越界|信息过滤|仅回应/.test(joined)) {
    return '保持半步以上距离；对方靠近或越界时，用停顿和短句重设边界。';
  }
  return fallback;
}

function buildDetailBehaviorBlocks(persona, detail) {
  const cf = (persona && persona.consumer_fields) || {};
  const sources = [
    cf.behavior_style,
    cf.language_style,
    detail.core_essence,
    detail.social_essence,
    cf.slogan,
    ...(Array.isArray(cf.reaction_patterns_pool) ? cf.reaction_patterns_pool : [])
  ];
  const highContact = hasHighContactDetailStyle(sources);

  const gazePhrase = pickDetailPhrase(sources, /注视|视线|眼神|表情|gaze|eye/i);
  const actionPhrase = pickDetailPhrase(sources, /动作|接触|拍打|手势|拉拽|靠近|停顿|回应|中断|占据|靠|触/i);
  const posturePhrase = pickDetailPhrase(sources, /身体|重心|站|坐|肩|前倾|后仰|收束/i);

  const gazeFallback = highContact
    ? '视线快速扫过对方表情，在开口前用夸张表情抢先建立现场存在感。'
    : '视线稳定停留在对方脸上，听完关键句后停顿半拍再回应。';
  const actionFallback = highContact
    ? '用放大的手势、主动转身和轻拍等动作把对方拉回互动中心。'
    : '动作幅度保持很小，只用点头、停顿和手部收束来标记判断。';
  const speechFallback = highContact
    ? '语速偏快、音量抬高，用连续短句填补空白并推进话题。'
    : '语速平稳偏慢，句子短，先筛掉寒暄再回应有效信息。';
  const postureFallback = highContact
    ? '身体朝向互动中心，肩线打开，随话题推进主动前倾或转向。'
    : '身体位置稳定，肩线不追随对方变化，先保持静止再开口。';
  const distanceFallback = highContact
    ? '主动缩短社交距离；对方后退时换话题维持连接，而不是立刻撤离。'
    : '保持半步以上距离；对方靠近或越界时，用停顿和短句重设边界。';

  return [
    {
      label: 'Eye Contact / Gaze',
      text: phraseAsObservableAction(gazePhrase, gazeFallback, phrase => `用${phrase}锁定对方反应；开口前先停顿半拍。`)
    },
    {
      label: 'Typical Physical Actions',
      text: phraseAsObservableAction(actionPhrase || cf.behavior_style, actionFallback, phrase => `以${phrase}进入互动；动作先于解释，让对方先感到节奏变化。`)
    },
    {
      label: 'Speech Tone & Delivery',
      text: buildSpeechDeliveryText(cf.language_style, speechFallback)
    },
    {
      label: 'Body Posture & Positioning',
      text: observableBehaviorText(posturePhrase, postureFallback)
    },
    {
      label: 'Distance Handling',
      text: buildDistanceHandlingText(sources, highContact, distanceFallback)
    }
  ].map(block => ({
    label: block.label,
    text: normalizeDetailText(block.text, actionFallback)
  }));
}

function buildDetailSocialBlocks(persona, detail) {
  const cf = (persona && persona.consumer_fields) || {};
  const reactionPool = Array.isArray(cf.reaction_patterns_pool) ? cf.reaction_patterns_pool : [];
  const social = normalizeDetailText(detail.social_essence, detail.core_essence, cf.slogan);
  const clauses = splitDetailClauses(social);
  const role = clauses[0] || social;
  const evaluation = clauses.find(line => line !== role && /评估|判断|过滤|回应|识别|标准|逻辑|反应/.test(line))
    || reactionPool.find(line => /评估|判断|过滤|回应|识别|标准|逻辑|反应/.test(normalizeDetailText(line)))
    || reactionPool[0]
    || detail.core_essence;
  const relationship = clauses.find(line => line !== role && line !== evaluation && /距离|关系|节奏|维持|推进|主场|亲近|拉拽|连接/.test(line))
    || reactionPool.find(line => /距离|关系|节奏|维持|推进|主场|亲近|拉拽|连接|互动/.test(normalizeDetailText(line)))
    || reactionPool[1]
    || social;

  return [
    {
      label: 'Social Role / Positioning',
      text: normalizeDetailText(role, detail.core_essence)
    },
    {
      label: 'How Others Are Evaluated',
      text: normalizeDetailText(evaluation, social)
    },
    {
      label: 'Relationship Management',
      text: normalizeDetailText(relationship, reactionPool[2], social)
    }
  ];
}

function buildDetailViewContent(persona, detail) {
  const cf = (persona && persona.consumer_fields) || {};
  return {
    heroSlogan: normalizeDetailText(cf.slogan, detail.social_essence, detail.core_essence),
    heroIntro: normalizeDetailText(detail.core_essence, detail.social_essence, cf.slogan),
    behavior: buildDetailBehaviorBlocks(persona, detail),
    social: buildDetailSocialBlocks(persona, detail)
  };
}

function renderDetailStructuredBlocks(container, blocks) {
  if (!container) return;
  const usableBlocks = Array.isArray(blocks) ? blocks : [];
  container.innerHTML = usableBlocks.map(block => `
    <div class="detail-structured-block">
      <div class="detail-structured-label">${escapeDetailHtml(block.label)}</div>
      <div class="detail-structured-text">${escapeDetailHtml(normalizeDetailText(block.text))}</div>
    </div>
  `).join('');
}

function resetDetailViewState() {
  const panel = document.getElementById('detail-panel');
  const activateBtn = document.getElementById('detail-activate-btn');
  const modalOverlay = document.getElementById('modal-overlay');
  const helpOverlay = document.getElementById('help-modal-overlay');
  if (panel) panel.classList.remove('detail-entering', 'detail-leaving');
  if (modalOverlay) modalOverlay.classList.add('hidden');
  if (helpOverlay) helpOverlay.classList.add('hidden');
  if (activateBtn) {
    activateBtn.disabled = false;
    activateBtn.onclick = null;
    activateBtn.style.opacity = '';
    activateBtn.style.pointerEvents = '';
  }
  // Reset instinct check UI
  const optionsEl = document.getElementById('instinct-options');
  const revealEl  = document.getElementById('instinct-reveal');
  const scenarioEl = document.getElementById('instinct-scenario');
  if (optionsEl)  optionsEl.innerHTML = '';
  if (revealEl)   revealEl.classList.add('hidden');
  if (scenarioEl) scenarioEl.textContent = '';
}

function populateInstinctCheck(instinctData, accentColor, personaData) {
  const scenarioEl = document.getElementById('instinct-scenario');
  const optionsEl  = document.getElementById('instinct-options');
  const revealEl   = document.getElementById('instinct-reveal');
  const revealLine = document.getElementById('instinct-reveal-line');
  const section    = document.getElementById('instinct-check-section');
  const activateBtn = document.getElementById('detail-activate-btn');

  if (!instinctData || !scenarioEl || !optionsEl) return;

  scenarioEl.textContent = instinctData.scenario || '';
  optionsEl.innerHTML = '';
  revealEl.classList.add('hidden');

  const options = Array.isArray(instinctData.options) ? instinctData.options : [];
  const personaChoice = typeof instinctData.persona_choice === 'number' ? instinctData.persona_choice : -1;

  options.forEach(function(text, idx) {
    const btn = document.createElement('button');
    btn.className = 'instinct-option';
    btn.textContent = text;
    btn.addEventListener('click', function() {
      // Mark all options
      optionsEl.querySelectorAll('.instinct-option').forEach(function(b, i) {
        b.classList.remove('instinct-option--chosen', 'instinct-option--unchosen');
        b.classList.add(i === personaChoice ? 'instinct-option--chosen' : 'instinct-option--unchosen');
        b.disabled = true;
      });
      // Show reveal
      if (revealLine) revealLine.textContent = '「' + (instinctData.reveal_line || '') + '」';
      revealEl.classList.remove('hidden');
      // Unlock activate button
      if (activateBtn) {
        activateBtn.disabled = false;
        activateBtn.style.opacity = '';
        activateBtn.style.pointerEvents = '';
      }
    });
    optionsEl.appendChild(btn);
  });
}

function bindDetailActivateButton(personaData) {
  const activateBtn = document.getElementById('detail-activate-btn');
  if (!activateBtn || !personaData || !personaData.id) return;
  const personaId = safeStr(personaData.id).trim().toUpperCase();
  activateBtn.dataset.personaId = personaId;
  // disabled state is managed by populateInstinctCheck — don't override it here
  activateBtn.onclick = () => activateFromDetail(personaData);
}

// Returns to Browse, restoring the exact carousel position.
function closePersonaDetail() {
  resetDetailViewState();
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
    applyPersonaThemeFromCarousel();

    // Clear transient persona load — not activated
    AppState.currentPersonaData = null;
    const activateBtn = document.getElementById('detail-activate-btn');
    if (activateBtn) delete activateBtn.dataset.personaId;
    resetCarouselButtons();

    window.scrollTo(0, 0);
    console.log(`[Detail] ← Returned to Browse at carousel index ${AppState.currentCarouselIndex}`);
  }, 150);
}

// Called ONLY from Detail's 激活面具 button.
// This is the single authorised activation point.
function activateFromDetail(personaData = AppState.currentPersonaData) {
  const activePersona = personaData && personaData.id ? personaData : AppState.currentPersonaData;
  if (!activePersona) {
    showError('人格数据未加载，请重新选择。');
    return;
  }

  const cleanId = safeStr(activePersona.id).toUpperCase();
  const entry   = AppState.runtimePersonaRegistry.find(p => p.id === cleanId);
  const color   = entry ? entry.color : '#00f2ff';
  applyPersonaTheme(color);

  // Fix 2: disable button immediately to block double-tap during 150ms transition
  const activateBtn = document.getElementById('detail-activate-btn');
  if (activateBtn) activateBtn.disabled = true;

  // Keep Config/Theater state aligned with the exact persona shown in Detail.
  AppState.currentPersonaData = activePersona;

  // Set activation state before transition so Config is ready
  AppState.selectedPersona = cleanId;
  const display = document.getElementById('active-persona-display');
  display.innerText   = safeStr(activePersona.consumer_fields.display_name);
  display.style.color = color;

  // Fade out Detail, then show Config
  const panel = document.getElementById('detail-panel');
  panel.classList.add('detail-leaving');
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('detail-leaving');
    document.getElementById('config-panel').classList.remove('hidden');
    window.scrollTo(0, 0);
    console.log(`[Detail] ✓ Activated: ${safeStr(activePersona.consumer_fields.display_name)} → Config`);
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
  AppState.currentSceneContext = buildTheaterSceneContext(AppState.currentPersonaData, scene, target, scale, intention);
  AppState.usedGachaTips.clear();
  console.log(`[Theater] Starting — Persona: ${AppState.currentPersonaData.id}, Scene: ${scene}, Target: ${target}`);
  renderTheaterTopbar({ personaName: personaDisplayName, scene, target });

  // ── Phase 1: Show calibration overlay immediately ────────
  const syncOverlay     = document.getElementById('sync-overlay');
  const syncPersonaName = document.getElementById('sync-persona-name');
  syncPersonaName.innerText = personaDisplayName;

  const personaColor = getPersonaColor();
  applyPersonaTheme(personaColor);

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
  applyTheaterContent(localContent, AppState.currentSceneContext, AppState.currentPersonaData);

  // ── Phase 3: Race AI call against timeout ────────────────
  const aiTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), CONFIG.AI_TIMEOUT_MS)
  );

  try {
    const aiContent = await Promise.race([
      callAIWithPersonaProtocol(AppState.currentPersonaData, scene, target, scale, intention),
      aiTimeout
    ]);
    applyTheaterContent({
      mind: aiContent.mind || AppState.contentData[0].text,
      body: aiContent.body || AppState.contentData[1].text,
      speech: aiContent.speech || AppState.contentData[2].text,
      reaction: aiContent.reaction || AppState.contentData[3].text
    }, AppState.currentSceneContext, AppState.currentPersonaData);
    console.log('[Theater] ✓ AI enhancement applied.');
  } catch (e) {
    const reason = e.message === 'AI_TIMEOUT' ? 'timed out' : e.message;
    console.warn(`[Theater] AI ${reason} — running on local theater_support data.`);
  }

  // ── Phase 4: Transition at SYNC_DURATION_MS ──────────────
  setTimeout(() => {
    syncOverlay.classList.add('hidden');
    document.getElementById('config-panel').classList.add('hidden');
    updateGuidance(0);
    document.getElementById('theater-screen').classList.remove('hidden');

    AppState.isTheaterModeActive = true;
    startGachaSystem();

    console.log(`[Theater] ✓ ${personaDisplayName} — 面具激活完成。`);
  }, CONFIG.SYNC_DURATION_MS);
}

// ── INTENTION CLASSIFIER ──────────────────────────────────────
// Maps raw intention text to one of 7 direction buckets.
// Used to drive behaviorally distinct Theater outputs.
function classifyIntentionBucket(rawIntention) {
  if (!rawIntention) return 'advance';
  const t = rawIntention;
  if (/试探|摸清|观察|测试|了解底|看看对方|探一探|探清/.test(t))         return 'test';
  if (/拖延|暂缓|先不|缓一缓|避免承诺|不表态|拖时间/.test(t))            return 'delay';
  if (/打破|干扰|搅局|制造分歧|逆转|反转|破局|打乱/.test(t))             return 'disrupt';
  if (/建立关系|拉近|破冰|信任|交朋友|亲近|融入|获得好感/.test(t))       return 'bond';
  if (/掌控|主导|控场|把控节奏|拿主动权|主动权|框架|定调/.test(t))       return 'control';
  if (/退出|离开|脱身|结束|撤退|收场|优雅退出/.test(t))                  return 'exit';
  // default: advance — push toward agreement / outcome
  return 'advance';
}

function buildTheaterSceneContext(personaData, scene, target, scale, intention) {
  const cf = (personaData && personaData.consumer_fields) || {};
  return {
    personaId: safeStr(personaData && personaData.id, ''),
    personaName: safeStr(cf.display_name, safeStr(personaData && personaData.id, '')),
    scene: safeStr(scene),
    target: safeStr(target),
    scale: safeStr(scale),
    intention: safeStr(intention),
    intentionBucket: classifyIntentionBucket(intention)
  };
}

function isCompleteTheaterContext(ctx) {
  return !!(ctx && ctx.personaId && ctx.scene && ctx.target && ctx.scale && ctx.intention);
}

function splitTheaterLines(text) {
  return safeStr(text)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean);
}

function normalizeTheaterText(text, fallback) {
  const value = safeStr(text, fallback)
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return value || fallback;
}

function containsDialogue(text) {
  return /["“”「」『』]|↳/.test(safeStr(text));
}

function containsBehaviorLogic(text) {
  return /视线|眼神|身体|肢体|动作|距离|靠近|后退|停顿|沉默|反应|回应|评估|判断|识别|归类|边界|节奏|推进|撤退|施压|越界|冷淡|对方|如果|If\b|→/.test(safeStr(text));
}

function containsSpeechSignal(text) {
  return /语气|语速|音量|句式|短句|长句|措辞|称呼|开口|说|表达|话术|SPEECH|语言|分贝|流速|口吻|助词|复述|提问|陈述|["“”「」『』]|↳/.test(safeStr(text));
}

function removeDialogueFragments(text) {
  return safeStr(text)
    .replace(/[「『“"][^」』”"]+[」』”"]/g, '')
    .replace(/↳.*$/gm, '')
    .replace(/\b(Say|SPEECH)\b[:：]?.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTheaterLabels(text) {
  return safeStr(text)
    .replace(/^[-*•]\s*/, '')
    .replace(/^【[^】]+】\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .trim();
}

function compactTheaterLine(text) {
  return stripTheaterLabels(text).replace(/[，。；：、,.!?;:「」“”『』\s/|｜-]/g, '');
}

function isNearDuplicateTheaterLine(line, existingLines) {
  const compact = compactTheaterLine(line);
  if (compact.length < 4) return false;
  return existingLines.some(existing => {
    const other = compactTheaterLine(existing);
    return other.length >= 4 && (compact.includes(other) || other.includes(compact));
  });
}

function shortContextSnippet(text, maxLen = 30) {
  const value = normalizeTheaterText(text, '');
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

function buildContextPrefix(ctx) {
  return `【场景】${ctx.scene}｜${ctx.target}｜${ctx.scale}\n【戏纲】${shortContextSnippet(ctx.intention, 42)}`;
}

function buildMechanismContextPrefix(ctx) {
  return `【机制范围】${ctx.scene}中的${ctx.target}｜${ctx.scale}\n【判定目标】围绕${shortContextSnippet(ctx.intention, 34)}调整信号评估。`;
}

function buildDialogueContextPrefix(ctx) {
  return `【表达范围】${ctx.scene}｜面向${ctx.target}｜${ctx.scale}\n【表达目标】用${intentionVerb(ctx.intentionBucket)}回应「${shortContextSnippet(ctx.intention, 34)}」。`;
}

function buildMechanismFallback(persona, ctx) {
  const ts = (persona && persona.theater_support) || {};
  const logicAxes = ts.logic_axes || {};
  const cues = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];
  const firstCue = cues[0] || {};
  const guard = stripLeadingConceptLabel(logicAxes.emotional_guard || logicAxes.interaction_focus || '先识别对方信号，再决定推进或收束。');
  const cueLine = firstCue.trigger
    ? `【信号评估】遇到${stripTheaterLabels(firstCue.trigger)}时，先按${stripTheaterLabels(firstCue.guidance)}处理。`
    : `【信号评估】先判断对方是在推进、试探还是施压，再决定回应强度。`;
  const scaleLine = ctx.scale.includes('>8') || ctx.scale.includes('5-8')
    ? '【节奏调整】大场域先控制可见动作和发言时机，避免被多人反馈牵引。'
    : '【节奏调整】小场域先控制距离和停顿长度，让对方的下一步更容易被读出。';
  return `【反应底层】${guard}\n${cueLine}\n${scaleLine}`;
}

function buildDialogueFallback(persona, ctx) {
  const cf = (persona && persona.consumer_fields) || {};
  const ts = (persona && persona.theater_support) || {};
  const mods = ts.expression_modulators || {};
  const line = Array.isArray(cf.signature_lines_pool) && cf.signature_lines_pool.length > 0
    ? normalizeDetailText(cf.signature_lines_pool[0])
    : '我先确认一个关键点。';
  const delivery = normalizeDetailText(cf.language_style, mods.delivery_mode, '短句、低冗余、保留停顿');
  const bucketTone = {
    advance: '句子指向下一步，不展开解释。',
    delay: '句子放慢承诺，只确认边界。',
    disrupt: '句子打断原节奏，转向新的判断点。',
    bond: '句子降低压迫感，先给对方可接住的回应。',
    control: '句子先定框架，再给对方回应空间。',
    test: '句子以提问为主，让对方补充信息。',
    exit: '句子明确收束，不打开新话题。'
  }[ctx.intentionBucket] || '句子保持简短、明确、可直接说出口。';
  return `【语气】${delivery}\n【句式】${bucketTone}\n【可说】「${line}」`;
}

function personaReactionSeed(persona, ctx) {
  const ts = (persona && persona.theater_support) || {};
  const logicAxes = ts.logic_axes || {};
  const cues = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];
  const scaleMode = ctx.scale.includes('>8') || ctx.scale.includes('5-8') ? '多人压力下' : '近距离压力下';
  const cueLines = cues.slice(0, 2).map(c =>
    `【人格反应·${stripTheaterLabels(c.trigger)}】${stripTheaterLabels(c.guidance)}`
  );
  return [
    logicAxes.interaction_focus ? `【人格评估】${stripLeadingConceptLabel(logicAxes.interaction_focus)}` : '',
    logicAxes.emotional_guard ? `【节奏防护】${scaleMode}，${stripLeadingConceptLabel(logicAxes.emotional_guard)}` : '',
    logicAxes.power_move ? `【升级方式】${stripLeadingConceptLabel(logicAxes.power_move)}` : '',
    ...cueLines
  ].filter(Boolean).join('\n');
}

function sceneReactionModifier(rawReaction, ctx) {
  const marker = '【场景反应约束】';
  const marked = safeStr(rawReaction).includes(marker)
    ? safeStr(rawReaction).split(marker).pop()
    : '';
  const sceneLine = sentenceParts(marked)
    .map(stripTheaterLabels)
    .find(line => line && !containsDialogue(line) && !containsSpeechSignal(line));
  const fallback = `${ctx.scene}中按${scaleLabel(ctx.scale)}风险调整节奏，优先服务于${intentionVerb(ctx.intentionBucket)}。`;
  return `【场景调制】${sceneLine || fallback}`;
}

function personaDialogueSeed(persona, ctx) {
  const cf = (persona && persona.consumer_fields) || {};
  const ts = (persona && persona.theater_support) || {};
  const mods = ts.expression_modulators || {};
  const signatures = Array.isArray(cf.signature_lines_pool) ? cf.signature_lines_pool : [];
  const delivery = normalizeDetailText(cf.language_style, mods.delivery_mode, '短句、低冗余、保留停顿');
  const rhythm = {
    advance: '句尾落在下一步动作上。',
    delay: '句尾落在暂缓确认上。',
    disrupt: '先用短句打断，再换判断点。',
    bond: '先给可接住的回应，再保留信息缺口。',
    control: '先定框架，再让对方回应。',
    test: '多用校准式提问，让对方补信息。',
    exit: '句子收口，不展开新线索。'
  }[ctx.intentionBucket] || '句子短，信息密度高。';
  return [
    `【人格语气】${delivery}`,
    `【句式节奏】${rhythm}`,
    ...signatures.slice(0, 2).map((line, idx) => `【人格例句${idx + 1}】\n↳ ${normalizeDetailText(line)}`)
  ].join('\n');
}

function sceneDialogueModifier(rawSpeech, ctx) {
  const sceneName = safeStr(ctx.scene).split('/')[0] || '当前场景';
  const mode = {
    advance: '句子直接落到下一步动作，不展开背景。',
    delay: '句子保留余地，避免现场承诺。',
    disrupt: '句子先短促转向，再抛出新的判断点。',
    bond: '句子先增加亲近感，再留下可追问的余地。',
    control: '句子先定议程，再索取关键点。',
    test: '句子以校准式提问展开，让信息自然浮出。',
    exit: '句子明确收束，并关闭后续延展。'
  }[ctx.intentionBucket] || '句子短，指向当前场景的下一步。';
  return `【场景句法】${sceneName}里，${mode}`;
}

function enforceReactionRole(rawReaction, persona, ctx) {
  const seededReaction = `${personaReactionSeed(persona, ctx)}\n${safeStr(rawReaction)}`;
  const cleaned = removeDialogueFragments(seededReaction);
  const lines = splitTheaterLines(cleaned)
    .map(stripTheaterLabels)
    .filter(line => line && !containsDialogue(line) && !containsSpeechSignal(line));
  const uniqueLines = [];
  for (const line of lines) {
    if (!uniqueLines.includes(line) && !isNearDuplicateTheaterLine(line, uniqueLines)) uniqueLines.push(line);
  }
  const mechanismLines = uniqueLines.length > 0 ? uniqueLines.slice(0, 4) : splitTheaterLines(buildMechanismFallback(persona, ctx));
  mechanismLines.push(stripTheaterLabels(sceneReactionModifier(rawReaction, ctx)));
  const mechanism = mechanismLines.join('\n');
  const withContext = `${buildMechanismContextPrefix(ctx)}\n${mechanism}`;
  return normalizeTheaterText(withContext, buildMechanismFallback(persona, ctx));
}

function enforceDialogueRole(rawSpeech, persona, ctx, reactionText) {
  const reactionFragments = splitTheaterLines(reactionText).map(stripTheaterLabels).filter(line => line.length >= 8);
  const seededSpeech = `${personaDialogueSeed(persona, ctx)}\n${safeStr(rawSpeech)}`;
  const lines = splitTheaterLines(seededSpeech)
    .map(stripTheaterLabels)
    .filter(line => line && !containsBehaviorLogic(line))
    .filter(line => !reactionFragments.some(fragment => line.includes(fragment) || fragment.includes(line)));
  const uniqueLines = [];
  for (const line of lines) {
    if (!uniqueLines.includes(line) && !isNearDuplicateTheaterLine(line, uniqueLines)) uniqueLines.push(line);
  }
  const dialogueLines = uniqueLines.length > 0 ? uniqueLines.slice(0, 4) : splitTheaterLines(buildDialogueFallback(persona, ctx));
  dialogueLines.push(stripTheaterLabels(sceneDialogueModifier(rawSpeech, ctx)));
  const dialogue = dialogueLines.join('\n');
  const withContext = `${buildDialogueContextPrefix(ctx)}\n${dialogue}`;
  return normalizeTheaterText(withContext, buildDialogueFallback(persona, ctx));
}

function contextInjectTheaterBlock(label, text, ctx) {
  return normalizeTheaterText(`${buildContextPrefix(ctx)}\n【${label}】\n${normalizeTheaterText(text, '根据当前场景保持观察，并等待下一步信号。')}`);
}

function normalizeTheaterContent(rawContent, ctx, persona) {
  if (!isCompleteTheaterContext(ctx)) {
    console.warn('[Theater] Incomplete scene context; using guarded fallback content.');
  }
  const safeCtx = isCompleteTheaterContext(ctx)
    ? ctx
    : buildTheaterSceneContext(persona, ctx && ctx.scene, ctx && ctx.target, ctx && ctx.scale, ctx && ctx.intention);

  const mind = contextInjectTheaterBlock('判断框架', rawContent && rawContent.mind, safeCtx);
  const body = contextInjectTheaterBlock('行动基准', rawContent && rawContent.body, safeCtx);
  const reaction = enforceReactionRole(rawContent && rawContent.reaction, persona, safeCtx);
  const speech = enforceDialogueRole(rawContent && rawContent.speech, persona, safeCtx, reaction);

  return { mind, body, speech, reaction };
}

// Flatten a structured panel { hero, supports, footer } back into a single string.
// Used to populate contentData[i].text (gacha overlap detection consumes this).
function flattenTheaterPanel(panel) {
  if (!panel) return '';
  if (typeof panel === 'string') return panel;
  const parts = [];
  if (panel.hero) parts.push(safeStr(panel.hero));
  if (Array.isArray(panel.supports)) parts.push(...panel.supports.map(s => safeStr(s)).filter(Boolean));
  if (panel.footer) parts.push(safeStr(panel.footer));
  return parts.join('\n\n');
}

// Detect whether a panel value is the structured { hero, supports, footer } shape.
function isStructuredPanel(panel) {
  return panel && typeof panel === 'object' && !Array.isArray(panel)
    && ('hero' in panel || 'supports' in panel || 'footer' in panel);
}

// applyTheaterContent — accepts either:
//   (A) structured shape from extractTheaterContent: { mind:{hero,supports,footer}, body:{...}, ... }
//       → writes directly to contentData[i] (hero, supports, footer, text=flattened).
//   (B) flat-string shape from AI fallback:        { mind:"…", body:"…", speech:"…", reaction:"…" }
//       → runs through normalizeTheaterContent (legacy guards) and updates ONLY .text.
//         The structured hero/supports/footer from the prior local pass remain visible.
function applyTheaterContent(rawContent, ctx, persona) {
  const slots  = ['mind', 'body', 'speech', 'reaction'];
  const safe   = rawContent || {};
  const allStructured = slots.every(k => isStructuredPanel(safe[k]));

  if (allStructured) {
    slots.forEach((key, i) => {
      const panel = safe[key];
      AppState.contentData[i].hero     = safeStr(panel.hero, '');
      AppState.contentData[i].supports = Array.isArray(panel.supports) ? panel.supports.map(s => safeStr(s)).filter(Boolean) : [];
      AppState.contentData[i].footer   = safeStr(panel.footer, '');
      AppState.contentData[i].text     = flattenTheaterPanel(panel);
    });
    return;
  }

  // Legacy / AI flat-string path: keep normalize guards; only update .text.
  const normalized = normalizeTheaterContent(safe, ctx, persona);
  slots.forEach((key, i) => {
    AppState.contentData[i].text = normalized[key];
  });
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

  // Classify intention into direction bucket
  const intentionBucket = classifyIntentionBucket(intention);
  console.log(`[AI] Intention bucket: ${intentionBucket} ← "${intention}"`);

  // ── Build structured prompt sections ──────────────────────

  // persona_description: who this persona is (identity + tone)
  const personaDescription = [
    `名称: ${displayName}`,
    `原型: ${safeStr(personaData.archetype_id)}`,
    `核心口号: ${slogan}`,
  ].join('\n');

  // persona_behavior: how this persona operates (tactics + style + constraints)
  const behaviorLines = [];
  if (safeStr(logicAxes.interaction_focus) !== MISSING) behaviorLines.push(`互动焦点: ${safeStr(logicAxes.interaction_focus)}`);
  if (safeStr(logicAxes.emotional_guard)   !== MISSING) behaviorLines.push(`情感防护: ${safeStr(logicAxes.emotional_guard)}`);
  if (safeStr(logicAxes.power_move)        !== MISSING) behaviorLines.push(`权力动作: ${safeStr(logicAxes.power_move)}`);
  if (safeStr(expressionMods.delivery_mode) !== MISSING) behaviorLines.push(`语言模式: ${safeStr(expressionMods.delivery_mode)}`);
  if (safeStr(expressionMods.physicality)   !== MISSING) behaviorLines.push(`肢体基准: ${safeStr(expressionMods.physicality)}`);
  if (scaleTactic) behaviorLines.push(`场景战术: ${scaleTactic}`);
  if (reactionCueSummary !== '[反应线索缺失]') behaviorLines.push(`反应线索:\n${reactionCueSummary}`);
  behaviorLines.push(`绝对禁忌:\n${taboosList}`);
  const personaBehavior = behaviorLines.join('\n');

  // scene / target lines — inline overlays where available
  const sceneLine  = sceneOverlay
    ? `${scene}\n场域规则: ${sceneOverlay.dynamics}`
    : scene;
  const targetLine = targetProfile
    ? `${target}\n目标档案: ${targetProfile}`
    : target;

  const systemPrompt = `You are generating **real-time behavioral guidance** inside a persona-based simulation system.

Your output MUST be **actionable, specific, and immediately usable**.

# PRIMARY RULE

DO NOT describe personality.
DO NOT explain abstract strategy.
ONLY produce **concrete next actions + exact wording**.

# CONTEXT INPUTS

Persona Description:
${personaDescription}

Persona Behavior Rules:
${personaBehavior}

Scene:
${sceneLine}

Target:
${targetLine}

Scale:
${scale}

User Intention (raw):
${intention}

Classified Intention Bucket:
${intentionBucket}

# INTENTION PRIORITY (CRITICAL)

The **intention_bucket is the primary driver** of behavior.

You MUST change behavior based on it:

* advance → push forward, create movement
* delay → slow down, avoid commitment
* disrupt → break flow, create instability
* bond → increase trust, soften tone
* control → dominate structure, lead interaction
* test → probe, extract information
* exit → disengage safely

If your output does not clearly reflect the intention, it is WRONG.

# OUTPUT STRUCTURE (MANDATORY)

You MUST follow this exact structure:

[ASSESSMENT]
(1 sentence — what is happening right now in the interaction)

[ACTION]
(2–3 bullet points — physical or timing-based actions)
Each must be immediate and observable.

[SPEECH]
(1 short sentence — exactly what the user should say)
Must be natural and usable in real conversation.
Only language output: tone, sentence shape, and exact wording.
Do NOT include behavioral logic, distance management, signal evaluation, or escalation rules here.

[IF RESPONSE]
(1 conditional — what to do if the other person reacts)
Format: If X → do Y
Only behavioral mechanism: signal evaluation, distance/timing adjustment, escalation/de-escalation.
Do NOT include quoted dialogue or exact wording here.

# HARD CONSTRAINTS

* No long paragraphs
* No personality explanation
* No repetition from persona text
* No generic advice
* No multiple options — be decisive
* No overlap between [SPEECH] and [IF RESPONSE]
* Keep behavioral logic out of [SPEECH]
* Keep spoken language out of [IF RESPONSE]
* Every line must be executable in real life

# STYLE

* Calm, precise, controlled
* Minimal words, maximum clarity
* Feels like a live coach, not a writer

# GOAL

Transform:

"understanding what to do"

→ into

"doing the next move immediately"`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.KIMI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'moonshot-v1-8k',
      messages: [
        { role: 'user', content: systemPrompt }
      ],
      temperature: 0.65
    })
  });

  console.log(`[AI] HTTP ${response.status}`);
  if (!response.ok) throw new Error(`API HTTP ${response.status}`);

  const data  = await response.json();
  const raw   = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI returned empty content');

  const clean = raw.replace(/```json|```/g, '').trim();

  // Compatibility path A: legacy JSON still returned
  try {
    const parsed = JSON.parse(clean);
    ['mind', 'body', 'speech', 'reaction'].forEach(k => {
      if (!parsed[k] || typeof parsed[k] !== 'string') {
        console.warn(`[AI] ⚠ Missing or invalid field: "${k}"`);
        parsed[k] = '';
      }
    });
    console.log('[AI] ✓ Valid legacy JSON response received.');
    return parsed;
  } catch (_) {
    // continue to behavior-script parser
  }

  // Compatibility path B: behavior-script text sections
  function sectionValue(label, nextLabels = []) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextPattern = nextLabels.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = nextPattern
      ? new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*?)(?=\\n\\[(?:${nextPattern})\\]|$)`, 'i')
      : new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*)$`, 'i');
    const m = clean.match(re);
    return m ? m[1].trim() : '';
  }

  const assessment = sectionValue('ASSESSMENT', ['ACTION', 'SPEECH', 'IF RESPONSE']);
  const action = sectionValue('ACTION', ['SPEECH', 'IF RESPONSE']);
  const speech = sectionValue('SPEECH', ['IF RESPONSE']);
  const ifResponse = sectionValue('IF RESPONSE');

  const normalizeBullets = (txt) => {
    const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);
    return lines.map(line => {
      if (/^[-*•]/.test(line)) return line.replace(/^\*\s+/, '- ');
      return '- ' + line;
    }).slice(0, 3).join('\n');
  };

  const parsed = {
    mind: `${assessment ? `【ASSESSMENT】\n${assessment}` : ''}${ifResponse ? `\n\n【IF RESPONSE】\n${ifResponse}` : ''}`.trim() || clean,
    body: `${action ? `【ACTION】\n${normalizeBullets(action)}` : clean}`.trim(),
    speech: `${speech ? `【SPEECH】\n${speech}` : clean}`.trim(),
    reaction: `${ifResponse ? `【IF RESPONSE】\n${ifResponse}` : clean}`.trim()
  };

  console.log('[AI] ✓ Behavior-script text parsed via compatibility wrapper.');
  return parsed;
}

// ── WHEEL + CONTENT DISPLAY ───────────────────────────────────
// contentData moved to AppState.contentData (see docs/state/app-state.js)

function isInternalTheaterPlaceholderText(text) {
  const t = safeStr(text).toLowerCase();
  if (!t) return false;
  return (
    /\[.*缺失.*\]/.test(t) ||
    /\b(syncing|loading|missing|load\.\.\.)\b/.test(t) ||
    /正在(同步|加载|校准|预设)/.test(t) ||
    /请稍后/.test(t)
  );
}

function sanitizeTheaterDisplayText(text) {
  const value = safeStr(text);
  if (!value) return '';
  const safeLines = value
    .split('\n')
    .filter(line => !isInternalTheaterPlaceholderText(line))
    .join('\n')
    .trim();
  return safeLines;
}

// Render one panel into the 3-tier DOM (hero / supports / collapsible footer).
// Falls back to the legacy flat <p id="guidance-content"> when no structured hero exists
// (e.g. AI returned a flat string and overwrote .text).
function updateGuidance(index) {
  const d = AppState.contentData[index] || AppState.contentData[0];
  const titleEl    = document.getElementById('guidance-title');
  const heroEl     = document.getElementById('guidance-hero');
  const supportsEl = document.getElementById('guidance-supports');
  const footerWrap = document.getElementById('guidance-footer-wrap');
  const footerEl   = document.getElementById('guidance-footer');
  const legacyEl   = document.getElementById('guidance-content');

  if (titleEl) titleEl.innerText = safeStr(d && d.title, '');

  const hero     = safeStr(d && d.hero, '');
  const supports = Array.isArray(d && d.supports) ? d.supports.filter(Boolean) : [];
  const footer   = safeStr(d && d.footer, '');

  if (hero) {
    // Structured render path
    if (heroEl)     { heroEl.innerText = sanitizeTheaterDisplayText(hero); heroEl.classList.remove('hidden'); }
    if (supportsEl) {
      supportsEl.innerHTML = supports.map(s =>
        `<li class="guidance-support-item">${escapeDetailHtml(sanitizeTheaterDisplayText(s))}</li>`
      ).join('');
      supportsEl.classList.toggle('hidden', supports.length === 0);
    }
    if (footerWrap && footerEl) {
      if (footer) {
        footerEl.innerText = sanitizeTheaterDisplayText(footer);
        footerWrap.classList.remove('hidden');
        footerWrap.open = false; // collapsed by default per Phase 1 spec
      } else {
        footerWrap.classList.add('hidden');
      }
    }
    if (legacyEl) legacyEl.classList.add('hidden');
  } else {
    // Legacy fallback: flat-string render (AI overlay, missing data, etc.)
    if (heroEl)     heroEl.classList.add('hidden');
    if (supportsEl) supportsEl.classList.add('hidden');
    if (footerWrap) footerWrap.classList.add('hidden');
    if (legacyEl) {
      legacyEl.innerText = sanitizeTheaterDisplayText(d && d.text);
      legacyEl.classList.remove('hidden');
    }
  }
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

function sentenceParts(text) {
  return normalizeTheaterText(text, '')
    .split(/[。；！？\n]/)
    .map(part => stripTheaterLabels(part))
    .filter(part => part.length > 5 && part !== MISSING && part !== '[缺失]');
}

function scaleLabel(scale) {
  if (safeStr(scale).includes('>8')) return '多人场';
  if (safeStr(scale).includes('5-8')) return '多人场';
  if (safeStr(scale).includes('3-5')) return '小组场';
  return '近距场';
}

function intentionVerb(bucket) {
  return {
    advance: '把话题推向下一步',
    delay: '先降低承诺速度',
    disrupt: '打断原有节奏',
    bond: '先建立可接住的连接',
    control: '先定框架',
    test: '先试探对方底线',
    exit: '先收束出口'
  }[bucket] || '先推进一个明确动作';
}

function scoreTipCandidate(text, ctx) {
  const value = normalizeTheaterText(text, '');
  let score = 0;
  if (value.includes(ctx.scene.split('/')[0])) score += 3;
  if (value.includes(ctx.target.split('/')[0])) score += 2;
  if (value.includes(scaleLabel(ctx.scale))) score += 2;
  if (/距离|节奏|停顿|视线|身体|话题|回应|边界|承诺|框架|观察/.test(value)) score += 1;
  if (ctx.intentionBucket === 'test' && /试探|观察|确认|判断|信息|底线/.test(value)) score += 3;
  if (ctx.intentionBucket === 'delay' && /暂缓|承诺|慢|停顿|拖|清醒/.test(value)) score += 3;
  if (ctx.intentionBucket === 'control' && /框架|主导|议程|节奏|定调|方向/.test(value)) score += 3;
  if (ctx.intentionBucket === 'bond' && /连接|信任|细节|听|关系|温度/.test(value)) score += 3;
  if (ctx.intentionBucket === 'disrupt' && /打断|转移|重置|反常|破/.test(value)) score += 3;
  if (ctx.intentionBucket === 'exit' && /退出|收尾|结束|离开|暂停/.test(value)) score += 3;
  return score;
}

function composeContextualTip(base, ctx) {
  const sceneName = safeStr(ctx.scene).split('/')[0] || '当前场景';
  const setup = shortContextSnippet(ctx.intention, 24);
  const action = stripTheaterLabels(base).replace(/[。.]$/, '');
  return `${sceneName}·${scaleLabel(ctx.scale)}：围绕「${setup}」，${intentionVerb(ctx.intentionBucket)}；${action}。`;
}

// ── SCENE TIP GENERATOR ───────────────────────────────────────
// Returns ONE actionable sentence bound to persona + scene + scale + setup.
// Sources are scene overlays, scale tactics, reaction cues, and taboos.
// Guarantees: no persona-only generation, no exact match with theaterContent, no repeat in session.
function generateSceneTip(persona, sceneContext, theaterContent) {
  if (!persona || !isCompleteTheaterContext(sceneContext)) return '当前场景上下文不完整，请重新设置戏纲后进入剧场。';

  const ts = persona.theater_support || {};
  const cf = persona.consumer_fields  || {};
  const ctx = sceneContext;
  const sceneOverlay = SCENARIO_OVERLAYS[ctx.scene] || null;
  const targetProfile = TARGET_OVERLAYS[ctx.target] || '';

  const candidates = [];

  if (sceneOverlay) {
    candidates.push(sceneOverlay.dynamics);
    candidates.push(sceneOverlay.tactical_focus && sceneOverlay.tactical_focus.body);
    candidates.push(sceneOverlay.tactical_focus && sceneOverlay.tactical_focus.reaction);
    candidates.push(sceneOverlay.tactical_focus && sceneOverlay.tactical_focus.speech);
  }
  if (targetProfile) candidates.push(targetProfile);

  // theater_support.scene_tactics is scale-aware, so scene changes and scale changes alter the pool.
  const st = ts.scene_tactics || {};
  const isLarge = ctx.scale && (ctx.scale.includes('5-8') || ctx.scale.includes('>8'));
  const rawTactic = isLarge
    ? safeStr(st.large_scale, safeStr(st.small_scale))
    : safeStr(st.small_scale, safeStr(st.large_scale));
  candidates.push(rawTactic);

  const cues = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];
  cues.forEach(c => {
    candidates.push(`${safeStr(c && c.trigger)}时，${safeStr(c && c.guidance)}`);
  });

  (Array.isArray(cf.taboos) ? cf.taboos : []).forEach(t => candidates.push(t));

  const ranked = candidates
    .flatMap(sentenceParts)
    .map(candidate => composeContextualTip(candidate, ctx))
    .filter(candidate => !AppState.usedGachaTips.has(candidate))
    .sort((a, b) => scoreTipCandidate(b, ctx) - scoreTipCandidate(a, ctx));

  const pool = ranked.filter(candidate => !hasSemanticOverlap(candidate, theaterContent, 10));
  const usablePool = pool.length > 0 ? pool : ranked;

  if (usablePool.length === 0) {
    const fallback = composeContextualTip('先暂停自动反应，观察对方下一句是否符合你的戏纲目标', ctx);
    AppState.usedGachaTips.add(fallback);
    return fallback;
  }

  const topScore = scoreTipCandidate(usablePool[0], ctx);
  const topPool = usablePool.filter(candidate => scoreTipCandidate(candidate, ctx) === topScore);
  const pick = topPool[Math.floor(Math.random() * topPool.length)];
  AppState.usedGachaTips.add(pick);
  return pick;
}

// ── AI REWRITE HELPER ────────────────────────────────────────
// Converts a line to short imperative form (≤20 chars) using AI.
// Only called when semantic overlap is detected. Degrades gracefully.
async function rewriteTipImperative(originalLine, sceneContext) {
  try {
    const ctx = sceneContext || {};
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
            content: '你是行为指令转换器。将输入改写为1句场景绑定的祈使提醒句，必须保留场景、规模和戏纲意图，禁止解释，只输出结果句子。'
          },
          {
            role: 'user',
            content: `场景：${safeStr(ctx.scene)}\n规模：${safeStr(ctx.scale)}\n戏纲：${safeStr(ctx.intention)}\n原文：${originalLine}\n改写为祈使句：`
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
    tip = await rewriteTipImperative(tip, AppState.currentSceneContext);
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
  AppState.currentSceneContext = { personaId: '', personaName: '', scene: '', target: '', scale: '', intention: '', intentionBucket: '' };

  document.getElementById('theater-screen').classList.add('hidden');
  document.getElementById('carousel').classList.remove('hidden');
  document.getElementById('dots').classList.remove('hidden');
  document.getElementById('intention-input').value = '';
  applyPersonaThemeFromCarousel();
  renderTheaterTopbar();

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

  const prompt = `你是在生成一个互动场景中的实时行动指令。

## CONTEXT
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

---
## TASK
Generate ONE actionable instruction in Chinese describing what to do NEXT.

---
## CORE REQUIREMENTS (ALL MUST BE MET)
1. Output ONLY one sentence (maximum two short sentences).
2. The output MUST be in Chinese.
3. The instruction MUST be immediately actionable (something the user can say or do right now).
4. It MUST reflect how THIS persona would handle THIS situation in THIS scene.
5. The persona traits should be moderately amplified (clear personality style, but not exaggerated or theatrical).
6. Tone must be calm, controlled, and slightly persona-flavored.
7. The instruction MUST introduce a NEW action (do NOT repeat or paraphrase existing theater content).

---
## STRICTLY FORBIDDEN
- Do NOT use phrases like: "你可以", "建议", "应该", "可以考虑"
- Do NOT explain reasoning
- Do NOT analyze the situation
- Do NOT restate the user's input
- Do NOT provide multiple options
- Do NOT produce dramatic or roleplay-style dialogue

---
## STYLE GUIDELINES (VERY IMPORTANT)
- Action-first (focus on verbs like: pause, say, redirect, ask, shift)
- Strategy-oriented (control the situation, not emotions)
- Feels like how the persona would actually act, not like generic advice

---
## GOOD EXAMPLES (STYLE REFERENCE, DO NOT COPY)
- 先停一秒，不接他的节奏，只给一句短答把场子稳住。
- 把问题轻轻往回拨一句，先问清他真正关心的点。
- 不要解释太多，先给结论，再看对方反应。

---
## OUTPUT
Return ONLY the final Chinese instruction. No labels. No explanation.`;

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
// TEMP FREEZE MITIGATION:
// High-risk UI helper auto-sync hooks (MutationObserver/theater-context)
// remain intentionally disabled in docs/index.html. Only low-risk event-driven
// helpers are restored to keep core flow responsive:
// Browse → Detail → Config → Theater.
initCarousel();
