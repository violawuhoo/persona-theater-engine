# Persona Standard

A persona is a concrete instance of an archetype.

## Required structure

- `id`
- `archetype_id`
- `name`
- `source_markdown`
- `stable_fields`
- `soft_fields`
- `realized_parameters`
- `generation_contract`

## Stable vs soft fields

- `stable_fields` stores identity, premise, core logic, cognitive filters, embodiment rules, taboos, and reference models.
- `soft_fields` stores scene behavior, response protocols, interaction matrices, and signature-line material.
- `realized_parameters` stores concrete values that sit inside the parent archetype parameter ranges.

## Persona constraints

- A persona cannot exist without a valid archetype reference.
- Stable fields should remain instance-defining and hard to drift.
- Soft fields can expand in wording, detail, and staging as long as the generation contract is honored.
- Persona-specific taboos should align with, not contradict, the parent archetype forbidden drift.
