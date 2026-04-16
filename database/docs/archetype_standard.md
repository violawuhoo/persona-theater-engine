# Archetype Standard

An archetype is the authoritative seed-driven model for a persona family.

## Required structure

- `id`, `slug`, and bilingual `name`
- `seed_source` with the markdown path and authority marker
- `positioning`
- `core_traits`
- `parameter_space`
- `core_logic`
- `constraints`
- `generation_contract`
- `expression_style`
- `field_effect`
- `inner_outer_model`
- `summary`

## Seed to JSON transformation

- `[IDENTITY]` maps to `id`, `slug`, and `name`
- `[POSITIONING]` maps to `positioning.thesis` and `positioning.mechanism`
- `[CORE_TRAITS]` maps to `core_traits`
- `[PARAMETERS]` maps to `parameter_space` as numeric `min`/`max` ranges
- `[CORE_LOGIC]` maps to a structured `core_logic` object
- `[MUST_HAVE]`, `[MUST_NOT_HAVE]`, and `[FORBIDDEN_DRIFT]` map into `constraints`
- `[GENERATION_FREEDOM]` contributes to `generation_contract.expansion_zones` and stable-field rules
- `[EXPRESSION_STYLE]`, `[FIELD_EFFECT]`, and `[INNER_OUTER_MODEL]` remain structured long-text fields

## Authoring guidance

- Preserve semantic meaning rather than mirroring phrasing mechanically.
- Keep long-form content intact; do not truncate for schema convenience.
- Add new seed sections only when they describe stable archetype-level behavior rather than one persona instance.
