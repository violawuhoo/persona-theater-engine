# Database Architecture

The database layer now separates seed documents, structured archetypes, persona instances, manifests, and schemas.

## Layout

- `/database/docs/archetypes/` stores human-authored seed markdown. These files are authoritative inputs, not runtime payloads.
- `/database/archetypes/` stores structured archetype JSON generated from seed files.
- `/database/personas/` stores persona markdown sources and persona instance JSON.
- `/database/manifests/` stores disk-derived registries for archetypes and personas.
- `/database/schema/` stores JSON schemas for archetypes, personas, and generation contracts.
- `/database/scripts/ingest_persona.py` is the only ingestion CLI and owns parsing, linking, validation, and manifest rebuilds.

## Core Model

- Archetype: the seed-level model. It defines parameter ranges, invariant logic, generation boundaries, and drift constraints.
- Persona: a realized instance of an archetype. It references `archetype_id`, stores concrete parameter values, and splits stable identity logic from softer expressive material.
- Generation contract: the shared freedom model. It defines `locked_fields`, `soft_fields`, `expansion_zones`, and `forbidden_drift`.

## Integrity Rules

- Every persona must reference an existing `archetype_id`.
- Archetype ranges and persona realized values are stored separately.
- Manifests are rebuilt from actual JSON files so stale registry entries cannot survive ingestion.
- Schema validation runs after writes, preventing silent data loss or incompatible payload drift.
