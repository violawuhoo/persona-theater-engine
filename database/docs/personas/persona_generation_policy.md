# Persona Generation Policy

## Scope

Input:

- `database/archetypes/ARCHETYPE_XX_seed.md`

Generated outputs:

- `database/archetype_models/ARCHETYPE_XX.json`
- `database/personas/ARCHXX.json`
- `database/manifests/*.json`

## Invariants

Persona generation must preserve seed-defined:

- `core_drive`
- `interaction_logic`
- `emotional_logic`
- `power_logic`
- `forbidden_drift`

