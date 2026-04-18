# Persona Layer Separation

## Persona purpose

`persona json` is downstream of the cleaned archetype layer.

It should separate:

- fixed consumer fields for Browse / Detail
- theater-support fields for Theater/runtime preparation

## Fixed consumer fields

These live in `consumer_fields` and are the canonical source for frontend fixed display:

- display name
- quadrants
- slogan
- core essence
- social essence
- signature line pool
- taboos
- behavior style
- language style
- reaction pattern pool

## Theater-support fields

These live in `theater_support` and should support runtime use without repeating fixed consumer text verbatim:

- logic axes
- scene tactics
- expression modulators
- reaction cues

## Anti-duplication rule

If a semantic payload already has a canonical owner in `consumer_fields`, do not restate the same sentence again in `theater_support`.

Theater-support may:

- compress
- operationalize
- split into axes
- turn pools into cues

But it should not act as a second Browse / Detail layer.
