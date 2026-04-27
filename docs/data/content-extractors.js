// ============================================================
// CONTENT EXTRACTORS — docs/data/content-extractors.js
// Pure functions that shape raw persona JSON into view-layer objects.
// No AppState reads/writes. No DOM access.
// Dependencies (must load first): constants.js, utils.js
// Loaded as a classic <script> before state/app-state.js and script.js.
// Do NOT use import/export — targets a browser classic-script context.
// ============================================================

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

// ── Theater extractor helpers ─────────────────────────────────
// truncateAtColon: return substring up to (excluding) first Chinese 「：」 or ASCII ":".
//   "审判尺度：以内部一致的高标准对行为进行持续评估" → "审判尺度"
function truncateAtColon(s) {
  const str = safeStr(s, '').trim();
  if (!str) return '';
  const i = str.search(/[：:]/);
  return i === -1 ? str : str.slice(0, i);
}

// firstSentence: return substring up to (and including) first 「。」「.」「!」「?」「！」「？」
//   Falls back to first 40 chars if no terminator found.
function firstSentence(s, maxFallback = 40) {
  const str = safeStr(s, '').trim();
  if (!str) return '';
  const m = str.match(/^[^。.!?！？]+[。.!?！？]/);
  if (m) return m[0].trim();
  return str.length > maxFallback ? str.slice(0, maxFallback) + '…' : str;
}

// firstBracketBlock: extract the FIRST 【label】... block from a bracketed-blocks string.
// Returns { label, body } or null. The "body" runs until the next 【…】 or blank line, whichever comes first.
//   "【场域定性】\n将此场域归类为：…\n\n【核心任务】\n锚定…"  →  { label:"场域定性", body:"将此场域归类为：…" }
function firstBracketBlock(s) {
  const str = safeStr(s, '');
  if (!str) return null;
  const m = str.match(/【([^】]+)】\s*\n?([\s\S]*?)(?=\n\s*【|\n\s*\n|$)/);
  if (!m) return null;
  return { label: m[1].trim(), body: m[2].trim() };
}

// firstSegment: split on Chinese delimiters 「、，,。」 and return first non-empty segment.
//   "稳定注视、最小幅度动作。" → "稳定注视"
function firstSegment(s) {
  const str = safeStr(s, '').trim();
  if (!str) return '';
  const parts = str.split(/[、，,。]/).map(p => p.trim()).filter(Boolean);
  return parts[0] || str;
}

// ── extractTheaterContent ─────────────────────────────────────
// Theater: assembles 4 guidance blocks from theater_support fields.
// Each block is a structured { hero, supports[], footer } object:
//   hero     — single sentence (≤40 chars target), the focal point
//   supports — array of 2 short items (≤30 chars target), evidence/mechanism
//   footer   — collapsible scene-overlay text (the rich tactical detail)
// Slot mapping:
//   [0] 底层逻辑  — persona × scene fusion sentence
//   [1] 行为特征  — terse physicality + delivery anchor
//   [2] 语言风格  — verbatim signature line as hero
//   [3] 反应机制  — verbatim reaction_cue as hero
// Dynamic AI response may overlay these blocks at runtime (kept as flat string in legacy shape).
function extractTheaterContent(data, scene = '', target = '', scale = '') {
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;

  const ts             = (data && data.theater_support) || {};
  const cf             = (data && data.consumer_fields) || {};
  const logicAxes      = ts.logic_axes            || {};
  const expressionMods = ts.expression_modulators || {};
  const reactionCues   = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];

  const personaName    = safeStr(cf.display_name, '');
  const sceneLabel     = safeStr(scene, '');
  const sceneFocus     = (sceneOverlay && sceneOverlay.tactical_focus) || {};

  // ── [0] mind — 底层逻辑 ─────────────────────────────────────
  // Hero: 「{persona}」把【{scene}】当作「{power_move 截到首冒号}」的舞台。
  const powerKey = truncateAtColon(logicAxes.power_move) || MISSING;
  const mindHero = personaName && sceneLabel
    ? `「${personaName}」把【${sceneLabel}】当作「${powerKey}」的舞台。`
    : `主战术：${powerKey}。`;

  const mindSupports = [
    `互动焦点 · ${truncateAtColon(logicAxes.interaction_focus) || MISSING}`,
    targetProfile ? `目标焦点 · ${firstSentence(targetProfile, 32)}` : `情感防护 · ${truncateAtColon(logicAxes.emotional_guard) || MISSING}`
  ];
  const mindFooter = sceneOverlay
    ? `${sceneOverlay.dynamics}\n\n${sceneFocus.mind || ''}`.trim()
    : '';

  // ── [1] body — 行为特征 ─────────────────────────────────────
  // Hero: 身体先「{physicality 第一段}」，节奏走「{delivery_mode 第一段}」。
  const phys      = firstSegment(expressionMods.physicality);
  const delivery  = firstSegment(expressionMods.delivery_mode);
  const bodyHero  = phys && delivery
    ? `身体先「${phys}」，节奏走「${delivery}」。`
    : (phys ? `身体先「${phys}」。` : (delivery ? `节奏走「${delivery}」。` : MISSING));

  const sceneBodyBlock = firstBracketBlock(sceneFocus.body);
  const reactionCue0   = reactionCues[0];
  const bodySupports = [
    sceneBodyBlock ? `${sceneBodyBlock.label} · ${firstSentence(sceneBodyBlock.body, 30)}` : `肢体基准 · ${safeStr(expressionMods.physicality, MISSING)}`,
    reactionCue0 ? `${safeStr(reactionCue0.trigger)} · ${firstSentence(reactionCue0.guidance, 28)}` : `语言模式 · ${safeStr(expressionMods.delivery_mode, MISSING)}`
  ];
  const bodyFooter = sceneFocus.body || '';

  // ── [2] speech — 语言风格 ───────────────────────────────────
  // Hero: verbatim signature_lines_pool[0]
  const sigLines = Array.isArray(cf.signature_lines_pool) ? cf.signature_lines_pool : [];
  const speechHero = sigLines[0]
    ? safeStr(sigLines[0])
    : safeStr(cf.language_style, MISSING);

  const sceneSpeechBlock = firstBracketBlock(sceneFocus.speech);
  const speechSupports = [
    sigLines[1] ? `候补例句 · ${safeStr(sigLines[1])}` : `语气基准 · ${safeStr(cf.language_style, MISSING)}`,
    sceneSpeechBlock ? `${sceneSpeechBlock.label} · ${firstSentence(sceneSpeechBlock.body, 32)}` : `节奏 · ${safeStr(expressionMods.delivery_mode, MISSING)}`
  ];
  const speechFooter = [
    sigLines.slice(2).map((l, i) => `【备用例句${i + 1}】${safeStr(l)}`).join('\n'),
    sceneFocus.speech || ''
  ].filter(Boolean).join('\n\n').trim();

  // ── [3] reaction — 反应机制 ─────────────────────────────────
  // Hero: 面对【{cue[0].trigger}】：{cue[0].guidance}
  const reactionHero = reactionCue0
    ? `面对【${safeStr(reactionCue0.trigger)}】：${safeStr(reactionCue0.guidance)}`
    : `升级动作 · ${truncateAtColon(logicAxes.power_move) || MISSING}`;

  const sceneReactionBlock = firstBracketBlock(sceneFocus.reaction);
  const reactionCue1 = reactionCues[1];
  const reactionSupports = [
    reactionCue1 ? `${safeStr(reactionCue1.trigger)} · ${firstSentence(reactionCue1.guidance, 28)}` : `情感防护 · ${truncateAtColon(logicAxes.emotional_guard) || MISSING}`,
    sceneReactionBlock ? `${sceneReactionBlock.label} · ${firstSentence(sceneReactionBlock.body, 32)}` : `升级动作 · ${truncateAtColon(logicAxes.power_move) || MISSING}`
  ];
  const reactionFooter = [
    reactionCues.slice(2).map(c => `【${safeStr(c.trigger)}】${safeStr(c.guidance)}`).join('\n'),
    sceneFocus.reaction || ''
  ].filter(Boolean).join('\n\n').trim();

  console.log(`[Extractor] ✓ Theater content extracted — Scene: ${scene || 'generic'}, Target: ${target || 'generic'}, Scale: ${scale || 'default'}`);
  return {
    mind:     { hero: mindHero,     supports: mindSupports,     footer: mindFooter },
    body:     { hero: bodyHero,     supports: bodySupports,     footer: bodyFooter },
    speech:   { hero: speechHero,   supports: speechSupports,   footer: speechFooter },
    reaction: { hero: reactionHero, supports: reactionSupports, footer: reactionFooter }
  };
}
