# Ingestion Workflow

The active pipeline is **seed-only ingestion**.

## Single authored input

- `/database/archetypes/ARCHETYPE_XX_seed.md`

No runtime input is read from `/database/docs/**`.

## Pipeline steps

1. Parse strict seed markdown.
2. Generate archetype JSON in `/database/archetype_models/ARCHETYPE_XX.json`.
3. Generate persona JSON in `/database/personas/ARCHXX.json`.
4. Rebuild manifests from generated files on disk.
5. Validate outputs using `/database/schema/*.json`.
6. Sync docs mirror under `/docs/database/`.

## Outputs

- Archetype models: `/database/archetype_models/*.json`
- Personas: `/database/personas/*.json`
- Manifests: `/database/manifests/*.manifest.json`

