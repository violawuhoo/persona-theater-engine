# Docs Mirror Sync

`database/**` is authoritative. `/docs/database/**` is a generated mirror.

## Mirrored classes

- `/database/archetypes/*.md` -> `/docs/database/archetypes/*.md`
- `/database/archetype_models/*.json` -> `/docs/database/archetype_models/*.json`
- `/database/personas/*.json` -> `/docs/database/personas/*.json`
- `/database/manifests/*.json` -> `/docs/database/manifests/*.json`
- `/database/schema/*.json` -> `/docs/database/schema/*.json`
- `/database/docs/**` -> `/docs/database/docs/**`

Legacy `/docs/database/schemas/` is considered stale and removed by sync validation.

