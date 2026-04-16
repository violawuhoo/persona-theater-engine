# Database Ingestion Pipeline

`ingest_persona.py` is the single database ingestion CLI for the archetype/persona system.

## What it does

- Parses authoritative archetype seed markdown when `--archetype-seed` is supplied.
- Parses persona markdown into an archetype-linked persona instance.
- Applies alias mapping for legacy section labels in persona markdown.
- Preserves long-form text in structured fields instead of flattening into short strings.
- Validates generated JSON against the database schemas in `/database/schema/`.
- Rebuilds archetype and persona manifests from actual JSON files.
- Prints diagnostics for missing fields, inferred fields, and mapping confidence.

## Usage

Generate the seed archetype and the `ARCH01` persona instance:

```bash
python3 database/scripts/ingest_persona.py \
  database/personas/ARCH01.md \
  --archetype-seed database/docs/archetypes/ARCHETYPE_01_seed.md
```

Persona-only ingest when the archetype already exists:

```bash
python3 database/scripts/ingest_persona.py \
  database/personas/ARCH01.md \
  --archetype-id ARCHETYPE_01
```

Dry-run:

```bash
python3 database/scripts/ingest_persona.py \
  database/personas/ARCH01.md \
  --archetype-seed database/docs/archetypes/ARCHETYPE_01_seed.md \
  --dry-run
```

## Diagnostics

The CLI reports:

- `missing_fields`: schema-relevant fields still empty after parsing
- `inferred_fields`: values derived from context rather than direct section matches
- `mapping_confidence`: a 0-1 confidence score based on direct mappings vs inference/missing data

## Notes

- The active structured database now lives in `/database/archetypes`, `/database/personas`, `/database/manifests`, and `/database/schema`.
- Archetype seeds stay in `/database/docs/archetypes`.
- Manifest contents are rebuilt from disk, so duplicate ids and stale entries are eliminated during ingestion.
