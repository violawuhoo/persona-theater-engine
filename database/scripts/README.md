# Database Ingestion Pipeline

`ingest_persona.py` is the generation CLI for the database workflow.

## Standard usage

```bash
python3 database/scripts/ingest_persona.py database/archetypes/ARCHETYPE_XX_seed.md
```

## Responsibilities

The CLI:

1. parses strict seed markdown from `/database/archetypes/`
2. generates archetype JSON in `/database/archetype_models/`
3. generates persona JSON in `/database/personas/`
4. rebuilds manifests in `/database/manifests/`
5. validates using `/database/schema/`
6. syncs the one-way `/docs/database/` mirror

## Mirror scope

Only runtime directories are mirrored to `/docs/database/`:

- `archetypes`
- `archetype_models`
- `personas`
- `manifests`

`database/docs`, `database/legacy`, `database/scripts`, and `database/schema` are not mirrored.

## Notes

- Seed markdown is the only human-authored runtime input.
- `/database/docs/**` is documentation-only.
- Legacy persona markdown is archived under `/database/legacy/`.
