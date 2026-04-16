# Database Ingestion Pipeline

`ingest_persona.py` is the single database ingestion CLI for the archetype/persona system.

## Standard usage

```bash
python3 database/scripts/ingest_persona.py database/personas/ARCHXX.md
```

That single command will:

1. parse `ARCHXX.md`
2. generate `/database/docs/archetypes/ARCHETYPE_XX_seed.md`
3. generate `/database/archetypes/ARCHETYPE_XX.json`
4. generate `/database/personas/ARCHXX.json`
5. rebuild manifests
6. sync the generated docs mirror under `/docs/database/`
7. validate the database, mirror, and print diagnostics

## Diagnostics

The CLI reports:

- `missing_fields`
- `inferred_fields`
- `mapping_confidence`

## Optional flags

- `--dry-run` parses and validates without writing files
- `--sync-git` performs best-effort `git pull --ff-only` before ingestion
- `--archetype-seed` overrides the output path for the generated seed file
- `--archetype-id` overrides the archetype id if needed

## Notes

- The canonical seed structure is defined in `/database/docs/archetypes/archetype_seed_template.md`.
- The standard input is the tagged persona protocol markdown used in the current database.
- `database/**` is the single source of truth; `docs/database/**` is a generated mirror for runtime read access.
