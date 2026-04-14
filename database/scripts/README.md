# Persona Ingestion Pipeline

`ingest_persona.py` ingests an `arch0x.md` source file and normalizes it into the repository persona data model.

## Features

- Optional adaptive git pre-sync (`pull --ff-only`) only when repo+origin+upstream are available
- Persona ID derivation from source file/content (`ARCHNN`)
- JSON normalization into existing persona schema shape
- Manifest upsert with deduplication and stable ordering
- Docs mirror synchronization (`/docs/database/...`)
- Optional adaptive commit/push on current branch (non-blocking if git env is missing/incomplete)

## Usage

```bash
python database/scripts/ingest_persona.py <path/to/arch0x.md> --sync-git --commit --push
```

Safe dry-run:

```bash
python database/scripts/ingest_persona.py <path/to/arch0x.md> --dry-run
```
