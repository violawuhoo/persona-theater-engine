# Docs Database Mirror Sync

The mirror is one-way and deterministic:

- source: `/database`
- mirror: `/docs/database`

Only these directories are mirrored:

- `database/archetypes`
- `database/archetype_models`
- `database/personas`
- `database/manifests`

Excluded from mirror:

- `database/docs`
- `database/legacy`
- `database/scripts`
- `database/schema`

Mirror sync runs at the end of ingestion, after generation and validation.
