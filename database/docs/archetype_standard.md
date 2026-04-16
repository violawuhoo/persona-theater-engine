# Archetype Standard

An archetype is the generalized mother-model extracted from a persona source and stored in two forms:

- semantic seed markdown at `/database/docs/archetypes/ARCHETYPE_XX_seed.md`
- structured JSON at `/database/archetypes/ARCHETYPE_XX.json`

## Canonical seed format

All generated seeds follow `/database/docs/archetypes/archetype_seed_template.md`.

The canonical seed sections are:

- `[IDENTITY]`
- `[SOURCE]`
- `[POSITIONING]`
- `[CORE_TEMPERATURE]`
- `[CORE_TRAITS]`
- `[PARAMETERS]`
- `[CORE_LOGIC]`
- `[BEHAVIORAL_MODEL]`
- `[EXPRESSION_RULES]`
- `[MUST_HAVE]`
- `[MUST_NOT_HAVE]`
- `[FORBIDDEN_DRIFT]`
- `[SPATIAL_ALGORITHMS]`
- `[SOCIAL_LAYERS]`
- `[DETAILS]`
- `[GENERATION_FREEDOM]`
- `[ARCHETYPE_SUMMARY]`

## Seed generation rules

- The seed is derived from `ARCHXX.md`; it is not authored separately in the normal workflow.
- The seed should generalize instance content into a reusable mother-model.
- Dialogues and taboos should be abstracted into stable expression rules and drift boundaries, not copied as a flat instance dump.
- Parameter ranges belong to the archetype even when the persona source provides concrete values.

## Archetype JSON

The machine archetype preserves:

- source linkage
- mother-model temperature and traits
- parameter ranges
- stable logic
- behavioral and expression rules
- spatial / social layers
- details
- generation freedom and generation contract
