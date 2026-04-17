# Database Structure Guide

This document defines the active `/database` architecture and the single source of truth for runtime generation.

## Active top-level structure

- `/database/archetypes/`
  - **Authored runtime inputs only**.
  - Canonical seed markdown files: `ARCHETYPE_XX_seed.md`.
- `/database/archetype_models/`
  - **Generated archetype artifacts only**.
  - Machine outputs: `ARCHETYPE_XX.json`.
- `/database/personas/`
  - **Generated persona artifacts only**.
  - Machine outputs: `ARCHXX.json`.
- `/database/manifests/`
  - **Generated registry outputs only**.
  - `archetypes.manifest.json`, `personas.manifest.json`.
- `/database/schema/`
  - JSON schema definitions for validation contracts.
- `/database/docs/`
  - Documentation only (workflow guides, templates, schema explanations, policies).
  - Never used as runtime input.
- `/database/legacy/`
  - Deprecated assets from older workflows, retained for reference only.

## Source-of-truth rules

1. Human-authored runtime input lives only in `/database/archetypes/*.md`.
2. All JSON in `/database/archetype_models`, `/database/personas`, and `/database/manifests` is generated.
3. `/database/docs/**` is docs-only and must not contain active seed inputs.
4. Legacy persona markdown workflows are archived under `/database/legacy/`.

## Naming conventions

- Authored seed input: `ARCHETYPE_XX_seed.md`
- Generated archetype output: `ARCHETYPE_XX.json`
- Generated persona output: `ARCHXX.json`
- Doc template/schema files: lowercase descriptive names (for example `archetype_seed_template.md`, `archetype_seed_schema.md`)

## Active workflow

1. Author or update `database/archetypes/ARCHETYPE_XX_seed.md`.
2. Run:

```bash
python3 database/scripts/ingest_persona.py database/archetypes/ARCHETYPE_XX_seed.md
```

3. Generated outputs are refreshed in:
   - `database/archetype_models/`
   - `database/personas/`
   - `database/manifests/`
4. Validation runs against `database/schema/`.

