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

// ── extractTheaterContent ─────────────────────────────────────
// Theater: assembles 4 guidance blocks from theater_support fields.
// Slot mapping:
//   [0] 底层逻辑  — theater_support.logic_axes + scene overlay mind
//   [1] 行为特征  — theater_support.expression_modulators + scene_tactics + scene overlay body
//   [2] 语言风格  — persona language/signature base + scene speech constraints
//   [3] 反应机制  — persona reaction/logic base + scene reaction constraints
// Dynamic AI response may overlay these blocks at runtime.
function extractTheaterContent(data, scene = '', target = '', scale = '') {
  const sceneOverlay  = SCENARIO_OVERLAYS[scene]  || null;
  const targetProfile = TARGET_OVERLAYS[target]   || null;

  const ts             = (data && data.theater_support) || {};
  const cf             = (data && data.consumer_fields) || {};
  const logicAxes      = ts.logic_axes            || {};
  const sceneTactics   = ts.scene_tactics         || {};
  const expressionMods = ts.expression_modulators || {};
  const reactionCues   = Array.isArray(ts.reaction_cues) ? ts.reaction_cues : [];

  // Determine scene scale tactic (small vs large based on selector value)
  const isLargeScale   = scale && (scale.includes('5-8') || scale.includes('>8'));
  const scaleTactic    = isLargeScale
    ? safeStr(sceneTactics.large_scale, safeStr(sceneTactics.small_scale, MISSING))
    : safeStr(sceneTactics.small_scale, safeStr(sceneTactics.large_scale, MISSING));

  const personaName = safeStr(cf.display_name, '');

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

  // ── [2] 语言风格: persona-first speech, scene as constraint ──
  const signatureLines = Array.isArray(cf.signature_lines_pool) ? cf.signature_lines_pool : [];
  const personaSpeechLines = [
    `【人格语气】${safeStr(cf.language_style, safeStr(expressionMods.delivery_mode, MISSING))}`,
    expressionMods.delivery_mode ? `【输出节奏】${safeStr(expressionMods.delivery_mode)}` : '',
    ...signatureLines.slice(0, 3).map((line, idx) => `【人格例句${idx + 1}】\n↳ ${safeStr(line)}`)
  ].filter(Boolean);
  let speech = personaSpeechLines.join('\n\n') || MISSING;
  if (sceneOverlay) {
    speech += `\n\n【场景语言约束】\n${sceneOverlay.tactical_focus.speech}`;
  }

  // ── [3] 反应机制: persona-first reaction, scene as constraint ───
  const reactionLines = reactionCues.map(c =>
    `【${safeStr(c.trigger)}】\n${safeStr(c.guidance)}`
  );
  const personaReactionLines = [
    logicAxes.interaction_focus ? `【互动焦点】${safeStr(logicAxes.interaction_focus)}` : '',
    logicAxes.emotional_guard ? `【情感防护】${safeStr(logicAxes.emotional_guard)}` : '',
    logicAxes.power_move ? `【升级动作】${safeStr(logicAxes.power_move)}` : '',
    ...reactionLines
  ].filter(Boolean);
  let reaction = personaReactionLines.join('\n\n') || MISSING;
  if (sceneOverlay) {
    reaction += `\n\n【场景反应约束】\n${sceneOverlay.tactical_focus.reaction}`;
  }

  console.log(`[Extractor] ✓ Theater content extracted — Scene: ${scene || 'generic'}, Target: ${target || 'generic'}, Scale: ${scale || 'default'}`);
  return { mind, body, speech, reaction };
}
