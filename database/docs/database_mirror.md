# Database Mirror

`/database` is the only source of truth.

`/docs/database` is a **derived, read-only mirror** used for presentation/read access.

## One-way sync

Sync direction is strictly:

- `/database` -> `/docs/database`

No runtime code reads `/docs/database` as input.

## What is mirrored

Only runtime-relevant directories are mirrored:

- `/database/archetypes` -> `/docs/database/archetypes`
- `/database/archetype_models` -> `/docs/database/archetype_models`
- `/database/personas` -> `/docs/database/personas`
- `/database/manifests` -> `/docs/database/manifests`

## What is NOT mirrored

The following must not appear in `/docs/database`:

- `/database/docs`
- `/database/legacy`
- `/database/scripts`
- `/database/schema`

## Deterministic overwrite behavior

Mirror sync clears existing `/docs/database` contents first, then copies only allowed runtime targets.
Deleted source files are removed from the mirror on next sync.

## Editing rule

Always edit files under `/database`.
Never edit `/docs/database` directly.
