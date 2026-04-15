# Persona Ingestion Pipeline

`ingest_persona.py` ingests an `arch0x.md` source file and normalizes it into the repository persona data model.

## What it does

- Optional adaptive git pre-sync (`pull --ff-only`) only when repo+origin+upstream are available.
- Persona ID derivation from source filename/title/content (`ARCHNN`).
- Tolerant markdown extraction (Chinese/English label aliases and section heading variants).
- Canonical field mapping into existing persona schema fields.
- Manifest upsert with deduplication and stable ordering.
- Docs mirror synchronization (`/docs/database/...`).
- Validation diagnostics for key app-facing fields that are still empty after parsing.

## Usage

Basic ingest:

```bash
python database/scripts/ingest_persona.py database/personas/ARCH05.md
```

Dry-run (no writes):

```bash
python database/scripts/ingest_persona.py database/personas/ARCH05.md --dry-run
```

Optional best-effort pre-sync:

```bash
python database/scripts/ingest_persona.py database/personas/ARCH05.md --sync-git
```

## Validation behavior

After parsing, the CLI reports whether these key fields are still missing/empty:

- `name`
- `subtitle`
- `archetype`
- `root_logic_core`
- `cognitive_filtering_algorithm`
- `physical_execution_constraints`
- `universal_forbidden_actions`
- `dynamic_response_protocols`

If any are missing, the CLI prints a warning for follow-up markdown labeling or alias mapping updates.

## Troubleshooting

- If `name/subtitle/archetype` are empty, verify the first line follows an `ARCH-0X: 中文名 (English Name) | 分类`-style pattern.
- If section fields are empty, verify numbered headings exist (e.g. `1.`, `2.`, `3.` …) and bullet lines use label/value style (`标签: 内容`).
- If protocol extraction is sparse, verify response sections contain either tab-delimited rows or bullet blocks with labeled sub-lines like `核心:` / `动作:` / `逻辑:`.
- If a useful source label is not mapped, add it as an alias in `ingest_persona.py` instead of introducing new schema fields.
