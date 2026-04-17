# Database Ingestion Pipeline

`ingest_persona.py` is the single database generation CLI for the archetype/persona system.

## Standard usage

```bash
python3 database/scripts/ingest_persona.py database/archetypes/ARCHETYPE_XX_seed.md
```

That single command will:

1. parse and validate strict seed markdown
2. generate `/database/archetypes/ARCHETYPE_XX.json`
3. generate `/database/personas/ARCHXX.json` via deterministic persona generation policy
4. run drift guardrails / invariant checks
5. rebuild manifests
6. sync the generated docs mirror under `/docs/database/`
7. validate the database and mirror

## Diagnostics

The CLI reports:

- `missing_fields`
- `inferred_fields`
- `mapping_confidence`

## Optional flags

- `--dry-run` parses and validates without writing files
- `--sync-git` performs best-effort `git pull --ff-only` before ingestion

## Notes

- Seed is the only authored input.
- Persona markdown input is no longer required.
- The strict schema is documented in `/database/docs/archetypes/seed_schema.md`.
- Persona policy is documented in `/database/docs/personas/persona_generation_policy.md`.
- `database/**` is the single source of truth; `docs/database/**` is a generated mirror for runtime read access.
