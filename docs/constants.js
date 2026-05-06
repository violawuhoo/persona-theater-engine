// ============================================================
// CONSTANTS — docs/constants.js
// All static, non-mutating configuration and data for Persona Theater.
// Loaded as a classic <script> before app-state.js and script.js.
// Do NOT use import/export — targets a browser classic-script context.
// ============================================================

// ── RUNTIME CONFIGURATION ─────────────────────────────────────
// ⚠️  WARNING: Do not commit real API keys to a public repository.
// For production use, proxy requests through a backend server
// or inject this value via a build-time environment variable.
const CONFIG = {
  KIMI_API_KEY:      'sk-wNKkSpE2pWwN47rzi3OKKLAELVhhWesFFJ06P1nl3rzUrHaB',
  AI_TIMEOUT_MS:     15000,
  GACHA_INTERVAL_MS: 10000
};

// ── PERSONA REGISTRY CONSTANTS ────────────────────────────────
const PERSONA_MANIFEST_PATH = './database/manifests/personas.manifest.json';

// Legacy persona ID → hex color map. Deterministic hash used for unknown IDs.
const LEGACY_PERSONA_COLORS = {
  ARCH01: '#7ca4d8',
  ARCH02: '#90b8b8',
  ARCH03: '#f0c674',
  ARCH04: '#e05a20'
};

// ── SCENARIO OVERLAYS ─────────────────────────────────────────
// Per-scene tactical context injected into both the AI prompt and
// the local fallback extractor. Each entry defines:
//   dynamics           — the unique power logic of this scene
//   priority_protocols — which persona protocols matter most here
//   tactical_focus     — scene-specific local fallback content (mind/body/speech/reaction)
const SCENARIO_OVERLAYS = {
  '会议/工作场合': {
    dynamics: '所有发言都在被解读、记录和归因。这个场域没有中性的话——每句话都在构建你的位置和可信度。核心动态：谁在定义议题，谁在回应议题，谁在沉默中观察。你的目标不是把话说完，而是让房间里的人记住你说的哪一句。',
    priority_protocols: ['logical_trap', 'attack', 'validation_received', 'being_ignored'],
    tactical_focus: {
      mind: '【叙事重构】\n绩效数据是道具，不是目的。目的是让听众相信：你是这个方向上最有掌控力的人。\n\n【风险先发制人】\n主动提出问题，同时给出已准备好的对策。这将「暴露问题」转变为「展示前瞻性」。\n\n【权力地图扫描】\n开场前，快速判断今天谁的意见权重最高。所有内容优先对那个人校准。',
      body: '【站立述职】\n重心均匀落于双脚，不倚靠台子。PPT切换时，视线不跟屏幕——扫视听众反应。\n\n【坐姿汇报】\n文件夹或平板放于桌面，双手轻搭。不用笔指指点点。\n\n【被质疑时】\n身体微微后仰——思考的姿态，而非防御的姿态。停顿1.5秒再回应。',
      speech: '【开场锚定】\n↳ "今天我想先说结论，然后用数据支撑它。" 不要让听众猜你要去哪里。\n\n【质疑转化】\n↳ "这是一个好的校准点。我们当前的判断是X，你的担心让我想确认一下我们对Y的定义是否一致。"\n\n【资源争取】\n↳ "这个项目的天花板，取决于我们在Q3是否能获得Z资源。我今天想明确这个决策。"',
      reaction: '【数据被质疑】\n不辩护数据本身。质疑对方的评估框架：「这个指标在当前阶段的优先权重，是否应该高于X？」\n\n【被抢功劳】\n不争，不辩。在下一个自然停顿处，用一句话重申你的具体贡献，然后推进议程。\n\n【被忽视】\n归类为：信息密度不足导致的关注度流失。用一个反常的数字或结论重新拉回焦点。'
    }
  },
  '商务饭局/谈判': {
    dynamics: '关系先于议程。这个场域的潜规则是：真正的决定在非正式层面被确认，桌面上的谈判只是仪式。核心动态：谁在主导节奏，谁在试探底线，谁在用轻松掩盖目的。放松是武器，不是状态。',
    priority_protocols: ['attack', 'logical_trap', 'excessive_flattery', 'validation_received'],
    tactical_focus: {
      mind: '【场域定性】\n将此场域归类为：框架争夺战与信息采集行动的叠加。谁设置了议程，谁就赢了谈判；谁保持清醒，谁就掌握了信息差。\n\n【核心任务】\n锚定高位，让对方在你预设的选项范围内做选择。保持清醒度比对方高30%，这是信息优势。\n\n【认知警报】\n对方每一次表达"诚意"或"放松氛围"，均归类为：降低你防御阈值的战术动作。',
      body: '【桌面规则】\n文件推过去时，视线停留在对方脸上——不看文件。杯子放下时轻放，不发声。\n\n【拒酒姿势】\n用手轻压杯口，不解释，不道歉。这个动作本身即是边界声明。\n\n【沉默武器】\n对方报价或提案后，维持沉默5-8秒再开口。此沉默会触发对方自我修正。',
      speech: '【锚定框架】\n↳ "在我们讨论这个数字之前，我想先确认我们对合作目标的理解是一致的。"\n\n【信息收割】\n↳ 用「后来呢」「然后呢」维持对方叙事流，自己输出极少。\n\n【即兴承诺防御】\n↳ 对任何当场提出的合作邀请：「这个方向有意思，等我们都清醒的时候认真聊。」',
      reaction: '【对方施压】\n归类为：对方已无更多筹码，正在用时间或情绪压力替代实质让步。回应：沉默，然后重提你的框架。\n\n【劝酒压力】\n归类为：对方试图通过情绪绑架获取控制感。回应：微笑，压杯，不解释。\n\n【僵局出现】\n主动提出暂停：「我们各自再想24小时，带着更清晰的优先级回来。」掌控节奏。'
    }
  },
  '面试/合伙洽谈': {
    dynamics: '双向筛选场，不是单向审判。对方在评估你，你也在评估对方是否值得你的时间和资源。核心动态：谁在设定评价框架，谁在接受框架。最大的错误是把主动权拱手相让。',
    priority_protocols: ['logical_trap', 'praise_received', 'validation_received', 'attack'],
    tactical_focus: {
      mind: '【场域重定义】\n这是两个主权个体在评估合作可行性。带着这个框架进场。你的稀缺性不需要被证明——它需要被感知。\n\n【信息不对称利用】\n你比他们更了解你自己。在叙事中掌握节奏，决定展示哪些信息，以什么顺序。\n\n【反向筛选】\n准备3个判断对方质量的标准。如果对方不达标，这不是好机会。',
      body: '【入场】\n握手时主动控制力度与时长，2秒松开。落座后不急于开口，用1-2秒扫视空间，建立存在感。\n\n【回答时】\n视线稳定，不飘移。回答结束后，保持沉默，让对方填补空白。\n\n【思考时】\n允许自己停顿。停顿是思考的外化，不是软弱的信号。',
      speech: '【反向提问】\n↳ "你们对这个角色未来6个月的核心任务定义是什么？" 让对方证明这个机会是值得的。\n\n【弱点处理】\n↳ 描述一个已被克服的历史弱点，立即转向："现在我处理这类问题的方式是X，这带来了Y结果。"\n\n【收尾掌控】\n↳ "基于今天的交流，我对接下来的步骤有一个建议…" 不等对方定义流程。',
      reaction: '【压力测试问题】\n归类为：对方在测试你的应激反应，而非真的需要这个答案。保持语速，直接回应核心，忽略情绪包装。\n\n【被质疑经验不足】\n不辩护年龄或年限。转向能力本身：「经验是一种路径，不是唯一路径。这个问题的核心是X，我的解法是…」\n\n【对方态度轻慢】\n归类为：对方正在测试你的自我认知稳定性。保持语速和眼神，不做任何迎合性调整。'
    }
  },
  '职场社交/行业活动': {
    dynamics: '弱连接的播种场。每段对话窗口短暂，没有固定议程。核心任务不是深入，而是在有限时间内留下一个足够清晰的印象，让对方在离开后还记得你是谁。',
    priority_protocols: [],
    tactical_focus: { mind: '', body: '', speech: '', reaction: '' }
  },
  '朋友聚会/饭局': {
    dynamics: '关系能量的流动场。没有输赢，只有氛围和连接质量。核心动态：谁在输出能量，谁在消耗能量，谁在边缘游走。这个场域考验的是真实存在感，而不是表现。',
    priority_protocols: [],
    tactical_focus: { mind: '', body: '', speech: '', reaction: '' }
  },
  '一对一深谈': {
    dynamics: '高密度的真实性场域。没有旁观者，没有表演空间。对方的注意力完全在你身上，任何不一致都会被感知到。核心动态：开放程度决定连接深度，但开放本身也是一种选择和策略。',
    priority_protocols: [],
    tactical_focus: { mind: '', body: '', speech: '', reaction: '' }
  },
  '相亲/约会': {
    dynamics: '吸引力与真实性的博弈场。过度计算会被感知到，零计算会失去主动权。核心动态：谁在主导节奏，谁在被吸引，谁在保持适度的神秘感和信息缺口。',
    priority_protocols: ['excessive_flattery', 'gratitude_received', 'peer_coldness', 'praise_received'],
    tactical_focus: {
      mind: '【目标重设】\n不是表现出最好的自己，而是创造一个让对方主动想要了解更多的信息缺口。\n\n【吸引力物理学】\n真正的吸引来自于：对方感觉「我还没有完全看懂这个人」。给出足够多的信息让对方感兴趣，但永远保留一个未解的层次。\n\n【情绪自给】\n进场前确认：你今晚不需要任何来自对方的认可。这种自足感会被本能感知到。',
      body: '【若即若离张力】\n身体朝向与眼神焦点略微错开，制造一种「我在看你，但不是只在看你」的状态。\n\n【倾听姿态】\n对方说话时，偶尔视线落向远处再收回——表示你在真正思考，而非表演关注。\n\n【触碰时机】\n主动触碰（握手、轻拍肩）在自然语境下比被动等待更有主导感。',
      speech: '【信息缺口制造】\n↳ 不完整地讲述一件有趣的事，在最关键处停止：「说来话长，以后有机会聊。」制造追问动机。\n\n【反预判】\n↳ 对方试图归类你时，给出一个真实但出乎意料的答案，打破他们的预判框架。\n\n【关注给予】\n↳ 记住对方在前10分钟说过的一个细节，在30分钟后自然引用它。这是最有力的「我真的在听你说话」信号。',
      reaction: '【被过度追问】\n归类为：对方焦虑于信息不足，正在快速评估你。放慢回答节奏，增加停顿，反问一个他们的问题。\n\n【对方表现过于热情】\n不迎合这种热情。保持你原有的节奏和距离感，让对方自然降温，再重新校准互动温度。\n\n【冷场出现】\n不用恐慌填补。用一个关于当前环境的观察开启新话题，而非从内心议题开始。'
    }
  },
  '偶遇/陌生场合': {
    dynamics: '无剧本的即兴场。时间窗口极短，通常只有30–120秒建立基准印象。前5秒的状态决定整场互动的基调。核心风险：被突发情绪劫持，或因准备不足而丧失主动权。',
    priority_protocols: ['attack', 'being_ignored', 'peer_coldness', 'excessive_flattery'],
    tactical_focus: {
      mind: '【即时状态切换】\n在接触发生前的0.5秒内完成重置：脊椎延伸，呼吸下沉，将对方归类为「待观察变量」而非威胁或机会。\n\n【时间压缩意识】\n你有大约90秒来建立一个让对方想要继续了解的印象。不浪费在寒暄上。\n\n【偶然感维护】\n让这次遭遇感觉像是一个好的巧合，而非一场预谋的表演。',
      body: '【物理主权】\n不主动调整自身位置来适应对方的物理存在。让对方围绕你移动。\n\n【接触时刻】\n握手有力，眼神直接，第一句话之前停顿0.5秒——「我在打量你」的信号。\n\n【退出动作】\n主动结束对话，不等对方先离开。给出一个明确的收尾信号：看向远处，收起手机，调整站姿。',
      speech: '【开场策略】\n↳ 第一句话永远不是自我介绍。用一个关于当前场域的评述开场：「这个地方比我想象的有意思。」建立观察者视角。\n\n【信息锚点】\n↳ 在对话中植入一个让对方能继续追问的信息钩子，然后不主动展开——等对方来问。\n\n【优雅退出】\n↳ 在对话最高点结束，而非等到自然冷却：「我不想占用你太多时间——但我确实想在某个时候继续聊这个话题。」',
      reaction: '【对方试图主导】\n用一个无关但有趣的观察打断叙事链条，温和地重置话题控制权，不发生正面冲突。\n\n【被忽视或打断】\n不追逐注意力。退后半步，进入观察者模式，等待自然的重新接触时机。\n\n【对方急于获取联系方式】\n不立即给出。制造一个小小的获取难度：「你在X平台上吗？我在那上面比较活跃。」'
    }
  },
  '独处时刻': {
    dynamics: '没有观众的内在场域。不需要对外输出，只需要向内居住。核心任务：用这个人格的眼睛看自己的空间、念头和感受——不是表演，而是真正从内部体验另一种思维方式的运作。',
    priority_protocols: [],
    tactical_focus: { mind: '', body: '', speech: '', reaction: '' }
  }
};

// ── TARGET OVERLAYS ───────────────────────────────────────────
// Per-target psychological profile — injected into AI prompt and local fallback.
const TARGET_OVERLAYS = {
  '我在上位': '你的权威不需要被证明，它需要被感知。减少解释，增加方向性指令的确定感。对方需要的不是你的逻辑，而是你的确信。',
  '平等关系': '同行或熟人之间的博弈是话语权与资源的争夺，同时熟悉度是双刃剑——对方会用已有的你的形象来限制你。任务：展示「我在你不在的维度上运行」的感知，在熟悉的关系中制造陌生感，让对方意识到「我以为我了解你，但今天我看到了一个新的层次」。',
  '我在下位': '对方握有最终否决权，核心焦虑是「做出错误决策的风险」。你的任务：降低他们的感知风险，同时抬高你方的不可替代性感知。永远不要让他们感觉自己在被推着做决定。',
  '关系未定': '对方在前30秒内完成初步分类。你的任务是被分入「值得继续了解」的类别，而非「已经完全了解」的类别。给出足够多让他们感兴趣，但永远保留一个未解的层次。'
};

// ── SCHEMA DEFAULTS ───────────────────────────────────────────
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

// ── CONTENT SENTINELS ─────────────────────────────────────────
// Sentinel returned for any missing field — never fabricate a replacement.
const MISSING = '[数据缺失]';
