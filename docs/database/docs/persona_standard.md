# Persona Standard

A persona is the concrete realized instance generated from `/database/personas/ARCHXX.md`.

## Required structure

- `id`
- `archetype_id`
- `name`
- `source_markdown`
- `stable_fields`
- `soft_fields`
- `realized_parameters`
- `generation_contract`

## Role in the workflow

- The persona markdown is the only required authored input.
- The persona JSON is generated from that markdown after the archetype seed and archetype JSON are generated.
- Every persona must reference a valid `archetype_id`.

## Stable vs soft fields

- `stable_fields` stores identity, core directive, stable logic, embodiment rules, taboos, and reference models.
- `soft_fields` stores scene behavior, interaction mappings, response protocols, and signature lines.
- `realized_parameters` stores concrete values. The matching ranges live in the archetype.

## Authoring expectation

The persona markdown should contain enough information for the CLI to recover:

- identity and slogan
- parameter values
- stable worldview
- behavioral style
- scene strategies
- taboos
- repair / recovery logic
