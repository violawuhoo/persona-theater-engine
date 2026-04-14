# Persona Database Audit Report

Date: 2026-04-14 (UTC)
Scope: `database/schemas/persona.schema.json` and all persona assets under `database/personas/`

## Summary

- Scanned 4 persona JSON files and 4 persona Markdown files.
- All persona JSON documents are syntactically valid JSON.
- All JSON/Markdown base-name pairs are present (`ARCH01`..`ARCH04`).
- Top-level persona JSON structure is consistent across all scanned files.
- **Blocking issue:** `database/schemas/persona.schema.json` is malformed JSON, so strict schema validation cannot be executed until schema syntax is fixed.
- ID/file-name format is internally consistent in JSON (`ARCHNN`), but Markdown headings currently use a hyphenated style (`ARCH-01`), which may cause normalization friction if downstream tooling compares identifiers literally.

## Files Checked

### Schema
- `database/schemas/persona.schema.json`

### Persona JSON
- `database/personas/ARCH01.json`
- `database/personas/ARCH02.json`
- `database/personas/ARCH03.json`
- `database/personas/ARCH04.json`

### Persona Markdown
- `database/personas/ARCH01.md`
- `database/personas/ARCH02.md`
- `database/personas/ARCH03.md`
- `database/personas/ARCH04.md`

## Passed

- Persona JSON syntax check: all 4 files passed.
- Required-field presence check (using required list from schema file text): all 4 files passed.
- JSON `id` format check (`^ARCH[0-9]{2}$`): all 4 files passed.
- JSON ↔ Markdown pair presence check: all pairs present.
- File naming check (`ARCHNN.json` / `ARCHNN.md`): all scanned files passed.
- Top-level key consistency across persona JSON files: consistent.

## Failed

### 1) `database/schemas/persona.schema.json`

**Issue:** Malformed JSON (contains invalid tokenization around line 22 where Markdown-style code fence markers appear).

**Observed parser error:**
`Expecting property name enclosed in double quotes: line 22 column 1 (char 341)`

**Impact:**
- Automated JSON Schema validation cannot be run against persona files.
- Any CI or migration step that expects valid schema JSON will fail.

**Recommended fix:**
- Remove the stray Markdown code fence markers from the schema file and re-validate the schema as strict JSON.
- After syntax repair, run full schema validation (e.g., via ajv/python-jsonschema) for all persona JSON files.

## Warnings

### 1) Cross-format identifier style mismatch (non-blocking)

**Files:**
- `database/personas/ARCH01.md` vs `database/personas/ARCH01.json`
- `database/personas/ARCH02.md` vs `database/personas/ARCH02.json`
- `database/personas/ARCH03.md` vs `database/personas/ARCH03.json`
- `database/personas/ARCH04.md` vs `database/personas/ARCH04.json`

**Issue:**
- JSON `id` values use `ARCH01` style.
- Markdown titles use `ARCH-01` style.

**Impact:**
- Not a schema failure, but can cause normalization/lookup mismatches if tooling compares IDs between `.json` and `.md` literally.

**Recommended fix:**
- Define one canonical ID display policy and normalize adapters/parsers accordingly.
- If literal matching is required, align Markdown title IDs with JSON IDs (or vice versa) in a migration step.

## Exact Issue Per File

- `database/schemas/persona.schema.json`
  - **Issue:** Invalid JSON syntax; cannot parse.
  - **Fix:** Remove non-JSON tokens (code-fence markers), then validate with a JSON parser.

- `database/personas/ARCH01.json`
  - **Issue:** None (validated checks passed).
  - **Fix:** No immediate change required.

- `database/personas/ARCH02.json`
  - **Issue:** None (validated checks passed).
  - **Fix:** No immediate change required.

- `database/personas/ARCH03.json`
  - **Issue:** None (validated checks passed).
  - **Fix:** No immediate change required.

- `database/personas/ARCH04.json`
  - **Issue:** None (validated checks passed).
  - **Fix:** No immediate change required.

- `database/personas/ARCH01.md`
  - **Issue:** Uses hyphenated identifier (`ARCH-01`) in heading; differs from JSON canonical `ARCH01`.
  - **Fix:** Normalize identifier style policy or transform during ingestion.

- `database/personas/ARCH02.md`
  - **Issue:** Uses hyphenated identifier (`ARCH-02`) in heading; differs from JSON canonical `ARCH02`.
  - **Fix:** Normalize identifier style policy or transform during ingestion.

- `database/personas/ARCH03.md`
  - **Issue:** Uses hyphenated identifier (`ARCH-03`) in heading; differs from JSON canonical `ARCH03`.
  - **Fix:** Normalize identifier style policy or transform during ingestion.

- `database/personas/ARCH04.md`
  - **Issue:** Uses hyphenated identifier (`ARCH-04`) in heading; differs from JSON canonical `ARCH04`.
  - **Fix:** Normalize identifier style policy or transform during ingestion.

## Note on "Richer than Schema" Cases

- No confirmed persona-data-vs-schema richness mismatch could be assessed because schema parsing failed before semantic validation.
- Once schema JSON syntax is fixed, re-run validation to determine whether real persona data is richer than the declared schema.
- Current schema text includes `"additionalProperties": true`, which suggests richer real data would be accepted unless future tightening is intended.
