# Docs Mirror Sync

`database/**` is the only source of truth. `docs/database/**` is a generated mirror that is rebuilt by the ingestion CLI.

## Mirrored artifact classes

The current archetype-persona system mirrors these directories:

- `/database/archetypes/*.json` -> `/docs/database/archetypes/*.json`
- `/database/personas/*.json` and `/database/personas/*.md` -> `/docs/database/personas/`
- `/database/manifests/*.json` -> `/docs/database/manifests/*.json`
- `/database/schema/*.json` -> `/docs/database/schema/*.json`
- `/database/docs/*.md` and `/database/docs/archetypes/*.md` -> `/docs/database/docs/`

The mirror does not include backup files, temp files, `.DS_Store`, or obsolete legacy database layouts.

## When sync runs

Sync runs automatically at the end of `database/scripts/ingest_persona.py` after:

1. seed generation
2. archetype JSON generation
3. persona JSON generation
4. manifest rebuild
5. database validation

The CLI then overwrites the managed mirror directories in `/docs/database/` and validates that mirrored files match the authoritative database files.

## Future additions

When a new `ARCHXX.md` is ingested:

1. the seed is generated in `/database/docs/archetypes/`
2. the archetype JSON is generated in `/database/archetypes/`
3. the persona JSON is generated in `/database/personas/`
4. manifests are rebuilt from disk
5. the updated runtime artifacts and database docs are copied into `/docs/database/`

No manual docs-side copying is required. If a mirrored file class changes, update the ingestion CLI sync plan and this document together.
