# Archetype Seed Schema

Canonical runtime seed location:

- `/database/archetypes/ARCHETYPE_XX_seed.md`

Canonical docs/template location:

- `/database/docs/archetypes/archetype_seed_template.md`

Required sections:

- `Identity`
- `Quadrants`
- `Core Drive`
- `Motivation`
- `Core Fear`
- `Axis Explanations`
- `Interaction Logic`
- `Emotional Logic`
- `Power Logic`
- `Scene Playbook`
- `Forbidden Drift`
- `Expression Anchors`
- `Consumer Assets`
- `Optional`

Hard-required fields:

- `archetype_id`
- `name`
- `version`
- `quadrants`
- `core_drive`
- `motivation`
- `core_fear`
- `axis_explanations` (E, O, R, B — one phrase each)
- `interaction_logic`
- `emotional_logic`
- `power_logic`
- `scene_playbook` (one sentence per SCENARIO_OVERLAYS scene label)
- `forbidden_drift`
- `slogan`
- `signature_lines_pool`
- `reaction_patterns_pool`

Optional-but-recommended fields:

- `voice_anchor`
- `behavior_anchor`

Phase 2 schema-extension notes:

- `motivation` — one sentence, what this archetype is chasing. Powers the "why" framing in Theater + Detail.
- `core_fear` — one sentence, what would make this archetype collapse / break character. Powers anti-pattern callouts.
- `axis_explanations` — keyed by `E / O / R / B`. Each value is a short phrase describing what *this archetype's* score on that axis means in observable behavior. Powers the Browse spectrum chart (Phase 5).
- `scene_playbook` — keyed by scene label (must match `SCENARIO_OVERLAYS` keys in `docs/constants.js`). Each value is one authored sentence describing the archetype's primary tactic in that scene. Powers the Theater mind hero in Phase 3.
