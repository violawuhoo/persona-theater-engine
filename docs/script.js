// ============================================================
// PERSONA THEATER SYSTEM — script.js
// ============================================================

// ── CONFIGURATION ─────────────────────────────────────────────
// ⚠️  WARNING: Do not commit real API keys to a public repository.
// For production use, proxy requests through a backend server
// or inject this value via a build-time environment variable.
const CONFIG = {
  KIMI_API_KEY:     'sk-Y4KxeIZ2zA7n4BMW8SMnSyfRdUPZ3l0aHyxwyMkH1yfVtS2S', // ⚠️ rotate this key — it was previously exposed in git history
  AI_TIMEOUT_MS:    2000,
  SYNC_DURATION_MS: 2500,
  GACHA_INTERVAL_MS: 10000
};

// ── GLOBAL STATE ─────────────────────────────────────────────
let gachaTimer          = null;
let isTheaterModeActive = false;
let selectedPersona     = null;
let currentPersonaData  = null;
let currentRotation     = 0;

// ── PERSONA REGISTRY (MANIFEST-DRIVEN) ───────────────────────
const PERSONA_MANIFEST_PATH = './database/manifests/personas.manifest.json';
const LEGACY_PERSONA_COLORS = {
  ARCH01: '#7ca4d8',
  ARCH02: '#90b8b8',
  ARCH03: '#6a6a6a',
  ARCH04: '#e05a20'
};
let runtimePersonaRegistry = [];
let runtimeManifestMeta    = null;

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

  runtimeManifestMeta = {
    schema_version: safeStr(manifest.schema_version, 'unknown'),
    total_personas: Number(manifest.total_personas) || manifest.personas.length
  };
  console.log(`[Manifest] ✓ Loaded ${manifest.personas.length} entries (schema ${runtimeManifestMeta.schema_version}).`);
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

  runtimePersonaRegistry = list;
  console.log(`[Manifest] ✓ Runtime registry built: ${runtimePersonaRegistry.length} personas.`);
  return runtimePersonaRegistry;
}

async function ensureRuntimeRegistry() {
  if (runtimePersonaRegistry.length > 0) return runtimePersonaRegistry;
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

// ── SCHEMA DEFAULTS ───────────────────────────────────────────
// Safe fallback values for every field the system reads.
const SCHEMA_DEFAULTS = {
  id:             'UNKNOWN',
  name:           '未知人格',
  subtitle:       'Unknown Persona',
  archetype:      '未分类原型',
  core_directive: '[核心指令缺失]',
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
  if (!selectedPersona) return '#00f2ff';
  const entry = runtimePersonaRegistry.find(p => p.id === selectedPersona);
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

// ── SCHEMA NORMALIZER ─────────────────────────────────────────
// Merge loaded JSON with SCHEMA_DEFAULTS so every field always exists.
function normalizePersonaSchema(raw) {
  if (!raw || typeof raw !== 'object') {
    console.warn('[Schema] Raw data is null or not an object — using full defaults.');
    return { ...SCHEMA_DEFAULTS };
  }

  const norm = { ...SCHEMA_DEFAULTS, ...raw };

  // Deep-merge each nested module
  norm.root_logic_core = {
    ...SCHEMA_DEFAULTS.root_logic_core,
    ...(raw.root_logic_core || {})
  };

  norm.cognitive_filtering_algorithm = {
    ...SCHEMA_DEFAULTS.cognitive_filtering_algorithm,
    ...(raw.cognitive_filtering_algorithm || {})
  };

  // Physical constraints — gaze_protocol and latency_buffer are nested
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
  try {
    await ensureRuntimeRegistry();
  } catch (e) {
    console.error('[DataManager] ✗ Registry initialization failed:', e.message);
    throw new Error(`Manifest registry init failed: ${e.message}`);
  }
  const cleanId = safeStr(personaId).trim().toUpperCase();
  const entry   = runtimePersonaRegistry.find(p => p.id.toUpperCase() === cleanId);

  if (!entry) {
    console.error(`[DataManager] ✗ Persona "${cleanId}" not found in runtime registry.`);
    console.log('[DataManager] Available IDs:', runtimePersonaRegistry.map(p => p.id).join(', '));
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
  ['root_logic_core', 'cognitive_filtering_algorithm', 'physical_execution_constraints',
   'universal_forbidden_actions', 'dynamic_response_protocols'].forEach(key => {
    if (!raw[key]) missingModules.push(key);
  });
  if (missingModules.length > 0) {
    console.warn(`[Schema] ⚠ Missing modules in ${cleanId}:`, missingModules.join(', '));
    console.warn('[Schema] Applying fallback values for missing modules.');
  }

  currentPersonaData = normalizePersonaSchema(raw);
  if (safeStr(currentPersonaData.id).toUpperCase() !== cleanId) {
    console.warn(`[DataManager] ⚠ ID mismatch: selected ${cleanId}, loaded ${currentPersonaData.id}`);
  }
  console.log(`[DataManager] ✓ Persona ready: ${currentPersonaData.name} (${cleanId})`);
  return currentPersonaData;
}

// ── INDEX INITIALIZATION ──────────────────────────────────────
// Fetches all registered JSONs to extract card metadata.
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
      const norm = normalizePersonaSchema(result.value.data);
      index.push({
        id:             norm.id,
        name:           norm.name,
        subtitle:       norm.subtitle,
        archetype:      norm.archetype,
        core_directive: norm.core_directive,
        color:          result.value.color
      });
    } else {
      console.warn(`[Index] ✗ Failed to load ${entry.id}:`, result.reason.message);
      index.push({
        id:             entry.id,
        name:           entry.id,
        subtitle:       'Protocol Unavailable',
        archetype:      '数据加载失败',
        core_directive: '该人格协议文件无法加载，请检查文件是否存在。',
        color:          entry.color,
        failed:         true
      });
    }
  });

  return index;
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

    const btnLabel    = p.failed ? '加载失败' : '激活面具';
    const btnDisable  = p.failed ? 'disabled'  : '';
    const onclickAttr = p.failed ? ''           : `onclick="selectPersona('${p.id}')"`;

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
  try {
    await ensureRuntimeRegistry();
  } catch (e) {
    console.error('[Select] ✗ Registry initialization failed:', e.message);
    showError(`人格索引加载失败\n\n原因：${e.message}\n\n请检查 manifest 或刷新重试。`);
    return;
  }
  const cleanId      = safeStr(personaId).trim().toUpperCase();
  const entry        = runtimePersonaRegistry.find(p => p.id.toUpperCase() === cleanId);
  const loadingColor = entry ? entry.color : '#00f2ff';

  const btn = document.querySelector(`[onclick="selectPersona('${personaId}')"]`);
  if (btn) { btn.textContent = '加载中...'; btn.disabled = true; }

  try {
    await loadPersona(cleanId);
    selectedPersona = cleanId;

    const display = document.getElementById('active-persona-display');
    display.innerText   = currentPersonaData.name;
    display.style.color = loadingColor;

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
// Now scene/target-aware: blends persona data with scenario overlays.
function extractTheaterContent(data, scene = '', target = '') {
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;
  const protocols     = data.dynamic_response_protocols;

  // ── [0] 心法: persona core logic + scene-specific mindset ───
  const rlc = data.root_logic_core;
  const cfa = data.cognitive_filtering_algorithm;

  let mind;
  if (sceneOverlay) {
    // Lead with scene-specific tactical mindset, then append persona's core logic
    const noiseKey = Object.keys(cfa).find(k => k.includes('noise') || k.includes('processing'));
    const noiseFilter = (noiseKey && cfa[noiseKey])
      ? `\n\n【人格噪音过滤】\n${safeStr(cfa[noiseKey])}` : '';
    mind = `【场域特殊规则】\n${sceneOverlay.dynamics}`
         + `\n\n${sceneOverlay.tactical_focus.mind}`
         + `\n\n【人格底色·${safeStr(data.name)}】\n${safeStr(rlc.self_positioning, '[数据缺失]')}`
         + noiseFilter;
  } else {
    const mindLines = [
      `【社交本质】\n${safeStr(rlc.social_essence,  '[数据缺失]')}`,
      `【自我定位】\n${safeStr(rlc.self_positioning, '[数据缺失]')}`,
      `【权力来源】\n${safeStr(rlc.power_source,     '[数据缺失]')}`
    ];
    const noiseKey = Object.keys(cfa).find(k => k.includes('noise') || k.includes('processing'));
    if (noiseKey && cfa[noiseKey]) mindLines.push(`【噪音过滤】\n${safeStr(cfa[noiseKey])}`);
    mind = mindLines.join('\n\n');
  }

  // ── [1] 姿态: persona physical rules + scene body layer ─────
  const phys = data.physical_execution_constraints;
  const gaze = phys.gaze_protocol  || {};
  const lbuf = phys.latency_buffer || {};

  const baseBodyLines = [
    phys.center_of_gravity  ? `【重心·人格基准】\n${safeStr(phys.center_of_gravity)}`  : '',
    gaze.rule               ? `【视线·人格基准】\n${safeStr(gaze.rule)}`               : '',
    phys.breathing_protocol ? `【呼吸·人格基准】\n${safeStr(phys.breathing_protocol)}` : '',
    phys.hand_constraints   ? `【手部·人格基准】\n${safeStr(phys.hand_constraints)}`   : '',
    (lbuf.delay_seconds || lbuf.purpose)
      ? `【延迟缓冲】${safeStr(lbuf.delay_seconds)} — ${safeStr(lbuf.purpose)}` : ''
  ].filter(Boolean);

  const body = sceneOverlay
    ? sceneOverlay.tactical_focus.body + '\n\n' + baseBodyLines.join('\n\n')
    : baseBodyLines.join('\n\n') || '[物理约束数据缺失]';

  // ── [2] 语言: prioritise scene-relevant protocols ────────────
  const SILENT = new Set([
    '无。沉默即输出。', '无需言语。审美拒绝即陈述本身。', '无需主动介入。',
    '视语境而定。将对抗框架转化为结盟框架。', '无需言语。', '无输出。', ''
  ]);

  let speech;
  if (sceneOverlay) {
    // Use the scene's pre-written speech tactics as primary content
    speech = sceneOverlay.tactical_focus.speech;

    // Append up to 2 matching persona protocols as bonus reference
    const priorityKeys = new Set(sceneOverlay.priority_protocols);
    const bonusEntries = Object.entries(protocols)
      .filter(([key, p]) => {
        if (!priorityKeys.has(key)) return false;
        if (!p || typeof p !== 'object') return false;
        const vo = safeStr(p.verbal_output);
        return vo.length > 3 && !SILENT.has(vo);
      })
      .slice(0, 2)
      .map(([key, p]) => {
        const label = (p.signal && typeof p.signal === 'string')
          ? p.signal.replace(/\n/g, '').slice(0, 40) : key;
        return `【人格话术·${label}】\n↳ ${safeStr(p.verbal_output)}`;
      });

    if (bonusEntries.length > 0) {
      speech += '\n\n' + bonusEntries.join('\n\n');
    }
  } else {
    const verbalEntries = Object.entries(protocols)
      .filter(([, p]) => {
        if (!p || typeof p !== 'object') return false;
        const vo = safeStr(p.verbal_output);
        return vo.length > 3 && !SILENT.has(vo);
      })
      .slice(0, 4)
      .map(([key, p]) => {
        const label = (p.signal && typeof p.signal === 'string')
          ? p.signal.replace(/\n/g, '').slice(0, 40) : key;
        return `【${label}】\n↳ ${safeStr(p.verbal_output)}`;
      });
    speech = verbalEntries.length > 0
      ? verbalEntries.join('\n\n')
      : '维持沉默。沉默是最锐利的话术武器。';
  }

  // ── [3] 反应: scene reaction layer + persona forbidden list ─
  const forbidden = data.universal_forbidden_actions;
  const forbiddenLines = forbidden.slice(0, 3).map(f => {
    const raw   = safeStr(f.action, '未知禁忌');
    const label = raw.split(/——|—|-/)[0].trim();
    return `【禁忌·${label}】\n${safeStr(f.rule, '[规则内容缺失]')}`;
  });

  let reaction;
  if (sceneOverlay) {
    reaction = sceneOverlay.tactical_focus.reaction
             + '\n\n' + forbiddenLines.join('\n\n');
  } else {
    let attackBlock = '';
    if (protocols.attack && typeof protocols.attack === 'object') {
      const atk       = protocols.attack;
      const physOut   = safeStr(atk.physical_output);
      const verbalOut = safeStr(atk.verbal_output) || safeStr(atk.logic);
      attackBlock = `\n\n【攻击响应协议】\n${physOut}\n↳ ${verbalOut}`;
    }
    reaction = forbiddenLines.join('\n\n') + attackBlock || '[反应机制数据缺失]';
  }

  // Append target profile as a footer to the mind quadrant
  if (targetProfile) {
    mind += `\n\n【目标档案·${target}】\n${targetProfile}`;
  }

  console.log(`[Extractor] ✓ Theater content extracted — Scene: ${scene || 'generic'}, Target: ${target || 'generic'}`);
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
  if (!currentPersonaData) {
    await showAlert('人格数据未加载，请重新选择面具。', { title: '数据错误', color: '#e74c3c' });
    return;
  }

  console.log(`[Theater] Starting — Persona: ${currentPersonaData.id}, Scene: ${scene}, Target: ${target}`);

  // ── Phase 1: Show calibration overlay immediately ────────
  const syncOverlay     = document.getElementById('sync-overlay');
  const syncPersonaName = document.getElementById('sync-persona-name');
  syncPersonaName.innerText = currentPersonaData.name;

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

  // ── Phase 2: Extract local content immediately ───────────
  const localContent = extractTheaterContent(currentPersonaData, scene, target);
  contentData[0].text = localContent.mind;
  contentData[1].text = localContent.body;
  contentData[2].text = localContent.speech;
  contentData[3].text = localContent.reaction;

  // ── Phase 3: Race AI call against timeout ────────────────
  const aiTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('AI_TIMEOUT')), CONFIG.AI_TIMEOUT_MS)
  );

  try {
    const aiContent = await Promise.race([
      callAIWithPersonaProtocol(currentPersonaData, scene, target, scale, intention),
      aiTimeout
    ]);
    if (aiContent.mind)     contentData[0].text = aiContent.mind;
    if (aiContent.body)     contentData[1].text = aiContent.body;
    if (aiContent.speech)   contentData[2].text = aiContent.speech;
    if (aiContent.reaction) contentData[3].text = aiContent.reaction;
    console.log('[Theater] ✓ AI enhancement applied.');
  } catch (e) {
    const reason = e.message === 'AI_TIMEOUT' ? 'timed out' : e.message;
    console.warn(`[Theater] AI ${reason} — running on local protocol data.`);
  }

  // ── Phase 4: Transition at SYNC_DURATION_MS ──────────────
  setTimeout(() => {
    syncOverlay.classList.add('hidden');
    document.getElementById('config-panel').classList.add('hidden');
    document.getElementById('theater-screen').classList.remove('hidden');

    isTheaterModeActive = true;
    startGachaSystem();
    updateGuidance(0);

    console.log(`[Theater] ✓ ${currentPersonaData.name} — 面具激活完成。`);
  }, CONFIG.SYNC_DURATION_MS);
}

// ── AI PROTOCOL GENERATOR ─────────────────────────────────────
async function callAIWithPersonaProtocol(personaData, scene, target, scale, intention) {
  const url = 'https://api.moonshot.cn/v1/chat/completions';

  const forbiddenList = (personaData.universal_forbidden_actions || [])
    .map(f => `- ${safeStr(f.action)}：${safeStr(f.rule)}`)
    .join('\n') || '[禁忌列表缺失]';

  const phys = personaData.physical_execution_constraints || {};
  const gaze = phys.gaze_protocol  || {};
  const lbuf = phys.latency_buffer || {};
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

  // Pull scenario + target overlays for prompt injection
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;
  const priorityProtocolList = sceneOverlay
    ? sceneOverlay.priority_protocols.join('、') : '全协议均衡应用';

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

━━ 战场特殊规则（本场域专属，优先级高于通用协议）━━
${sceneOverlay ? `场域动力学: ${sceneOverlay.dynamics}` : '无特殊场域规则。'}
${targetProfile ? `目标档案: ${targetProfile}` : ''}
本场域优先激活的人格协议: ${priorityProtocolList}

━━ 生成任务 ━━
基于以上完整协议与场域参数，生成四维实战指令。
每个维度必须体现【本场域的特殊动力学】与【人格协议的融合】，而非通用人格描述。
不同场景的输出必须有显著差异——「商务谈判」和「私人相亲」的指令风格应截然不同。

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

function rotateWheel(delta) {
  currentRotation += delta;
  document.getElementById('main-wheel').style.transform = `rotate(${currentRotation}deg)`;
  const quadrant = (Math.abs(currentRotation / 90)) % 4;
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
  if (gachaTimer) clearInterval(gachaTimer);
  console.log('[Gacha] 锦囊系统已激活。');
  gachaTimer = setInterval(() => {
    if (isTheaterModeActive) triggerGacha();
  }, CONFIG.GACHA_INTERVAL_MS);
}

async function triggerGacha() {
  // Don't stack modals if one is already open
  if (!document.getElementById('modal-overlay').classList.contains('hidden')) return;

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

  await showAlert(tip, { title: '🎭 随机锦囊', color: getPersonaColor() });
}

// ── EXIT THEATER ──────────────────────────────────────────────
async function exitTheater() {
  const confirmed = await showConfirm('确定要卸载当前人格面具吗？', {
    title: '卸载面具',
    color: '#e74c3c'
  });
  if (!confirmed) return;

  isTheaterModeActive = false;
  if (gachaTimer) clearInterval(gachaTimer);

  document.getElementById('theater-screen').classList.add('hidden');
  document.getElementById('carousel').classList.remove('hidden');
  document.getElementById('dots').classList.remove('hidden');
  document.getElementById('intention-input').value = '';

  currentPersonaData  = null;
  selectedPersona     = null;
  currentRotation     = 0;
  document.getElementById('main-wheel').style.transform = 'rotate(0deg)';

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
