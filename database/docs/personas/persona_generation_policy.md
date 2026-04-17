# Persona Generation Policy (v1, Deterministic)

## Scope

Input:
- `database/archetypes/ARCHETYPE_XX_seed.md`

Outputs:
- `database/archetypes/ARCHETYPE_XX.json`
- `database/personas/ARCHXX.json`
- manifests

## Deterministic Rule

For v1, generation is fully deterministic:

- same seed content => same archetype JSON
- same seed content => same persona JSON
- no randomness / no stochastic wording

## Hard Invariants (Archetype-Dominant)

Persona generation must never violate:

- `core_drive`
- `interaction_logic`
- `emotional_logic`
- `power_logic`
- `forbidden_drift`

If a derived persona field conflicts with the seed constraints:

1. normalize deterministically when possible
2. fail generation when invariants still cannot be satisfied

## Seed -> Persona Mapping Table

- `voice_anchor` -> `voice`
- `behavior_anchor` -> `behavioral_signature`
- `interaction_logic` -> `relationship_dynamic`
- `emotional_logic` -> `emotional_tendency`
- `power_logic + interaction_logic + emotional_logic` -> `trigger_response`
- `forbidden_drift` -> `forbidden_behavior`

## Field-Level Rules

### voice
- prefer `voice_anchor`
- fallback from `interaction_logic + emotional_logic + power_logic`
- output must be short, observable, style-oriented

### behavioral_signature
- prefer `behavior_anchor`
- fallback from `interaction_logic + power_logic`
- output must be 2-3 repeatable, concrete traits

### relationship_dynamic
- derive from `interaction_logic + power_logic`
- must include distance / control stance

### emotional_tendency
- derive from `emotional_logic`
- must include baseline + defense tendency

### trigger_response
- derive from `interaction_logic + power_logic + emotional_logic`
- normalized as deterministic patterns: `trigger -> response`
- output fixed to three concise patterns in v1

### forbidden_behavior
- direct from `forbidden_drift`
- never weakened

## Fallback Policy

If optional anchors are missing:

- missing `voice_anchor` => deterministic fallback from logic fields
- missing `behavior_anchor` => deterministic fallback from logic fields

No empty generated policy fields are allowed.

## Drift Guardrails

Post-generation checks enforce:

- `forbidden_behavior` is a superset of `forbidden_drift`
- no submissive/appeasing voice when `power_logic` indicates dominance/control
- behavioral signature must include at least one interaction-logic phrase
- emotional tendency must contain emotional-logic core phrase
- trigger patterns must be present and non-empty

Behavior:
- normalize first
- fail if still invalid

## CLI / Compiler Flow

1. validate seed schema
2. generate archetype JSON
3. generate persona via policy mapping
4. run drift guardrails + invariant checks
5. write JSON + manifests
