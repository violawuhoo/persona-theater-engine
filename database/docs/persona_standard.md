# Persona Standard

A persona is a generated instance JSON artifact.

## Generation source

- Single source input: `/database/archetypes/ARCHETYPE_XX_seed.md`
- Persona JSON output: `/database/personas/ARCHXX.json`

## Required persona JSON structure

- `id`
- `version`
- `archetype_id`
- `name`
- `source_markdown`
- `stable_fields`
- `soft_fields`
- `realized_parameters`
- `generation_contract`

## Contract guarantees

- Persona remains bounded by archetype seed logic.
- `forbidden_drift` from seed is enforced into persona constraints/taboos.
- Generation is deterministic for archetype output; persona output is controlled and reproducible from the same seed.
- Field-level generation and drift guardrails are defined in `/database/docs/personas/persona_generation_policy.md`.
