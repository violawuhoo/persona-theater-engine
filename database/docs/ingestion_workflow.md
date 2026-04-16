# Ingestion Workflow

The ingestion CLI extends the existing pipeline instead of introducing a second script.

## Workflow

1. Start with the seed file in `/database/docs/archetypes/` when an archetype must be generated or refreshed.
2. Run `database/scripts/ingest_persona.py` with the persona markdown and, when needed, `--archetype-seed`.
3. The CLI parses seed section blocks, numbered persona sections, and legacy label aliases.
4. The CLI writes schema-shaped JSON into `/database/archetypes/` and `/database/personas/`.
5. The CLI rebuilds manifests from actual files.
6. The CLI validates against `/database/schema/` and checks persona-to-archetype references.
7. The CLI prints diagnostics for missing fields, inferred fields, and mapping confidence.

## Adding a new archetype

1. Author a new seed markdown file under `/database/docs/archetypes/`.
2. Ensure seed sections follow the bracketed section pattern used by `ARCHETYPE_01_seed.md`.
3. Ingest a persona with `--archetype-seed` to generate the archetype JSON and persona JSON together.

## Adding a new persona

1. Add the persona markdown source under `/database/personas/`.
2. Link it to an existing archetype with `--archetype-id`, or regenerate the archetype with `--archetype-seed`.
3. Review CLI diagnostics, especially inferred fields and confidence score.
4. Commit both the source markdown and the generated JSON/manifests once validation passes.
