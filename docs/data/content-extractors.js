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
