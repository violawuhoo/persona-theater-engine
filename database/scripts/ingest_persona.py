#!/usr/bin/env python3
"""Persona ingestion + normalization pipeline for arch0x.md sources.

Pipeline:
1) adaptive git pre-sync (best effort; no branch switching)
2) parse arch0x.md metadata/content with tolerant heading/label aliases
3) normalize to persona JSON shape used by existing data
4) upsert /database/manifests/personas.manifest.json
5) sync mirror files under /docs/database/
6) emit validation and missing-field diagnostics
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

ROOT_LOGIC_ALIASES = {
    "social_essence": ["社交本质论", "social essence", "social_essence"],
    "self_positioning": ["自我定位", "self positioning", "self_positioning"],
    "power_source": ["权力来源", "power source", "power_source"],
}

COGNITIVE_ALIASES = {
    "noise_processing": ["悲观筛选", "伪证自动检索", "噪声处理", "noise", "noise_processing"],
    "wound_protection": ["伤口防御", "防御", "wound protection"],
    "value_accumulation": ["负向价值积压", "动机预判", "价值积压"],
    "de_layering": ["逻辑剥茧", "de-layering", "剥茧"],
}

PHYSICAL_ALIASES = {
    "posture": ["重心", "体态", "physical collapse", "防御性体态", "重心后撤"],
    "gaze_protocol": ["视线协议", "注视", "gaze"],
    "breathing_protocol": ["呼吸", "心率", "breathing"],
    "voice_and_language": ["声音", "词汇", "语调"],
    "aesthetic_signal": ["审美", "外表", "废墟美学"],
    "latency_buffer": ["延迟", "滞后", "响应延时"],
}

PROTOCOL_CLASSIFICATION_ALIASES = ["核心", "认知过滤", "逻辑判定", "classification", "判定为"]
PROTOCOL_PHYSICAL_ALIASES = ["动作", "物理动作", "做法", "行为表现", "physical"]
PROTOCOL_VERBAL_ALIASES = ["破局语言", "逻辑语言", "verbal", "台词"]
PROTOCOL_LOGIC_ALIASES = ["逻辑", "博弈逻辑", "效果", "结果", "logic"]


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

    return GitContext(True, current_branch, has_origin, has_upstream)


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


# ---------------------------- parsing helpers ----------------------------

def normalize_line(line: str) -> str:
    return line.replace("\u3000", " ").replace("：", ":").replace("（", "(").replace("）", ")").rstrip()


def normalize_key(key: str) -> str:
    key = normalize_line(key).lower()
    key = re.sub(r"[^\w\u4e00-\u9fff]+", "", key)
    return key


def strip_bullet_prefix(line: str) -> str:
    return re.sub(r"^\s*[•●\-*·o]\s*", "", line).strip()


def alias_hit(raw_key: str, aliases: list[str]) -> bool:
    normalized = normalize_key(raw_key)
    for alias in aliases:
        if normalize_key(alias) in normalized or normalized in normalize_key(alias):
            return True
    return False


def coalesce_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def derive_persona_id(source_path: Path, markdown: str) -> str:
    id_match = re.search(r"^\s*(?:id|ID)\s*[:：]\s*(ARCH\d{2})\s*$", markdown, flags=re.MULTILINE)
    if id_match:
        return id_match.group(1).upper()

    title_match = re.search(r"ARCH\s*[-_ ]?\s*(\d{1,2})", markdown[:300], flags=re.IGNORECASE)
    if title_match:
        return f"ARCH{int(title_match.group(1)):02d}"

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
    quote = re.search(r"^\s*(?:核心|core|core_directive)\s*[:：]\s*['\"“”]?(.+?)['\"“”]?\s*$", md, flags=re.IGNORECASE | re.MULTILINE)
    if quote:
        return quote.group(1).strip()

    block = re.search(r"^[^\n]*\n\s*核心\s*[:：]\s*(.+)$", md, flags=re.MULTILINE)
    if block:
        return block.group(1).strip().strip('"“”')

    quote2 = re.search(r"^>\s*(.+)$", md, flags=re.MULTILINE)
    if quote2:
        return quote2.group(1).strip().strip('"“”')

    for line in md.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        return line[:320]
    return ""


def parse_title_metadata(md: str) -> dict[str, str]:
    for raw in md.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^ARCH\s*[-_ ]?\s*\d{1,2}\s*[:：]\s*(.+)$", line, flags=re.IGNORECASE)
        if not m:
            continue
        remainder = m.group(1).strip()
        left, right = (remainder.split("|", 1) + [""])[:2]
        left = left.strip()
        right = right.strip()

        en = ""
        zh = left
        if "(" in left and ")" in left:
            left_m = re.match(r"^(.*?)\s*\((.*?)\)\s*$", left)
            if left_m:
                zh = left_m.group(1).strip()
                en = left_m.group(2).strip()

        result = {}
        if zh:
            result["name"] = zh
        if en:
            result["subtitle"] = en
        if right:
            result["archetype"] = right
        return result
    return {}


def split_numbered_sections(md: str) -> dict[str, str]:
    sections: dict[str, str] = {}
    current_key = ""
    buf: list[str] = []

    for raw in md.splitlines():
        line = raw.rstrip("\n")
        normalized = normalize_line(line)
        # Treat only top-level numeric headings like `1. 标题`.
        # Avoid nested numbered list items like `1.\t子项`.
        heading = re.match(r"^\s*(\d{1,2})\.\s+(.+?)\s*$", normalized)
        if heading:
            next_key = heading.group(1)
            if next_key in sections:
                # Duplicate numeric labels can appear inside section bodies (e.g. nested lists).
                # Keep the earliest top-level section and treat duplicates as plain text.
                if current_key:
                    buf.append(line)
                continue
            if current_key:
                sections[current_key] = "\n".join(buf).strip()
            current_key = next_key
            buf = [heading.group(2)]
            continue
        if current_key:
            buf.append(line)

    if current_key:
        sections[current_key] = "\n".join(buf).strip()
    return sections


def parse_key_value_lines(text: str) -> list[tuple[str, str]]:
    kvs: list[tuple[str, str]] = []
    current_key = ""
    current_value: list[str] = []

    def flush() -> None:
        nonlocal current_key, current_value
        if current_key:
            kvs.append((current_key, coalesce_text(" ".join(current_value))))
        current_key = ""
        current_value = []

    for raw in text.splitlines():
        line = normalize_line(raw)
        stripped = strip_bullet_prefix(line)
        if not stripped:
            continue
        if ":" in stripped:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()
            if key:
                flush()
                current_key = key
                current_value = [value] if value else []
                continue
        if current_key:
            current_value.append(stripped)

    flush()
    return kvs


def map_aliases(kvs: list[tuple[str, str]], alias_map: dict[str, list[str]]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    extra: list[str] = []
    for k, v in kvs:
        hit_key = ""
        for canonical, aliases in alias_map.items():
            if alias_hit(k, aliases + [canonical]):
                hit_key = canonical
                break
        if hit_key:
            mapped[hit_key] = v
        else:
            extra.append(f"{k}: {v}")
    if extra:
        mapped["notes"] = "\n".join(extra)
    return mapped


def parse_forbidden(text: str, existing: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    for raw in text.splitlines():
        line = strip_bullet_prefix(normalize_line(raw))
        if not line:
            continue
        if ":" in line:
            action, rule = line.split(":", 1)
            rules.append({"action": action.strip(), "rule": rule.strip()})
    if rules:
        return rules
    return list(existing or [])


def slugify(label: str) -> str:
    txt = normalize_key(label)
    if txt.startswith("应对"):
        txt = txt[2:]
    return txt[:48] if txt else "protocol"


def parse_protocol_groups(text: str) -> dict[str, dict[str, str]]:
    groups: dict[str, dict[str, str]] = {}
    current = ""

    for raw in text.splitlines():
        line = normalize_line(raw).strip()
        if not line:
            continue

        # tab-delimited table row
        if "\t" in line and line.count("\t") >= 2 and "判定" in line:
            cols = [c.strip() for c in line.split("\t") if c.strip()]
            if len(cols) >= 3:
                key = slugify(cols[0])
                groups[key] = {
                    "signal": cols[0],
                    "classification": cols[1],
                    "physical_output": cols[2],
                    "logic": cols[2],
                }
            continue

        main = re.match(r"^[•●\-*]?\s*(?:[A-Z]\.)?\s*(应对[^:：(]+|[^:：]+\([^)]*\))\s*[:：]\s*(.*)$", line)
        if main:
            title = main.group(1).strip()
            desc = main.group(2).strip()
            current = slugify(title)
            groups[current] = {"signal": title}
            if desc:
                groups[current]["classification"] = desc
            continue

        if current:
            parsed = strip_bullet_prefix(line)
            if ":" in parsed:
                k, v = parsed.split(":", 1)
                k = k.strip()
                v = v.strip()
                if any(alias_hit(k, [a]) for a in PROTOCOL_CLASSIFICATION_ALIASES):
                    groups[current]["classification"] = v
                elif any(alias_hit(k, [a]) for a in PROTOCOL_PHYSICAL_ALIASES):
                    groups[current]["physical_output"] = v
                elif any(alias_hit(k, [a]) for a in PROTOCOL_VERBAL_ALIASES):
                    groups[current]["verbal_output"] = v
                elif any(alias_hit(k, [a]) for a in PROTOCOL_LOGIC_ALIASES):
                    groups[current]["logic"] = v
                else:
                    groups[current][k] = v
            else:
                groups[current]["logic"] = coalesce_text(groups[current].get("logic", "") + " " + parsed)

    return groups


def parse_reference_archetypes(text: str, existing: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    current_name = ""
    current_principle: list[str] = []

    def flush() -> None:
        nonlocal current_name, current_principle
        if current_name:
            refs.append({"name": current_name, "principle": coalesce_text(" ".join(current_principle))})
        current_name = ""
        current_principle = []

    for raw in text.splitlines():
        line = strip_bullet_prefix(normalize_line(raw))
        if not line:
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            if alias_hit(key, ["核心原型", "历史参考", "文学参考", "name"]):
                flush()
                current_name = value.strip() if value.strip() else key.strip()
            elif alias_hit(key, ["逻辑", "应用", "原则", "principle"]):
                current_principle.append(value.strip())
            else:
                current_principle.append(line)
        else:
            current_principle.append(line)
    flush()

    if refs:
        return refs
    return list(existing or [])


def diagnostics(persona: dict[str, Any]) -> list[str]:
    missing: list[str] = []
    if not persona.get("name"):
        missing.append("name")
    if not persona.get("subtitle"):
        missing.append("subtitle")
    if not persona.get("archetype"):
        missing.append("archetype")
    if not persona.get("root_logic_core"):
        missing.append("root_logic_core")
    if not persona.get("cognitive_filtering_algorithm"):
        missing.append("cognitive_filtering_algorithm")
    if not persona.get("physical_execution_constraints"):
        missing.append("physical_execution_constraints")
    if not persona.get("universal_forbidden_actions"):
        missing.append("universal_forbidden_actions")
    if not persona.get("dynamic_response_protocols"):
        missing.append("dynamic_response_protocols")
    return missing


def normalize_from_markdown(persona_id: str, md: str, existing: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    fm = parse_frontmatter(md)
    title_meta = parse_title_metadata(md)
    sections = split_numbered_sections(md)

    name = (
        fm.get("name")
        or extract_field(md, ["name", "姓名", "名称"])
        or title_meta.get("name")
        or (existing or {}).get("name")
        or persona_id
    )
    subtitle = (
        fm.get("subtitle")
        or extract_field(md, ["subtitle", "英文名", "english name"])
        or title_meta.get("subtitle")
        or (existing or {}).get("subtitle")
        or ""
    )
    archetype = (
        fm.get("archetype")
        or extract_field(md, ["archetype", "原型", "分类", "category", "classification"])
        or title_meta.get("archetype")
        or (existing or {}).get("archetype")
        or ""
    )
    core_directive = (
        fm.get("core_directive")
        or extract_field(md, ["core_directive", "核心指令", "核心", "core"])
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
            "cognitive_filtering_algorithm": base.get("cognitive_filtering_algorithm") if isinstance(base.get("cognitive_filtering_algorithm"), dict) else {},
            "physical_execution_constraints": base.get("physical_execution_constraints") if isinstance(base.get("physical_execution_constraints"), dict) else {},
            "dynamic_response_protocols": base.get("dynamic_response_protocols") if isinstance(base.get("dynamic_response_protocols"), dict) else {},
            "universal_forbidden_actions": base.get("universal_forbidden_actions") if isinstance(base.get("universal_forbidden_actions"), list) else [],
            "reference_archetypes": base.get("reference_archetypes") if isinstance(base.get("reference_archetypes"), list) else [],
        }
    )

    if subtitle:
        base["subtitle"] = subtitle
    else:
        base.pop("subtitle", None)

    if archetype:
        base["archetype"] = archetype
    else:
        base.pop("archetype", None)

    root_section = sections.get("1", "")
    cognitive_section = sections.get("2", "")
    physical_section = sections.get("3", "")
    forbidden_section = sections.get("4", "")
    scene_section = sections.get("5", "")
    realtime_section = sections.get("6", "")
    negative_section = sections.get("7", "")
    positive_section = sections.get("8", "")
    extreme_section = sections.get("9", "")
    refs_section = sections.get("10", "")

    if root_section:
        base["root_logic_core"].update(map_aliases(parse_key_value_lines(root_section), ROOT_LOGIC_ALIASES))

    if cognitive_section:
        base["cognitive_filtering_algorithm"].update(map_aliases(parse_key_value_lines(cognitive_section), COGNITIVE_ALIASES))

    if physical_section:
        base["physical_execution_constraints"].update(map_aliases(parse_key_value_lines(physical_section), PHYSICAL_ALIASES))

    if forbidden_section:
        base["universal_forbidden_actions"] = parse_forbidden(forbidden_section, base.get("universal_forbidden_actions"))

    protocols: dict[str, dict[str, str]] = {}
    for segment in [scene_section, realtime_section, negative_section, positive_section, extreme_section]:
        if segment:
            protocols.update(parse_protocol_groups(segment))
    if protocols:
        base["dynamic_response_protocols"] = protocols

    if refs_section:
        base["reference_archetypes"] = parse_reference_archetypes(refs_section, base.get("reference_archetypes"))

    missing = [k for k in REQUIRED_TOP_LEVEL_KEYS if k not in base]
    if missing:
        raise ValueError(f"Normalization failed; missing required keys: {missing}")

    ordered: dict[str, Any] = {}
    for key in TOP_LEVEL_KEY_ORDER:
        if key in base:
            ordered[key] = base[key]

    return ordered, diagnostics(ordered)


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


def ingest(source_md: Path, paths: RepoPaths, dry_run: bool = False) -> tuple[str, list[Path], list[str]]:
    markdown = source_md.read_text(encoding="utf-8")
    persona_id = derive_persona_id(source_md, markdown)

    target_md = paths.db_personas / f"{persona_id}.md"
    target_json = paths.db_personas / f"{persona_id}.json"

    existing_json = load_json(target_json) if target_json.exists() else None
    normalized, missing = normalize_from_markdown(persona_id, markdown, existing_json)

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
        ], missing

    paths.db_personas.mkdir(parents=True, exist_ok=True)
    write_json(target_json, normalized)
    target_md.write_text(markdown, encoding="utf-8")

    update_manifest(paths.db_manifest, normalized)
    docs_changed = sync_docs(paths, persona_id)

    return persona_id, changed_scope + docs_changed, missing


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest arch0x.md persona into database + docs mirror.")
    parser.add_argument("source", type=Path, help="Path to source arch0x.md")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--sync-git", action="store_true", help="Best-effort pull --ff-only if git+origin+upstream exist")
    parser.add_argument("--dry-run", action="store_true", help="Parse/normalize without writing files")
    args = parser.parse_args()

    paths = build_paths(args.repo_root.resolve())

    git_ctx = detect_git_context(paths.root)
    if args.sync_git:
        adaptive_presync(paths.root, git_ctx)

    persona_id, _, missing = ingest(args.source.resolve(), paths, dry_run=args.dry_run)

    if missing:
        print(f"[validate] {persona_id} still missing/empty fields: {', '.join(missing)}")
    else:
        print(f"[validate] {persona_id} all key extraction fields populated.")

    print(f"[ingest] completed for {persona_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
