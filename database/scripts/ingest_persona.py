#!/usr/bin/env python3
"""Persona ingestion + normalization pipeline for arch0x.md sources.

Pipeline:
1) adaptive git pre-sync (best effort; no branch switching)
2) parse arch0x.md metadata/content
3) normalize to persona JSON shape used by existing data
4) upsert /database/manifests/personas.manifest.json
5) sync mirror files under /docs/database/
6) adaptive commit + push (best effort; non-blocking)
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUIRED_TOP_LEVEL_KEYS = [
    "id",
    "name",
    "core_directive",
    "root_logic_core",
    "cognitive_filtering_algorithm",
    "physical_execution_constraints",
    "dynamic_response_protocols",
]

TOP_LEVEL_KEY_ORDER = [
    "id",
    "name",
    "subtitle",
    "archetype",
    "core_directive",
    "root_logic_core",
    "cognitive_filtering_algorithm",
    "physical_execution_constraints",
    "universal_forbidden_actions",
    "dynamic_response_protocols",
    "reference_archetypes",
]


@dataclass
class RepoPaths:
    root: Path
    db_personas: Path
    db_manifest: Path
    db_schema: Path
    docs_personas: Path
    docs_manifest: Path
    docs_schema: Path


@dataclass
class GitContext:
    is_repo: bool
    current_branch: str | None
    has_origin: bool
    has_upstream: bool


# ---------------------------- git helpers ----------------------------

def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, check=check)


def git_available(root: Path) -> bool:
    result = run(["git", "rev-parse", "--is-inside-work-tree"], cwd=root, check=False)
    return result.returncode == 0 and result.stdout.strip() == "true"


def detect_git_context(root: Path) -> GitContext:
    if not git_available(root):
        return GitContext(is_repo=False, current_branch=None, has_origin=False, has_upstream=False)

    branch_cp = run(["git", "branch", "--show-current"], cwd=root, check=False)
    current_branch = branch_cp.stdout.strip() or None

    remote_cp = run(["git", "remote"], cwd=root, check=False)
    remotes = {line.strip() for line in remote_cp.stdout.splitlines() if line.strip()}
    has_origin = "origin" in remotes

    upstream_cp = run(["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd=root, check=False)
    has_upstream = upstream_cp.returncode == 0

    return GitContext(
        is_repo=True,
        current_branch=current_branch,
        has_origin=has_origin,
        has_upstream=has_upstream,
    )


def adaptive_presync(root: Path, ctx: GitContext) -> None:
    if not ctx.is_repo:
        print("[git] not a git repository; skipping pre-sync.")
        return
    if not ctx.has_origin:
        print("[git] no origin remote; skipping pull.")
        return
    if not ctx.has_upstream:
        print("[git] no upstream tracking branch; skipping pull.")
        return
    try:
        run(["git", "pull", "--ff-only"], cwd=root)
        print("[git] pull --ff-only completed.")
    except subprocess.CalledProcessError as e:
        print(f"[git] pull failed (non-blocking): {e.stderr.strip() or e.stdout.strip()}")


def has_staged_changes(root: Path) -> bool:
    cp = run(["git", "diff", "--cached", "--name-only"], cwd=root, check=False)
    return bool(cp.stdout.strip())


def has_worktree_changes_in_scope(root: Path, scope_files: list[Path]) -> bool:
    if not scope_files:
        return False
    args = ["git", "status", "--porcelain", "--"] + [str(p) for p in scope_files]
    cp = run(args, cwd=root, check=False)
    return bool(cp.stdout.strip())


def adaptive_commit(root: Path, ctx: GitContext, persona_id: str, scope_files: list[Path]) -> bool:
    if not ctx.is_repo:
        print("[git] not a git repository; skipping commit.")
        return False

    if not has_worktree_changes_in_scope(root, scope_files):
        print("[git] no scoped changes detected; skipping commit.")
        return False

    run(["git", "add", "--"] + [str(p) for p in scope_files], cwd=root)

    if not has_staged_changes(root):
        print("[git] no staged changes after add; skipping commit.")
        return False

    msg = f"feat(persona): add/update {persona_id} from arch0x.md"
    try:
        run(["git", "commit", "-m", msg], cwd=root)
        print(f"[git] commit created: {msg}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[git] commit failed (non-blocking): {e.stderr.strip() or e.stdout.strip()}")
        return False


def adaptive_push(root: Path, ctx: GitContext) -> bool:
    if not ctx.is_repo:
        print("[git] not a git repository; skipping push.")
        return False
    if not ctx.has_origin:
        print("[git] no origin remote; skipping push.")
        return False

    try:
        if ctx.has_upstream:
            run(["git", "push"], cwd=root)
            print("[git] push completed via upstream.")
            return True
        if ctx.current_branch:
            run(["git", "push", "origin", ctx.current_branch], cwd=root)
            print(f"[git] push completed via origin/{ctx.current_branch}.")
            return True
        print("[git] detached HEAD / unknown branch; skipping push.")
        return False
    except subprocess.CalledProcessError as e:
        print(f"[git] push failed (non-blocking): {e.stderr.strip() or e.stdout.strip()}")
        return False


# ---------------------------- parsing ----------------------------

def derive_persona_id(source_path: Path, markdown: str) -> str:
    id_match = re.search(r"^\s*(?:id|ID)\s*[:：]\s*(ARCH\d{2})\s*$", markdown, flags=re.MULTILINE)
    if id_match:
        return id_match.group(1).upper()

    stem_match = re.search(r"arch\s*[-_]?\s*(\d{1,2})", source_path.stem, flags=re.IGNORECASE)
    if stem_match:
        return f"ARCH{int(stem_match.group(1)):02d}"

    generic = re.search(r"(\d{1,2})", source_path.stem)
    if generic:
        return f"ARCH{int(generic.group(1)):02d}"

    raise ValueError("Cannot derive persona_id from source filename/content.")


def parse_frontmatter(md: str) -> dict[str, str]:
    if not md.startswith("---\n"):
        return {}
    end = md.find("\n---\n", 4)
    if end == -1:
        return {}
    block = md[4:end]
    parsed: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip().lower()] = value.strip()
    return parsed


def extract_field(md: str, names: list[str]) -> str:
    for name in names:
        m = re.search(rf"^\s*{re.escape(name)}\s*[:：]\s*(.+)\s*$", md, flags=re.IGNORECASE | re.MULTILINE)
        if m:
            return m.group(1).strip()
    return ""


def first_quote_or_paragraph(md: str) -> str:
    quote = re.search(r"^>\s*(.+)$", md, flags=re.MULTILINE)
    if quote:
        return quote.group(1).strip().strip('"“”')

    for line in md.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        return line[:220]
    return ""


def normalize_from_markdown(persona_id: str, md: str, existing: dict[str, Any] | None) -> dict[str, Any]:
    fm = parse_frontmatter(md)

    name = fm.get("name") or extract_field(md, ["name", "姓名", "名称"]) or (existing or {}).get("name") or persona_id
    subtitle = fm.get("subtitle") or extract_field(md, ["subtitle", "副标题"]) or (existing or {}).get("subtitle") or ""
    archetype = fm.get("archetype") or extract_field(md, ["archetype", "原型"]) or (existing or {}).get("archetype") or ""
    core_directive = (
        fm.get("core_directive")
        or extract_field(md, ["core_directive", "核心指令", "核心"]) 
        or first_quote_or_paragraph(md)
        or (existing or {}).get("core_directive")
        or "[core_directive not provided]"
    )

    base = dict(existing or {})
    base.update(
        {
            "id": persona_id,
            "name": name,
            "core_directive": core_directive,
            "root_logic_core": base.get("root_logic_core") if isinstance(base.get("root_logic_core"), dict) else {},
            "cognitive_filtering_algorithm": base.get("cognitive_filtering_algorithm")
            if isinstance(base.get("cognitive_filtering_algorithm"), dict)
            else {},
            "physical_execution_constraints": base.get("physical_execution_constraints")
            if isinstance(base.get("physical_execution_constraints"), dict)
            else {},
            "dynamic_response_protocols": base.get("dynamic_response_protocols")
            if isinstance(base.get("dynamic_response_protocols"), dict)
            else {},
            "universal_forbidden_actions": base.get("universal_forbidden_actions")
            if isinstance(base.get("universal_forbidden_actions"), list)
            else [],
            "reference_archetypes": base.get("reference_archetypes")
            if isinstance(base.get("reference_archetypes"), list)
            else [],
        }
    )

    if subtitle:
        base["subtitle"] = subtitle
    elif "subtitle" in base and not base["subtitle"]:
        base.pop("subtitle", None)

    if archetype:
        base["archetype"] = archetype
    elif "archetype" in base and not base["archetype"]:
        base.pop("archetype", None)

    missing = [k for k in REQUIRED_TOP_LEVEL_KEYS if k not in base]
    if missing:
        raise ValueError(f"Normalization failed; missing required keys: {missing}")

    ordered: dict[str, Any] = {}
    for key in TOP_LEVEL_KEY_ORDER:
        if key in base:
            ordered[key] = base[key]

    return ordered


# ---------------------------- manifest + sync ----------------------------

def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def update_manifest(manifest_path: Path, persona: dict[str, Any]) -> None:
    manifest = load_json(manifest_path)
    entries = manifest.get("personas", [])

    new_entry = {
        "id": persona["id"],
        "file_base": persona["id"],
        "json_path": f"database/personas/{persona['id']}.json",
        "md_path": f"database/personas/{persona['id']}.md",
        "name": persona.get("name", persona["id"]),
        "status": "active",
    }
    if persona.get("subtitle"):
        new_entry["subtitle"] = persona["subtitle"]
    if persona.get("archetype"):
        new_entry["archetype"] = persona["archetype"]

    deduped = [e for e in entries if str(e.get("id", "")).upper() != persona["id"]]
    deduped.append(new_entry)
    deduped = sorted(deduped, key=lambda e: str(e.get("id", "")))

    manifest["personas"] = deduped
    manifest["total_personas"] = len(deduped)
    manifest["generated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    write_json(manifest_path, manifest)


def sync_docs(paths: RepoPaths, persona_id: str) -> list[Path]:
    db_json = paths.db_personas / f"{persona_id}.json"
    db_md = paths.db_personas / f"{persona_id}.md"

    docs_json = paths.docs_personas / f"{persona_id}.json"
    docs_md = paths.docs_personas / f"{persona_id}.md"

    paths.docs_personas.mkdir(parents=True, exist_ok=True)
    paths.docs_manifest.parent.mkdir(parents=True, exist_ok=True)
    paths.docs_schema.parent.mkdir(parents=True, exist_ok=True)

    shutil.copy2(db_json, docs_json)
    shutil.copy2(db_md, docs_md)
    shutil.copy2(paths.db_manifest, paths.docs_manifest)
    shutil.copy2(paths.db_schema, paths.docs_schema)
    return [docs_json, docs_md, paths.docs_manifest, paths.docs_schema]


# ---------------------------- main ----------------------------

def build_paths(root: Path) -> RepoPaths:
    return RepoPaths(
        root=root,
        db_personas=root / "database/personas",
        db_manifest=root / "database/manifests/personas.manifest.json",
        db_schema=root / "database/schemas/persona.schema.json",
        docs_personas=root / "docs/database/personas",
        docs_manifest=root / "docs/database/manifests/personas.manifest.json",
        docs_schema=root / "docs/database/schemas/persona.schema.json",
    )


def ingest(source_md: Path, paths: RepoPaths, dry_run: bool = False) -> tuple[str, list[Path]]:
    markdown = source_md.read_text(encoding="utf-8")
    persona_id = derive_persona_id(source_md, markdown)

    target_md = paths.db_personas / f"{persona_id}.md"
    target_json = paths.db_personas / f"{persona_id}.json"

    existing_json = load_json(target_json) if target_json.exists() else None
    normalized = normalize_from_markdown(persona_id, markdown, existing_json)

    changed_scope = [
        target_json,
        target_md,
        paths.db_manifest,
    ]

    if dry_run:
        return persona_id, changed_scope + [
            paths.docs_personas / f"{persona_id}.json",
            paths.docs_personas / f"{persona_id}.md",
            paths.docs_manifest,
            paths.docs_schema,
        ]

    paths.db_personas.mkdir(parents=True, exist_ok=True)
    write_json(target_json, normalized)
    target_md.write_text(markdown, encoding="utf-8")

    update_manifest(paths.db_manifest, normalized)
    docs_changed = sync_docs(paths, persona_id)

    return persona_id, changed_scope + docs_changed


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest arch0x.md persona into database + docs mirror.")
    parser.add_argument("source", type=Path, help="Path to source arch0x.md")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--sync-git", action="store_true", help="Best-effort pull --ff-only if git+origin+upstream exist")
    parser.add_argument("--commit", action="store_true", help="Commit generated changes")
    parser.add_argument("--push", action="store_true", help="Push to origin/main (requires --commit)")
    parser.add_argument("--dry-run", action="store_true", help="Parse/normalize without writing files")
    args = parser.parse_args()

    paths = build_paths(args.repo_root.resolve())

    git_ctx = detect_git_context(paths.root)
    if args.sync_git:
        adaptive_presync(paths.root, git_ctx)

    persona_id, scope_files = ingest(args.source.resolve(), paths, dry_run=args.dry_run)

    if args.commit and not args.dry_run:
        adaptive_commit(paths.root, git_ctx, persona_id, scope_files)

    if args.push and not args.dry_run:
        adaptive_push(paths.root, git_ctx)

    print(f"[ingest] completed for {persona_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
