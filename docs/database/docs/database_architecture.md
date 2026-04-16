# Database Architecture

The database layer is organized around a single-input persona workflow.

## Layout

- `/database/personas/ARCHXX.md`
  The only required authored input.
- `/database/docs/archetypes/ARCHETYPE_XX_seed.md`
  Generated semantic seed and the source of truth for the archetype.
- `/database/archetypes/ARCHETYPE_XX.json`
  Structured machine archetype generated from the seed.
- `/database/personas/ARCHXX.json`
  Structured machine persona generated from the persona markdown.
- `/database/manifests/`
  Rebuilt registries for actual archetype/persona files on disk.
- `/database/schema/`
  JSON schemas for archetypes, personas, and generation contracts.
- `/database/scripts/ingest_persona.py`
  The only ingestion CLI.
- `/docs/database/`
  Generated mirror for docs-side read access to the current database runtime artifacts.

## Core model

- Persona markdown is the authored source.
- Seed markdown is the generalized archetype source.
- Archetype JSON stores mother-model structure and parameter ranges.
- Persona JSON stores instance realization and concrete parameter values.
- Generation contracts define `locked_fields`, `soft_fields`, `expansion_zones`, and `forbidden_drift`.

## Integrity rules

- No persona can exist without a valid `archetype_id`.
- Parameter ranges live only in archetypes.
- Realized values live only in personas.
- Manifests are rebuilt from disk to avoid stale or duplicate entries.
- Validation runs after generation so missing fields and incompatible shapes are surfaced immediately.
- `database/**` is always authoritative; `docs/database/**` is overwritten from database state after ingestion or rebuild.
