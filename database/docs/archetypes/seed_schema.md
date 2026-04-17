# Strict Archetype Seed Schema

Canonical human-authored input path:

- `/database/archetypes/ARCHETYPE_XX_seed.md`

Required markdown contract:

```md
## Identity
archetype_id:
name:
version:

## Core Drive
core_drive:

## Interaction Logic
interaction_logic:

## Emotional Logic
emotional_logic:

## Power Logic
power_logic:

## Forbidden Drift
forbidden_drift:

## Expression Anchors
voice_anchor:
behavior_anchor:

## Optional
notes:
```

Validation:

- Hard-fail required: `archetype_id`, `name`, `version`, `core_drive`, `interaction_logic`, `emotional_logic`, `power_logic`, `forbidden_drift`.
- Soft-warning optional: `voice_anchor`, `behavior_anchor`.
- Values support single-line or bullet-list format.
