# Persona Consumer Contract

This document defines the frontend-facing persona fields that are safe to consume directly from `database/personas/ARCHXX.json`.

## Canonical consumer section

Consumer-facing fields live in:

- `consumer_fields`

Frontend should prefer this section over generation-oriented groups such as `stable_fields` and `soft_fields`.

## Fixed fields

These are stable display fields and should be shown directly without semantic fallback:

- `consumer_fields.display_name`
- `consumer_fields.quadrants`
- `consumer_fields.slogan`
- `consumer_fields.core_essence`
- `consumer_fields.social_essence`
- `consumer_fields.taboos`
- `consumer_fields.theater_logic`
- `consumer_fields.behavior_style`
- `consumer_fields.language_style`

## Semi-fixed pools

These are authored pools. Frontend may select, truncate, dedupe, or sort them, but must not generate new meaning:

- `consumer_fields.signature_lines_pool`
- `consumer_fields.reaction_patterns_pool`

## Runtime-only content

These must not be treated as fixed frontend contract:

- scene-specific reaction generation
- runtime improvisation
- turn-by-turn conflict handling
- generic response protocol scaffolding

## Quadrants

Quadrants are now authored explicitly in seed and compiled into:

- `consumer_fields.quadrants`

Compatibility notes:

- `realized_parameters` may still exist for compatibility
- when present, it mirrors the authored seed quadrants
- frontend should read `consumer_fields.quadrants` as the canonical fixed display contract
