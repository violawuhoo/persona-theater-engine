// ============================================================
// PERSONA THEATER SYSTEM — script.js
// Data contract: consumer_fields (Browse/Detail) + theater_support (Theater)
// Old fields (stable_fields, soft_fields, root_logic_core, etc.) are REMOVED.
// ============================================================

// ── CONFIGURATION ─────────────────────────────────────────────
// ⚠️  WARNING: Do not commit real API keys to a public repository.
// For production use, proxy requests through a backend server
// or inject this value via a build-time environment variable.
const CONFIG = {
  KIMI_API_KEY:     'sk-wNKkSpE2pWwN47rzi3OKKLAELVhhWesFFJ06P1nl3rzUrHaB',
  AI_TIMEOUT_MS:    2000,
  SYNC_DURATION_MS: 2500,
  GACHA_INTERVAL_MS: 10000
};

// ── GLOBAL STATE ─────────────────────────────────────────────
// Moved to docs/state/app-state.js as AppState.*
// All mutable session variables are now on the AppState namespace object.

// ── PERSONA REGISTRY (MANIFEST-DRIVEN) ───────────────────────
const PERSONA_MANIFEST_PATH = './database/manifests/personas.manifest.json';
const LEGACY_PERSONA_COLORS = {
  ARCH01: '#7ca4d8',
  ARCH02: '#90b8b8',
  ARCH03: '#6a6a6a',
  ARCH04: '#e05a20'
};
// runtimePersonaRegistry and runtimeManifestMeta → AppState.*

function normalizeManifestPath(pathValue) {
  const raw = safeStr(pathValue).trim();
  if (!raw) return '';
  if (raw.startsWith('./')) return raw;
  if (raw.startsWith('/')) return `.${raw}`;
  return `./${raw}`;
}

function deterministicColorFromId(id) {
  const seed = safeStr(id, 'UNKNOWN');
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 72% 55%)`;
}

function getColorForPersonaId(id) {
  const cleanId = safeStr(id).trim().toUpperCase();
  return LEGACY_PERSONA_COLORS[cleanId] || deterministicColorFromId(cleanId);
}

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

// ── SCENARIO OVERLAYS ─────────────────────────────────────────
// Per-scene tactical context injected into both the AI prompt and
// the local fallback extractor. Each entry defines:
//   dynamics         — the unique power logic of this scene
//   priority_protocols — which persona protocols matter most here
//   tactical_focus   — scene-specific local fallback content (mind/body/speech/reaction)
const SCENARIO_OVERLAYS = {
  '商务谈判/签约': {
    dynamics: '信息不对称博弈场。双方均在掌控信息流出量。核心压力点：时间压力、承诺升级、面子筹码。真正的谈判在桌面下已结束——桌面上的是仪式。',
    priority_protocols: ['attack', 'logical_trap', 'validation_received', 'gratitude_received'],
    tactical_focus: {
      mind: '【场域定性】\n将此场域归类为：框架争夺战，而非内容讨论。谁设置了议程，谁就赢了这场谈判。\n\n【核心任务】\n锚定高位。让对方在你预设的选项范围内做选择，而非在他们的框架内讨价还价。\n\n【认知警报】\n对方每一次表达"诚意"，均归类为：降低你防御阈值的战术动作，不是情感。',
      body: '【桌面规则】\n文件推过去时，视线停留在对方脸上——不看文件。让对方先翻阅，你观察他们的反应节奏。\n\n【签约前】\n不主动伸手。等对方先动作。握手时控制时长，2秒后主动松开。\n\n【沉默武器】\n对方报价后，维持沉默5-8秒再开口。此沉默会被对方解读为不满意，触发他们自我修正。',
      speech: '【锚定框架】\n↳ "在我们讨论这个数字之前，我想先确认我们对合作目标的理解是一致的。"\n\n【升维拒绝】\n↳ "这个条款的具体细节，对你们这个项目的最终成败有决定性影响吗？"\n\n【收尾控制】\n↳ "我们今天能确认的，就先落纸。剩余的条款，我方会在48小时内给出最终版本。"',
      reaction: '【对方施压】\n归类为：对方已无更多筹码，正在用时间压力替代实质让步。回应：沉默，然后重提你的框架。\n\n【对方让步】\n不表现出满意。让步被归类为：对方承认己方前期定价过高的迟到确认。继续推进。\n\n【僵局出现】\n主动提出暂停：「我们各自再想24小时，带着更清晰的优先级回来。」掌控节奏。'
    }
  },
  '半正式晚宴/酒局': {
    dynamics: '酒精是社交溶剂——它同时溶解对方的防御和你的判断力。真实意图在放松后流出。核心陷阱：即兴承诺、情绪绑架、劝酒压力。',
    priority_protocols: ['excessive_flattery', 'peer_coldness', 'being_ignored', 'attack'],
    tactical_focus: {
      mind: '【场域定性】\n将此场域归类为：信息采集行动，而非社交表演。你的目标不是被记住，而是让对方说出清醒时不会说的话。\n\n【饮酒策略】\n保持清醒度比对方高30%。这不是节制，这是信息优势。\n\n【观察任务】\n记录每个人在第三杯后的行为变化。这是他们真实性格的操作系统预览。',
      body: '【饮酒节奏】\n杯子放下时轻放，不发声。主动饮酒的频率比全场慢一个节拍。\n\n【拒酒姿势】\n用手轻压杯口，不解释，不道歉。这个动作本身即是边界声明。\n\n【空间占位】\n饭桌上，肘部自然放置，不收缩。占据你该有的物理空间。',
      speech: '【信息收割】\n↳ 用「后来呢」「然后呢」「这事怎么解决的」维持对方叙事流，自己输出极少。\n\n【话题转移】\n↳ 当话题对你不利时，用一个无关但有趣的观察打断：「说起来，我最近看到一件事…」\n\n【即兴承诺防御】\n↳ 对任何当场提出的合作邀请：「这个方向有意思，等我们都清醒的时候认真聊。」',
      reaction: '【劝酒压力】\n归类为：对方试图通过情绪绑架获取控制感。回应：微笑，压杯，不解释。\n\n【当众定义你】\n对方试图贴标签时，用一个出乎意料的补充颠覆他们的叙述，不反驳，只补充。\n\n【酒后冲突】\n将攻击归类为：酒精引发的生物噪音。零反应。等对方力竭后，换话题。'
    }
  },
  '部门会议/述职': {
    dynamics: '绩效叙事的战场。每个词都在被权力方解读和记录。核心压力：数据质疑、责任归因、资源竞争。你不是在汇报，你是在构建一个让决策者必须支持你的框架。',
    priority_protocols: ['logical_trap', 'attack', 'validation_received', 'being_ignored'],
    tactical_focus: {
      mind: '【叙事重构】\n绩效数据是道具，不是目的。目的是让听众相信：你是这个方向上最有掌控力的人。\n\n【风险先发制人】\n主动提出问题，同时给出已准备好的对策。这将「暴露问题」转变为「展示前瞻性」。\n\n【权力地图扫描】\n开场前，快速判断今天谁的意见权重最高。所有内容优先对那个人校准。',
      body: '【站立述职】\n重心均匀落于双脚，不倚靠台子。PPT切换时，视线不跟屏幕——扫视听众反应。\n\n【坐姿汇报】\n文件夹或平板放于桌面，双手轻搭。不用笔指指点点。\n\n【被质疑时】\n身体微微后仰——思考的姿态，而非防御的姿态。停顿1.5秒再回应。',
      speech: '【开场锚定】\n↳ "今天我想先说结论，然后用数据支撑它。" 不要让听众猜你要去哪里。\n\n【质疑转化】\n↳ "这是一个好的校准点。我们当前的判断是X，你的担心让我想确认一下我们对Y的定义是否一致。"\n\n【资源争取】\n↳ "这个项目的天花板，取决于我们在Q3是否能获得Z资源。我今天想明确这个决策。"',
      reaction: '【数据被质疑】\n不辩护数据本身。质疑对方的评估框架：「这个指标在当前阶段的优先权重，是否应该高于X？」\n\n【被抢功劳】\n不争，不辩。在下一个自然停顿处，用一句话重申你的具体贡献，然后推进议程。\n\n【被忽视】\n归类为：信息密度不足导致的关注度流失。用一个反常的数字或结论重新拉回焦点。'
    }
  },
  '面试/潜在合伙人面谈': {
    dynamics: '双向筛选场——不是单向审判。对方在评估你，你也在评估对方是否值得你的时间。最常见的致命错误：把这个场域定义为求职者接受审判。',
    priority_protocols: ['logical_trap', 'praise_received', 'validation_received', 'attack'],
    tactical_focus: {
      mind: '【场域重定义】\n这是两个主权个体在评估合作可行性。带着这个框架进场。你的稀缺性不需要被证明——它需要被感知。\n\n【信息不对称利用】\n你比他们更了解你自己。在叙事中掌握节奏，决定展示哪些信息，以什么顺序。\n\n【反向筛选】\n准备3个判断对方质量的标准。如果对方不达标，这不是好机会。',
      body: '【入场】\n握手时主动控制力度与时长，2秒松开。落座后不急于开口，用1-2秒扫视空间，建立存在感。\n\n【回答时】\n视线稳定，不飘移。回答结束后，保持沉默，让对方填补空白。\n\n【思考时】\n允许自己停顿。停顿是思考的外化，不是软弱的信号。',
      speech: '【反向提问】\n↳ "你们对这个角色未来6个月的核心任务定义是什么？" 让对方证明这个机会是值得的。\n\n【弱点处理】\n↳ 描述一个已被克服的历史弱点，立即转向："现在我处理这类问题的方式是X，这带来了Y结果。"\n\n【收尾掌控】\n↳ "基于今天的交流，我对接下来的步骤有一个建议…" 不等对方定义流程。',
      reaction: '【压力测试问题】\n归类为：对方在测试你的应激反应，而非真的需要这个答案。保持语速，直接回应核心，忽略情绪包装。\n\n【被质疑经验不足】\n不辩护年龄或年限。转向能力本身：「经验是一种路径，不是唯一路径。这个问题的核心是X，我的解法是…」\n\n【对方态度轻慢】\n归类为：对方正在测试你的自我认知稳定性。保持语速和眼神，不做任何迎合性调整。'
    }
  },
  '私人社交/相亲': {
    dynamics: '真实性与策略性的张力场。过度计算会被感知到，零计算会失去主动权。核心任务：让对方感觉被真正看见，同时保持自身的神秘感和信息缺口。',
    priority_protocols: ['excessive_flattery', 'gratitude_received', 'peer_coldness', 'praise_received'],
    tactical_focus: {
      mind: '【目标重设】\n不是表现出最好的自己，而是创造一个让对方主动想要了解更多的信息缺口。\n\n【吸引力物理学】\n真正的吸引来自于：对方感觉「我还没有完全看懂这个人」。给出足够多的信息让对方感兴趣，但永远保留一个未解的层次。\n\n【情绪自给】\n进场前确认：你今晚不需要任何来自对方的认可。这种自足感会被本能感知到。',
      body: '【若即若离张力】\n身体朝向与眼神焦点略微错开，制造一种「我在看你，但不是只在看你」的状态。\n\n【倾听姿态】\n对方说话时，偶尔视线落向远处再收回——表示你在真正思考，而非表演关注。\n\n【触碰时机】\n主动触碰（握手、轻拍肩）在自然语境下比被动等待更有主导感。',
      speech: '【信息缺口制造】\n↳ 不完整地讲述一件有趣的事，在最关键处停止：「说来话长，以后有机会聊。」制造追问动机。\n\n【反预判】\n↳ 对方试图归类你时，给出一个真实但出乎意料的答案，打破他们的预判框架。\n\n【关注给予】\n↳ 记住对方在前10分钟说过的一个细节，在30分钟后自然引用它。这是最有力的「我真的在听你说话」信号。',
      reaction: '【被过度追问】\n归类为：对方焦虑于信息不足，正在快速评估你。放慢回答节奏，增加停顿，反问一个他们的问题。\n\n【对方表现过于热情】\n不迎合这种热情。保持你原有的节奏和距离感，让对方自然降温，再重新校准互动温度。\n\n【冷场出现】\n不用恐慌填补。用一个关于当前环境的观察开启新话题，而非从内心议题开始。'
    }
  },
  '偶然遭遇战': {
    dynamics: '无剧本即兴场。时间窗口极短，通常只有30-120秒来建立基准印象。前5秒的物理状态决定整场互动的权力基准线。最大风险：被反应性情绪劫持。',
    priority_protocols: ['attack', 'being_ignored', 'peer_coldness', 'excessive_flattery'],
    tactical_focus: {
      mind: '【即时状态切换】\n在接触发生前的0.5秒内完成重置：脊椎延伸，呼吸下沉，将对方归类为「待观察变量」而非威胁或机会。\n\n【时间压缩意识】\n你有大约90秒来建立一个让对方想要继续了解的印象。不浪费在寒暄上。\n\n【偶然感维护】\n让这次遭遇感觉像是一个好的巧合，而非一场预谋的表演。',
      body: '【物理主权】\n不主动调整自身位置来适应对方的物理存在。让对方围绕你移动。\n\n【接触时刻】\n握手有力，眼神直接，第一句话之前停顿0.5秒——「我在打量你」的信号。\n\n【退出动作】\n主动结束对话，不等对方先离开。给出一个明确的收尾信号：看向远处，收起手机，调整站姿。',
      speech: '【开场策略】\n↳ 第一句话永远不是自我介绍。用一个关于当前场域的评述开场：「这个地方比我想象的有意思。」建立观察者视角。\n\n【信息锚点】\n↳ 在对话中植入一个让对方能继续追问的信息钩子，然后不主动展开——等对方来问。\n\n【优雅退出】\n↳ 在对话最高点结束，而非等到自然冷却：「我不想占用你太多时间——但我确实想在某个时候继续聊这个话题。」',
      reaction: '【对方试图主导】\n用一个无关但有趣的观察打断叙事链条，温和地重置话题控制权，不发生正面冲突。\n\n【被忽视或打断】\n不追逐注意力。退后半步，进入观察者模式，等待自然的重新接触时机。\n\n【对方急于获取联系方式】\n不立即给出。制造一个小小的获取难度：「你在X平台上吗？我在那上面比较活跃。」'
    }
  }
};

// Per-target psychological profile — injected into AI prompt and local fallback.
const TARGET_OVERLAYS = {
  '甲方/决策者':   '对方握有最终否决权，核心焦虑是「做出错误决策的风险」。你的任务：降低他们的感知风险，同时抬高你方的不可替代性感知。永远不要让他们感觉自己在被推着做决定。',
  '竞争对手/同行': '同行之间的博弈是话语权与资源的争夺。不要展示优越感——展示「我在你不在的维度上运行」的感知。让对方产生「和这个人合作比竞争更有利」的战略判断。',
  '下属/执行层':   '你的权威不需要被证明，它需要被感知。减少解释，增加方向性指令的确定感。对方需要的不是你的逻辑，而是你的确信。',
  '朋友/熟人':     '熟悉度是双刃剑——对方会用已有的你的形象来限制你。任务：在熟悉的关系中制造陌生感，让对方意识到「我以为我了解你，但今天我看到了一个新的层次」。',
  '陌生人/潜在资源': '对方在前30秒内完成初步分类。你的任务是被分入「值得继续了解」的类别，而非「已经完全了解」的类别。给出足够多让他们感兴趣，但永远保留一个未解的层次。'
};

// ── SCHEMA DEFAULTS (new contract) ───────────────────────────
// Minimum-viable defaults for the two canonical layers.
// These are used ONLY when a field is absent — never as fabricated substitutes.
const SCHEMA_DEFAULTS = {
  id: 'UNKNOWN',
  consumer_fields: {
    display_name:          '未知人格',
    quadrants:             {},
    slogan:                '[核心指令缺失]',
    core_essence:          '[核心本质缺失]',
    social_essence:        '[社交本质缺失]',
    signature_lines_pool:  [],
    taboos:                ['[禁忌数据缺失]'],
    behavior_style:        '',
    language_style:        '',
    reaction_patterns_pool: []
  },
  theater_support: {
    logic_axes:            { interaction_focus: '[缺失]', emotional_guard: '[缺失]', power_move: '[缺失]' },
    scene_tactics:         { small_scale: '[缺失]', large_scale: '[缺失]' },
    expression_modulators: { delivery_mode: '[缺失]', physicality: '[缺失]' },
    reaction_cues:         []
  }
};

// ── UTILITIES ─────────────────────────────────────────────────

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

// Sentinel returned for any missing field — never fabricate a replacement.
const MISSING = '[数据缺失]';

// Stable read: returns value verbatim; MISSING if absent or empty.
function stableField(value) {
  const s = safeStr(value);
  return s.length > 0 ? s : MISSING;
}

// Selectable extraction: deduplicate + truncate only — no rewriting allowed.
function selectableLines(candidates, max) {
  const seen   = new Set();
  const result = [];
  for (const raw of candidates) {
    const line = safeStr(raw).split('\n')[0].replace(/^↳\s*/, '').trim();
    if (line.length > 3 && !seen.has(line)) {
      seen.add(line);
      result.push(line);
      if (result.length >= max) break;
    }
  }
  return result;
}

// ── extractBrowseContent ──────────────────────────────────────
// Browse: display_name (stable) + quadrants (stable) + slogan (stable).
// Source: consumer_fields only. No other layer may be read here.
function extractBrowseContent(persona) {
  const cf = (persona && persona.consumer_fields) || {};
  return {
    name:     stableField(cf.display_name),
    quadrant: (cf.quadrants && typeof cf.quadrants === 'object') ? cf.quadrants : null,
    slogan:   stableField(cf.slogan)
  };
}

// ── extractDetailContent ──────────────────────────────────────
// Detail: core_essence + social_essence (stable),
//         signature_lines_pool (selectable, max 3),
//         taboos (stable strings, max 3).
// Source: consumer_fields only. theater_support must NOT be read here.
function extractDetailContent(persona) {
  const cf = (persona && persona.consumer_fields) || {};

  // Stable reads — verbatim, no rewriting
  const core_essence   = stableField(cf.core_essence);
  const social_essence = stableField(cf.social_essence);

  // Selectable: signature_lines_pool, deduped, max 3
  const rawLines   = Array.isArray(cf.signature_lines_pool) ? cf.signature_lines_pool : [];
  const expressions = selectableLines(rawLines, 3);

  // Stable: taboos as strings, sliced to max 3
  const rawTaboos = Array.isArray(cf.taboos) ? cf.taboos : [];
  const taboos    = rawTaboos.slice(0, 3).map(t => stableField(t));

  return { core_essence, social_essence, expressions, taboos };
}

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

// ── THEATER CONTENT EXTRACTOR ────────────────────────────────
// Produces the 4 Theater display blocks from theater_support fields.
// Source: theater_support only. consumer_fields text must NOT appear here.
// Extraction model:
//   [0] 底层逻辑  — theater_support.logic_axes + scene overlay mind
//   [1] 行为特征  — theater_support.expression_modulators + scene_tactics + scene overlay body
//   [2] 语言风格  — theater_support.expression_modulators + reaction_cues + scene overlay speech
//   [3] 反应机制  — theater_support.reaction_cues + scene overlay reaction
// Dynamic AI response may overlay these blocks at runtime.
function extractTheaterContent(data, scene = '', target = '', scale = '') {
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;

  const ts             = (data && data.theater_support) || {};
  const logicAxes      = ts.logic_axes            || {};
  const sceneTactics   = ts.scene_tactics         || {};
  const expressionMods = ts.expression_modulators || {};
  const reactionCues   = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];

  // Determine scene scale tactic (small vs large based on selector value)
  const isLargeScale   = scale && (scale.includes('5-8') || scale.includes('>8'));
  const scaleTactic    = isLargeScale
    ? safeStr(sceneTactics.large_scale, safeStr(sceneTactics.small_scale, MISSING))
    : safeStr(sceneTactics.small_scale, safeStr(sceneTactics.large_scale, MISSING));

  const personaName = safeStr(data.consumer_fields && data.consumer_fields.display_name, '');

  // ── [0] 底层逻辑: theater_support.logic_axes + scene overlay ───
  let mind;
  if (sceneOverlay) {
    mind = `【场域特殊规则】\n${sceneOverlay.dynamics}`
         + `\n\n${sceneOverlay.tactical_focus.mind}`
         + `\n\n【人格底色${personaName ? `·${personaName}` : ''}】`
         + `\n【互动焦点】${safeStr(logicAxes.interaction_focus, MISSING)}`
         + `\n【情感防护】${safeStr(logicAxes.emotional_guard,   MISSING)}`
         + `\n【权力动作】${safeStr(logicAxes.power_move,        MISSING)}`;
  } else {
    mind = `【互动焦点】\n${safeStr(logicAxes.interaction_focus, MISSING)}`
         + `\n\n【情感防护】\n${safeStr(logicAxes.emotional_guard, MISSING)}`
         + `\n\n【权力动作】\n${safeStr(logicAxes.power_move,      MISSING)}`;
  }
  if (targetProfile) {
    mind += `\n\n【目标档案·${target}】\n${targetProfile}`;
  }

  // ── [1] 行为特征: expression_modulators + scene_tactics + scene overlay ─
  const baseBodyLines = [
    expressionMods.delivery_mode ? `【语言输出模式】${safeStr(expressionMods.delivery_mode)}` : '',
    expressionMods.physicality   ? `【肢体语言基准】${safeStr(expressionMods.physicality)}`   : ''
  ].filter(Boolean);
  const baseBodyText = baseBodyLines.join('\n') || MISSING;

  let body;
  if (sceneOverlay) {
    body = sceneOverlay.tactical_focus.body
         + `\n\n【人格行为基准】\n${baseBodyText}`;
  } else {
    body = baseBodyText
         + (scaleTactic !== MISSING ? `\n\n【场景战术】\n${scaleTactic}` : '');
  }

  // ── [2] 语言风格: scene overlay speech + reaction_cues as reference ──
  let speech;
  if (sceneOverlay) {
    speech = sceneOverlay.tactical_focus.speech;
    // Append up to 2 reaction_cues as persona-specific reference lines
    const cueBonus = reactionCues.slice(0, 2).map(c =>
      `【人格话术·${safeStr(c.trigger)}】\n↳ ${safeStr(c.guidance)}`
    );
    if (cueBonus.length > 0) speech += '\n\n' + cueBonus.join('\n\n');
  } else {
    const cueLines = reactionCues.map(c =>
      `【${safeStr(c.trigger)}】\n↳ ${safeStr(c.guidance)}`
    );
    speech = `【输出风格】\n语言：${safeStr(expressionMods.delivery_mode, MISSING)}\n肢体：${safeStr(expressionMods.physicality, MISSING)}`
           + (cueLines.length > 0 ? '\n\n' + cueLines.join('\n\n') : '');
  }

  // ── [3] 反应机制: theater_support.reaction_cues + scene overlay ───
  const reactionLines = reactionCues.map(c =>
    `【${safeStr(c.trigger)}】\n${safeStr(c.guidance)}`
  );
  let reaction;
  if (sceneOverlay) {
    reaction = sceneOverlay.tactical_focus.reaction
             + (reactionLines.length > 0 ? '\n\n' + reactionLines.join('\n\n') : '');
  } else {
    reaction = reactionLines.join('\n\n') || MISSING;
  }

  console.log(`[Extractor] ✓ Theater content extracted — Scene: ${scene || 'generic'}, Target: ${target || 'generic'}, Scale: ${scale || 'default'}`);
  return { mind, body, speech, reaction };
}

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
  AppState.currentSceneContext = { scene, scale };
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

// ── SEMANTIC OVERLAP DETECTION ────────────────────────────────
// Returns true if tip shares ≥8 consecutive chars with theaterContent.
function hasSemanticOverlap(tip, theaterContent, minLen = 8) {
  if (!tip || tip.length < minLen) return false;
  for (let i = 0; i <= tip.length - minLen; i++) {
    if (theaterContent.includes(tip.substring(i, i + minLen))) return true;
  }
  return false;
}

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
  AppState.currentSceneContext = { scene: '', scale: '' };

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

// ── INIT ──────────────────────────────────────────────────────
console.log('[Init] Persona Theater System booting...');
initCarousel();
