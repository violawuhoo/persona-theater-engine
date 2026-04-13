// ============================================================
// PERSONA THEATER SYSTEM — script.js
// ============================================================

// ── GLOBAL STATE ─────────────────────────────────────────────
let gachaTimer         = null;
let isTheaterModeActive = false;
let selectedPersona    = null;
let currentPersonaData = null;
let currentRotation    = 0;

// ── PERSONA REGISTRY ─────────────────────────────────────────
// Central index of available persona JSON files.
// To add a persona: append one entry here and drop the JSON in
// database/personas/ — no other changes required.
const PERSONA_REGISTRY = [
  { id: 'ARCH01', path: './database/personas/ARCH01.json', color: '#7ca4d8' },
  { id: 'ARCH02', path: './database/personas/ARCH02.json', color: '#90b8b8' },
  { id: 'ARCH03', path: './database/personas/ARCH03.json', color: '#6a6a6a' },
  { id: 'ARCH04', path: './database/personas/ARCH04.json', color: '#e05a20' }
];

// ── SCHEMA DEFAULTS ───────────────────────────────────────────
// Safe fallback values for every field the system reads.
// If a JSON file omits a module, these values are used instead
// of crashing with a TypeError.
const SCHEMA_DEFAULTS = {
  id:            'UNKNOWN',
  name:          '未知人格',
  subtitle:      'Unknown Persona',
  archetype:     '未分类原型',
  core_directive:'[核心指令缺失]',
  root_logic_core: {
    social_essence:  '[社交本质数据缺失]',
    self_positioning:'[自我定位数据缺失]',
    power_source:    '[权力来源数据缺失]'
  },
  cognitive_filtering_algorithm: {
    noise_processing: '[认知过滤数据缺失]'
  },
  physical_execution_constraints: {
    center_of_gravity:  '[重心规则缺失]',
    gaze_protocol: {
      focus_point: '[视线焦点缺失]',
      rule:        '[视线规则缺失]'
    },
    breathing_protocol: '[呼吸协议缺失]',
    hand_constraints:   '[手部约束缺失]',
    latency_buffer: {
      delay_seconds: '[延迟时间缺失]',
      purpose:       '[延迟说明缺失]'
    },
    spatial_sovereignty: ''
  },
  universal_forbidden_actions: [
    { action: '数据缺失', rule: '该人格的禁忌列表未加载。' }
  ],
  dynamic_response_protocols: {}
};

// ── UTILITIES ────────────────────────────────────────────────

// Safe string getter — returns fallback if val is not a usable string.
function safeStr(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return String(val);
  return val.trim() || fallback;
}

// Safe deep-get — safeGet(obj, 'a.b.c', default)
function safeGet(obj, path, fallback = '') {
  return path.split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return fallback;
    return acc[key] !== undefined ? acc[key] : fallback;
  }, obj);
}

// Merge loaded JSON with SCHEMA_DEFAULTS so every field always exists.
function normalizePersonaSchema(raw) {
  if (!raw || typeof raw !== 'object') {
    console.warn('[Schema] Raw data is null or not an object — using full defaults.');
    return { ...SCHEMA_DEFAULTS };
  }

  const norm = { ...SCHEMA_DEFAULTS, ...raw };

  // Deep-merge each module
  norm.root_logic_core = {
    ...SCHEMA_DEFAULTS.root_logic_core,
    ...(raw.root_logic_core || {})
  };

  norm.cognitive_filtering_algorithm = {
    ...SCHEMA_DEFAULTS.cognitive_filtering_algorithm,
    ...(raw.cognitive_filtering_algorithm || {})
  };

  // Physical constraints — gaze_protocol is nested
  const rawPhys = raw.physical_execution_constraints || {};
  norm.physical_execution_constraints = {
    ...SCHEMA_DEFAULTS.physical_execution_constraints,
    ...rawPhys,
    gaze_protocol: {
      ...SCHEMA_DEFAULTS.physical_execution_constraints.gaze_protocol,
      ...(rawPhys.gaze_protocol || {})
    },
    latency_buffer: {
      ...SCHEMA_DEFAULTS.physical_execution_constraints.latency_buffer,
      ...(rawPhys.latency_buffer || {})
    }
  };

  norm.universal_forbidden_actions = Array.isArray(raw.universal_forbidden_actions)
    && raw.universal_forbidden_actions.length > 0
      ? raw.universal_forbidden_actions
      : SCHEMA_DEFAULTS.universal_forbidden_actions;

  norm.dynamic_response_protocols =
    (raw.dynamic_response_protocols && typeof raw.dynamic_response_protocols === 'object')
      ? raw.dynamic_response_protocols
      : SCHEMA_DEFAULTS.dynamic_response_protocols;

  // Validate each forbidden action has required string fields
  norm.universal_forbidden_actions = norm.universal_forbidden_actions.map(f => ({
    action: safeStr(f.action, '未知禁忌'),
    rule:   safeStr(f.rule,   '[规则内容缺失]')
  }));

  console.log(`[Schema] Normalized: ${norm.id} — ${norm.name}`);
  return norm;
}

// ── DYNAMIC LOADER ────────────────────────────────────────────
async function loadPersona(personaId) {
  // Normalize ID: trim whitespace, uppercase
  const cleanId = safeStr(personaId).trim().toUpperCase();
  const entry = PERSONA_REGISTRY.find(p => p.id.toUpperCase() === cleanId);

  if (!entry) {
    console.error(`[DataManager] ✗ Persona "${cleanId}" not found in registry.`);
    console.log('[DataManager] Available IDs:', PERSONA_REGISTRY.map(p => p.id).join(', '));
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

  // Schema validation & normalization
  const missingModules = [];
  ['root_logic_core','cognitive_filtering_algorithm','physical_execution_constraints',
   'universal_forbidden_actions','dynamic_response_protocols'].forEach(key => {
    if (!raw[key]) missingModules.push(key);
  });
  if (missingModules.length > 0) {
    console.warn(`[Schema] ⚠ Missing modules in ${cleanId}:`, missingModules.join(', '));
    console.warn('[Schema] Applying fallback values for missing modules.');
  }

  currentPersonaData = normalizePersonaSchema(raw);
  console.log(`[DataManager] ✓ Persona ready: ${currentPersonaData.name} (${cleanId})`);
  return currentPersonaData;
}

// ── INDEX INITIALIZATION ──────────────────────────────────────
// Fetches all registered JSONs to extract card metadata.
// Individual failures are logged but do not block others.
async function loadPersonaIndex() {
  const index = [];
  const results = await Promise.allSettled(
    PERSONA_REGISTRY.map(entry => fetch(entry.path, { cache: 'no-store' })
      .then(r => {
        console.log(`[Index] HTTP ${r.status} ← ${entry.path}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => ({ data, color: entry.color }))
    )
  );

  results.forEach((result, i) => {
    const entry = PERSONA_REGISTRY[i];
    if (result.status === 'fulfilled') {
      const norm = normalizePersonaSchema(result.value.data);
      index.push({
        id:            norm.id,
        name:          norm.name,
        subtitle:      norm.subtitle,
        archetype:     norm.archetype,
        core_directive:norm.core_directive,
        color:         result.value.color
      });
    } else {
      console.warn(`[Index] ✗ Failed to load ${entry.id}:`, result.reason.message);
      // Push a placeholder card so the carousel slot stays visible
      index.push({
        id:            entry.id,
        name:          entry.id,
        subtitle:      'Protocol Unavailable',
        archetype:     '数据加载失败',
        core_directive:'该人格协议文件无法加载，请检查文件是否存在。',
        color:         entry.color,
        failed:        true
      });
    }
  });

  return index;
}

// ── CAROUSEL UI POPULATION ────────────────────────────────────
async function initCarousel() {
  const carousel     = document.getElementById('carousel');
  const dotsContainer = document.getElementById('dots');

  carousel.innerHTML   = '<div class="load-error">正在加载人格数据库...</div>';
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

    const btnLabel   = p.failed ? '加载失败' : '激活面具';
    const btnDisable = p.failed ? 'disabled' : '';
    const onclickAttr = p.failed ? '' : `onclick="selectPersona('${p.id}')"`;

    wrapper.innerHTML = `
      <div class="card ${p.failed ? 'card--failed' : ''}">
        <div class="icon-box" style="background:${p.color}18; border:2px solid ${p.color};">
          <div class="persona-id-tag" style="color:${p.color}">${p.id}</div>
        </div>
        <div class="title">${p.name}</div>
        <div class="card-subtitle">${p.subtitle}</div>
        <div class="card-archetype">${p.archetype}</div>
        <div class="desc">"${p.core_directive}"</div>
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
    document.querySelectorAll('.dot').forEach((d, i) => {
      const color = personaIndex[i] ? personaIndex[i].color : '#fff';
      d.classList.toggle('active', i === idx);
      d.style.background = i === idx ? color : '';
    });
  });

  console.log(`[Carousel] ✓ Rendered ${personaIndex.length} persona cards.`);
}

// ── PERSONA SELECTION ─────────────────────────────────────────
async function selectPersona(personaId) {
  const cleanId     = safeStr(personaId).trim().toUpperCase();
  const entry       = PERSONA_REGISTRY.find(p => p.id.toUpperCase() === cleanId);
  const loadingColor = entry ? entry.color : '#00f2ff';

  const btn = document.querySelector(`[onclick="selectPersona('${personaId}')"]`);
  if (btn) { btn.textContent = '加载中...'; btn.disabled = true; }

  try {
    await loadPersona(cleanId);
    selectedPersona = cleanId;

    const display = document.getElementById('active-persona-display');
    display.innerText     = currentPersonaData.name;
    display.style.color   = loadingColor;

    document.getElementById('carousel').classList.add('hidden');
    document.getElementById('dots').classList.add('hidden');
    document.getElementById('config-panel').classList.remove('hidden');
    window.scrollTo(0, 0);

    console.log(`[Select] ✓ Proceeding to config: ${currentPersonaData.name}`);
  } catch (e) {
    console.error('[Select] ✗ Load failed:', e.message);
    showError(`人格协议加载失败\n\n原因：${e.message}\n\n请检查网络或刷新重试。`);
    if (btn) { btn.textContent = '激活面具'; btn.disabled = false; }
  }
}

// ── SCHEMA-SAFE THEATER CONTENT EXTRACTOR ────────────────────
// All field accesses are guarded via safeGet/safeStr.
// Produces content for the four theater quadrants.
function extractTheaterContent(data) {
  // ── [0] 心法: root_logic_core + cognitive_filtering
  const rlc  = data.root_logic_core;
  const cfa  = data.cognitive_filtering_algorithm;

  const mindLines = [
    `【社交本质】\n${safeStr(rlc.social_essence,  '[数据缺失]')}`,
    `【自我定位】\n${safeStr(rlc.self_positioning, '[数据缺失]')}`,
    `【权力来源】\n${safeStr(rlc.power_source,     '[数据缺失]')}`
  ];
  const noiseKey = Object.keys(cfa).find(k => k.includes('noise') || k.includes('processing'));
  if (noiseKey && cfa[noiseKey]) {
    mindLines.push(`【噪音过滤】\n${safeStr(cfa[noiseKey])}`);
  }
  const mind = mindLines.join('\n\n');

  // ── [1] 姿态: physical_execution_constraints
  const phys  = data.physical_execution_constraints;
  const gaze  = phys.gaze_protocol || {};
  const lbuf  = phys.latency_buffer || {};

  const bodyLines = [
    phys.center_of_gravity  ? `【重心】\n${safeStr(phys.center_of_gravity)}`  : '',
    gaze.focus_point        ? `【视线焦点】\n${safeStr(gaze.focus_point)}`   : '',
    gaze.rule               ? `【视线规则】\n${safeStr(gaze.rule)}`          : '',
    phys.breathing_protocol ? `【呼吸】\n${safeStr(phys.breathing_protocol)}` : '',
    phys.hand_constraints   ? `【手部】\n${safeStr(phys.hand_constraints)}`  : '',
    (lbuf.delay_seconds || lbuf.purpose)
      ? `【延迟缓冲】${safeStr(lbuf.delay_seconds)}\n${safeStr(lbuf.purpose)}` : ''
  ].filter(Boolean);
  const body = bodyLines.join('\n\n') || '[物理约束数据缺失]';

  // ── [2] 语言: verbal_output from dynamic_response_protocols
  const protocols = data.dynamic_response_protocols;
  const SILENT = new Set([
    '无。沉默即输出。',
    '无需言语。审美拒绝即陈述本身。',
    '无需主动介入。',
    '视语境而定。将对抗框架转化为结盟框架。',
    '无需言语。',
    '无输出。',
    ''
  ]);

  const verbalEntries = Object.entries(protocols)
    .filter(([, p]) => {
      if (!p || typeof p !== 'object') return false;
      const vo = safeStr(p.verbal_output);
      return vo.length > 3 && !SILENT.has(vo);
    })
    .slice(0, 4)
    .map(([key, p]) => {
      // p.signal may be undefined or not a string — guard it
      let signalLabel = '';
      if (p.signal && typeof p.signal === 'string') {
        signalLabel = p.signal.replace(/\n/g, '').slice(0, 40);
      } else {
        signalLabel = key;
      }
      return `【${signalLabel}】\n↳ ${safeStr(p.verbal_output)}`;
    });

  const speech = verbalEntries.length > 0
    ? verbalEntries.join('\n\n')
    : '维持沉默。沉默是最锐利的话术武器。';

  // ── [3] 反应: forbidden actions + attack protocol
  const forbidden = data.universal_forbidden_actions;
  const forbiddenLines = forbidden.slice(0, 4).map(f => {
    // Action label: strip everything after first dash variant
    const raw    = safeStr(f.action, '未知禁忌');
    const label  = raw.split(/——|—|-/)[0].trim();
    return `【${label}】\n${safeStr(f.rule, '[规则内容缺失]')}`;
  });

  let attackBlock = '';
  if (protocols.attack && typeof protocols.attack === 'object') {
    const atk = protocols.attack;
    const physOut  = safeStr(atk.physical_output);
    const verbalOut = safeStr(atk.verbal_output) || safeStr(atk.logic);
    attackBlock = `\n\n【攻击响应协议】\n${physOut}\n↳ ${verbalOut}`;
  }

  const reaction = forbiddenLines.join('\n\n') + attackBlock || '[反应机制数据缺失]';

  console.log('[Extractor] ✓ Theater content extracted from local JSON.');
  return { mind, body, speech, reaction };
}

// ── THEATER STARTUP ───────────────────────────────────────────
// TIMING CONTRACT:
//   • Calibration overlay shows for exactly 2500ms
//   • AI call is raced against a 2000ms timeout
//   • Theater opens at 2500ms regardless of AI result
//   • If AI returns before 2000ms, it upgrades the content
//   • If AI times out or fails, local JSON extraction is used
async function startTheater() {
  const intention = document.getElementById('intention-input').value.trim();
  const scene     = document.getElementById('scene-select').value;
  const target    = document.getElementById('target-select').value;
  const scale     = document.getElementById('scale-select').value;

  if (!intention) { alert('请先输入你的戏纲'); return; }
  if (!currentPersonaData) { alert('人格数据未加载，请重新选择面具。'); return; }

  console.log(`[Theater] Starting — Persona: ${currentPersonaData.id}, Scene: ${scene}, Target: ${target}`);

  // ── Phase 1: Show calibration overlay immediately ────────
  const syncOverlay    = document.getElementById('sync-overlay');
  const syncPersonaName = document.getElementById('sync-persona-name');
  syncPersonaName.innerText = currentPersonaData.name;

  const entry        = PERSONA_REGISTRY.find(p => p.id === selectedPersona);
  const personaColor = entry ? entry.color : '#00f2ff';

  const syncBox = syncOverlay.querySelector('.sync-box');
  if (syncBox) {
    syncBox.style.borderColor = personaColor;
    syncBox.style.boxShadow   = `0 0 20px ${personaColor}44`;
  }

  const progressFill = syncOverlay.querySelector('.sync-progress-fill');
  if (progressFill) {
    progressFill.style.background  = personaColor;
    progressFill.style.boxShadow   = `0 0 10px ${personaColor}`;
    progressFill.style.animation   = 'none';
    progressFill.offsetHeight; // force reflow to restart animation
    progressFill.style.animation   = 'progressLoad 2.5s ease-in-out forwards';
  }

  syncOverlay.style.color = personaColor;
  syncOverlay.classList.remove('hidden');

  const syncStatus = document.querySelector('.sync-status');
  if (syncStatus) {
    syncStatus.innerHTML = `
      <span class="status-label">PERSONA_ID:</span>
        <span class="status-value">${currentPersonaData.id} — ${currentPersonaData.archetype}</span><br>
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

  // ── Phase 2: Extract local content immediately (no API needed) ──
  const localContent = extractTheaterContent(currentPersonaData);
  contentData[0].text = localContent.mind;
  contentData[1].text = localContent.body;
  contentData[2].text = localContent.speech;
  contentData[3].text = localContent.reaction;

  // ── Phase 3: Race AI call against 2000ms timeout ──────────
  const aiTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), 2000)
  );

  try {
    const aiContent = await Promise.race([
      callAIWithPersonaProtocol(currentPersonaData, scene, target, scale, intention),
      aiTimeout
    ]);
    // Only upgrade if AI returned non-empty strings
    if (aiContent.mind)     contentData[0].text = aiContent.mind;
    if (aiContent.body)     contentData[1].text = aiContent.body;
    if (aiContent.speech)   contentData[2].text = aiContent.speech;
    if (aiContent.reaction) contentData[3].text = aiContent.reaction;
    console.log('[Theater] ✓ AI enhancement applied.');
  } catch (e) {
    if (e.message === 'AI_TIMEOUT') {
      console.warn('[Theater] AI timed out — running on local protocol data.');
    } else {
      console.warn('[Theater] AI unavailable:', e.message, '— using local data.');
    }
  }

  // ── Phase 4: Transition at exactly 2500ms ─────────────────
  setTimeout(() => {
    syncOverlay.classList.add('hidden');
    document.getElementById('config-panel').classList.add('hidden');
    document.getElementById('theater-screen').classList.remove('hidden');

    isTheaterModeActive = true;
    startGachaSystem();
    updateGuidance(0);

    console.log(`[Theater] ✓ ${currentPersonaData.name} — 面具激活完成。`);
  }, 2500);
}

// ── AI PROTOCOL GENERATOR ─────────────────────────────────────
const KIMI_API_KEY = "sk-Y4KxeIZ2zA7n4BMW8SMnSyfRdUPZ3l0aHyxwyMkH1yfVtS2S";

async function callAIWithPersonaProtocol(personaData, scene, target, scale, intention) {
  const url = "https://api.moonshot.cn/v1/chat/completions";

  // All field accesses guarded to prevent crashes on partial data
  const forbiddenList = (personaData.universal_forbidden_actions || [])
    .map(f => `- ${safeStr(f.action)}：${safeStr(f.rule)}`)
    .join('\n') || '[禁忌列表缺失]';

  const phys    = personaData.physical_execution_constraints || {};
  const gaze    = phys.gaze_protocol || {};
  const lbuf    = phys.latency_buffer || {};
  const physSummary = [
    `重心：${safeStr(phys.center_of_gravity)}`,
    `视线规则：${safeStr(gaze.rule)}`,
    `延迟缓冲：${safeStr(lbuf.delay_seconds)}`,
    `呼吸：${safeStr(phys.breathing_protocol)}`
  ].join('\n');

  const cfa = personaData.cognitive_filtering_algorithm || {};
  const cfaSummary = Object.entries(cfa)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n') || '[认知过滤算法缺失]';

  const rlc = personaData.root_logic_core || {};

  const systemPrompt = `你是 Persona Draft 的核心战术逻辑引擎。
严格依据以下【人格系统协议】进行深度行为对齐，不得混入其他人格特征。

━━ 人格协议 ━━
ID: ${safeStr(personaData.id)} | 名称: ${safeStr(personaData.name)} (${safeStr(personaData.subtitle)})
原型: ${safeStr(personaData.archetype)}
核心指令: ${safeStr(personaData.core_directive)}

━━ 底层逻辑核心 ━━
社交本质: ${safeStr(rlc.social_essence)}
自我定位: ${safeStr(rlc.self_positioning)}
权力来源: ${safeStr(rlc.power_source)}

━━ 认知过滤算法 ━━
${cfaSummary}

━━ 物理执行约束 ━━
${physSummary}

━━ 绝对禁忌 ━━
${forbiddenList}

━━ 实验场域配置 ━━
场景: ${scene}
核心对手: ${target}
场域规模: ${scale}
核心目的: ${intention}

━━ 生成任务 ━━
基于以上完整协议与场域参数，生成四维实战指令。
必须只输出纯 JSON，不带任何解释或 markdown 标记：
{"mind":"...","body":"...","speech":"...","reaction":"..."}

规则：去人类化，保持指令冷峻、精准、逻辑优先。严禁废话。`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIMI_API_KEY}`
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

  const data = await response.json();
  const raw  = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('AI returned empty content');

  const clean = raw.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);

  // Validate that all four keys exist and are non-empty strings
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
document.getElementById('main-wheel').addEventListener('click', () => {
  currentRotation -= 90;
  document.getElementById('main-wheel').style.transform = `rotate(${currentRotation}deg)`;
  const quadrant = (Math.abs(currentRotation / 90)) % 4;
  updateGuidance(quadrant);
  if (navigator.vibrate) navigator.vibrate(10);
});

const contentData = [
  { title: '底层心法', text: '正在同步人格底色...请稍后。' },
  { title: '物理姿态', text: '正在校准肢体语言...请稍后。' },
  { title: '语言风格', text: '正在加载话术补丁...请稍后。' },
  { title: '反应机制', text: '正在预设应激方案...请稍后。' }
];

function updateGuidance(index) {
  const d = contentData[index] || contentData[0];
  document.getElementById('guidance-title').innerText   = d.title;
  document.getElementById('guidance-content').innerText = d.text;
}

// ── GACHA SYSTEM ──────────────────────────────────────────────
function startGachaSystem() {
  if (gachaTimer) clearInterval(gachaTimer);
  console.log('[Gacha] 锦囊系统已激活。');
  gachaTimer = setInterval(() => {
    if (isTheaterModeActive) triggerGacha();
  }, 10000);
}

function triggerGacha() {
  const baseTips = [
    '【动作】现在，缓慢调整坐姿，占据更大的物理空间。',
    '【停顿】在下一个人说完话后，数到3再开口。',
    '【眼神】看向远处，持续5秒，表现出你在思考更宏大的事。',
    '【呼吸】检查此刻的呼吸节律——确保胸腔起伏对他人不可见。'
  ];

  let personaTips = [];

  // Forbidden action reminders from loaded JSON
  if (currentPersonaData && Array.isArray(currentPersonaData.universal_forbidden_actions)) {
    personaTips = currentPersonaData.universal_forbidden_actions.map(f => {
      const raw   = safeStr(f.action, '未知禁忌');
      const label = raw.split(/——|—|-/)[0].trim();
      return `【禁忌提醒·${label}】${safeStr(f.rule)}`;
    });
  }

  // One random verbal output from dynamic protocols
  if (currentPersonaData && currentPersonaData.dynamic_response_protocols) {
    const SILENT = new Set(['无。沉默即输出。', '视语境而定。将对抗框架转化为结盟框架。', '']);
    const available = Object.values(currentPersonaData.dynamic_response_protocols).filter(p =>
      p && typeof p === 'object' &&
      typeof p.verbal_output === 'string' &&
      p.verbal_output.length > 5 &&
      !SILENT.has(p.verbal_output)
    );
    if (available.length > 0) {
      const pick = available[Math.floor(Math.random() * available.length)];
      personaTips.push(`【破局语言·参考】"${safeStr(pick.verbal_output)}"`);
    }
  }

  const allTips = [...baseTips, ...personaTips];
  const tip     = allTips[Math.floor(Math.random() * allTips.length)];

  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  alert('🎭 随机锦囊：\n\n' + tip);
}

// ── EXIT THEATER ─────────────────────────────────────────────
function exitTheater() {
  if (!confirm('确定要卸载当前人格面具吗？')) return;

  isTheaterModeActive = false;
  if (gachaTimer) clearInterval(gachaTimer);

  document.getElementById('theater-screen').classList.add('hidden');
  document.getElementById('carousel').classList.remove('hidden');
  document.getElementById('dots').classList.remove('hidden');
  document.getElementById('intention-input').value = '';

  currentPersonaData = null;
  selectedPersona    = null;
  currentRotation    = 0;
  document.getElementById('main-wheel').style.transform = 'rotate(0deg)';

  console.log('[Theater] 面具已卸载，全局状态已清空。');
}

// ── ERROR DISPLAY ─────────────────────────────────────────────
function showError(msg) {
  // Non-blocking — avoids alert() in async flows where alert disrupts state
  console.error('[UI Error]', msg);
  alert(msg);
}

// ── INIT ──────────────────────────────────────────────────────
console.log('[Init] Persona Theater System booting...');
initCarousel();
