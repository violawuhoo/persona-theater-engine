# ARCH Markdown Extraction Standard (Level C)

This standard defines how `database/scripts/ingest_persona.py` maps `arch0x.md` content into canonical persona JSON fields.

## 1) Canonical source structure

Recommended source shape:

1. Title line
   - `ARCH-05: 中文名 (English Name) | 分类/原型`
2. Core directive line
   - `核心: ...`
3. Numbered sections
   - `1. 底层逻辑 ...`
   - `2. 思维心法 ...`
   - `3. 身体规范 ...`
   - `4. 禁忌行为 ...`
   - `5-9. 场景/响应协议扩展 ...`
   - `10. 参考原型 ...`

The parser is tolerant to spacing and full-width punctuation variants.

## 2) Canonical JSON mapping

- Identity
  - `name` <- title Chinese name / explicit `name:` label
  - `subtitle` <- title English name / explicit subtitle aliases
  - `archetype` <- title `|` right-hand classification / explicit archetype aliases
  - `core_directive` <- `核心:` / `core:` / first quote fallback

- Section mappings
  - Section 1 -> `root_logic_core`
  - Section 2 -> `cognitive_filtering_algorithm`
  - Section 3 -> `physical_execution_constraints`
  - Section 4 -> `universal_forbidden_actions`
  - Sections 5-9 -> `dynamic_response_protocols`
  - Section 10 -> `reference_archetypes`

## 3) Tolerant alias rules

The parser supports aliases and variant labels for the same canonical keys.

Examples:

- Root logic aliases
  - `社交本质论` -> `social_essence`
  - `自我定位` -> `self_positioning`
  - `权力来源` -> `power_source`

- Physical/body aliases
  - `重心/体态` -> `posture`
  - `视线协议/注视` -> `gaze_protocol`
  - `呼吸/心率` -> `breathing_protocol`
  - `声音/词汇` -> `voice_and_language`
  - `审美/外表` -> `aesthetic_signal`
  - `延迟/滞后` -> `latency_buffer`

- Protocol sub-field aliases
  - `核心/认知过滤/逻辑判定` -> `classification`
  - `动作/物理动作/做法/行为表现` -> `physical_output`
  - `破局语言/逻辑语言` -> `verbal_output`
  - `逻辑/博弈逻辑/效果/结果` -> `logic`

## 4) Unmapped-field policy (Policy B)

When source content is meaningful but labels are non-canonical:

1. Map to the closest existing canonical field already in schema.
2. Prefer semantic alignment over strict string equality.
3. Do not add arbitrary new frontend-facing schema fields.

## 5) Source formatting guidance

To maximize extraction quality:

- Keep section numbering explicit (`1.` `2.` ...).
- Prefer `标签: 内容` style lines for bullets.
- Keep protocol rows either:
  - tab-delimited 3-column rows (`signal`, `classification`, `output`), or
  - grouped bullet blocks with labeled sub-lines.

## 6) Missing-field diagnostics

CLI prints key missing/empty fields after ingestion:

- `name`, `subtitle`, `archetype`
- `root_logic_core`, `cognitive_filtering_algorithm`, `physical_execution_constraints`
- `universal_forbidden_actions`, `dynamic_response_protocols`

Use these diagnostics to update source labels or parser aliases.
