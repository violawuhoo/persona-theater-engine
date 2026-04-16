# Ingestion Workflow

The database now uses a single-input workflow. The only human-authored file required for a new persona is:

- `/database/personas/ARCHXX.md`

## Canonical pipeline

1. Run `database/scripts/ingest_persona.py` with `ARCHXX.md`.
2. The CLI parses the persona markdown and derives a generalized mother-model seed.
3. The generated seed is written to `/database/docs/archetypes/ARCHETYPE_XX_seed.md`.
4. The CLI generates `/database/archetypes/ARCHETYPE_XX.json` from that seed.
5. The CLI generates `/database/personas/ARCHXX.json` from the original persona markdown.
6. The CLI rebuilds archetype and persona manifests from disk.
7. The CLI validates all generated JSON and emits diagnostics.

## Minimal input standard

The canonical `ARCHXX.md` input should provide enough information to derive:

- archetype identity
- explicit or inferable parameter values
- stable logic
- scene behavior
- taboos / drift blockers
- generation freedom boundaries

The current standard persona source is the tagged protocol format used by `ARCH01.md` and `ARCH02.md`.

## Output locations

- Seed markdown: `/database/docs/archetypes/ARCHETYPE_XX_seed.md`
- Archetype JSON: `/database/archetypes/ARCHETYPE_XX.json`
- Persona JSON: `/database/personas/ARCHXX.json`
- Manifests: `/database/manifests/archetypes.manifest.json`, `/database/manifests/personas.manifest.json`

## Validation behavior

After generation, the CLI reports:

- `missing_fields`
- `inferred_fields`
- `mapping_confidence`

Validation then checks:

- archetype schema
- persona schema
- generation contract references
- persona `archetype_id` linkage
- manifest consistency through rebuild-from-disk

## Adding a new persona

1. Create `/database/personas/ARCHXX.md`.
2. Run:

```bash
python3 database/scripts/ingest_persona.py database/personas/ARCHXX.md
```

3. Review the seed, archetype JSON, persona JSON, manifests, and diagnostics.
4. Commit the markdown source plus all generated database artifacts together.
