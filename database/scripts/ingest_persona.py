#!/usr/bin/env python3
"""Seed-driven archetype/persona ingestion pipeline.

The pipeline keeps the database layer authoritative and schema-validated:
1) optionally sync git state
2) parse strict archetype seed markdown
3) generate archetype/persona JSON artifacts
4) validate payloads against the database schemas
5) rebuild manifests from actual database files
6) emit diagnostics for missing fields, inferred fields, and mapping confidence
"""

from __future__ import annotations

import argparse
import filecmp
import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


ARCHETYPE_ALIAS_MAP = {
    "高冷建模脸": "ARCHETYPE_01",
    "the cgi cold": "ARCHETYPE_01",
    "cgi cold": "ARCHETYPE_01",
    "cgi-cold": "ARCHETYPE_01",
    "秩序垄断者": "ARCHETYPE_01",
    "仪式主权者": "ARCHETYPE_01",
}

PERSONA_TITLE_ALIASES = {
    "ARCH01": "The Beheaded Queen",
}

ROOT_LOGIC_ALIASES = {
    "social_essence": ["社交本质论", "social essence"],
    "self_positioning": ["自我定位", "self positioning"],
    "power_source": ["权力来源", "power source"],
}

COGNITIVE_ALIASES = {
    "noise_filtering": ["噪音过滤", "noise filtering"],
    "downward_compatibility": ["向下兼容", "downward compatibility"],
    "information_granularity": ["信息颗粒度", "information granularity"],
}

PERSONA_INSTANCE_SECTIONS: Dict[str, Tuple[str, ...]] = {
    "Identity": ("persona_id", "archetype_id", "name", "version"),
    "Instance Premise": ("instance_premise", "role_in_interaction"),
    "Expression": ("voice", "behavioral_signature"),
    "Boundaries": ("forbidden_behavior",),
    "Relationship": ("relationship_dynamic", "emotional_tendency"),
    "Interaction Pattern": ("trigger_response",),
    "Optional": ("sample_lines", "notes"),
}

PERSONA_INSTANCE_REQUIRED_FIELDS = (
    "persona_id",
    "archetype_id",
    "name",
    "version",
    "instance_premise",
    "role_in_interaction",
    "voice",
    "behavioral_signature",
    "forbidden_behavior",
)

PERSONA_INSTANCE_SOFT_WARNING_FIELDS = (
    "relationship_dynamic",
    "emotional_tendency",
    "trigger_response",
)

ARCHETYPE_SEED_SECTIONS: Dict[str, Tuple[str, ...]] = {
    "Identity": ("archetype_id", "name", "version"),
    "Quadrants": ("quadrants",),
    "Core Drive": ("core_drive",),
    "Interaction Logic": ("interaction_logic",),
    "Emotional Logic": ("emotional_logic",),
    "Power Logic": ("power_logic",),
    "Forbidden Drift": ("forbidden_drift",),
    "Expression Anchors": ("voice_anchor", "behavior_anchor"),
    "Consumer Assets": ("slogan", "signature_lines_pool", "reaction_patterns_pool"),
    "Optional": ("notes",),
}

ARCHETYPE_SEED_HARD_REQUIRED_FIELDS = (
    "archetype_id",
    "name",
    "version",
    "quadrants",
    "core_drive",
    "interaction_logic",
    "emotional_logic",
    "power_logic",
    "forbidden_drift",
    "slogan",
    "signature_lines_pool",
    "reaction_patterns_pool",
)

ARCHETYPE_SEED_SOFT_WARNING_FIELDS = (
    "voice_anchor",
    "behavior_anchor",
)


@dataclass
class RepoPaths:
    root: Path
    archetypes_seed_dir: Path
    archetype_models_dir: Path
    personas_dir: Path
    manifests_dir: Path
    schema_dir: Path
    docs_dir: Path
    docs_archetypes_dir: Path
    docs_database_dir: Path

    @property
    def archetype_manifest(self) -> Path:
        return self.manifests_dir / "archetypes.manifest.json"

    @property
    def persona_manifest(self) -> Path:
        return self.manifests_dir / "personas.manifest.json"

    @property
    def seed_template(self) -> Path:
        return self.docs_archetypes_dir / "archetype_seed_template.md"


@dataclass
class GitContext:
    is_repo: bool
    current_branch: Optional[str]
    has_origin: bool
    has_upstream: bool


@dataclass
class DiagnosticReport:
    missing_fields: List[str] = field(default_factory=list)
    inferred_fields: List[str] = field(default_factory=list)
    mapping_confidence: float = 1.0


def run(cmd: List[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True, check=check)


def git_available(root: Path) -> bool:
    result = run(["git", "rev-parse", "--is-inside-work-tree"], cwd=root, check=False)
    return result.returncode == 0 and result.stdout.strip() == "true"


def detect_git_context(root: Path) -> GitContext:
    if not git_available(root):
        return GitContext(is_repo=False, current_branch=None, has_origin=False, has_upstream=False)

    current_branch = run(["git", "branch", "--show-current"], cwd=root, check=False).stdout.strip() or None
    remotes = {
        line.strip()
        for line in run(["git", "remote"], cwd=root, check=False).stdout.splitlines()
        if line.strip()
    }
    has_origin = "origin" in remotes
    has_upstream = run(
        ["git", "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        cwd=root,
        check=False,
    ).returncode == 0
    return GitContext(is_repo=True, current_branch=current_branch, has_origin=has_origin, has_upstream=has_upstream)


def adaptive_presync(root: Path, ctx: GitContext) -> None:
    if not ctx.is_repo:
        print("[git] not a git repository; skipping pre-sync.")
        return
    if not ctx.has_origin or not ctx.has_upstream:
        print("[git] no tracked origin branch; skipping pull.")
        return
    try:
        run(["git", "pull", "--ff-only"], cwd=root)
        print("[git] pull --ff-only completed.")
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip()
        print(f"[git] pull failed (non-blocking): {detail}")


def build_paths(root: Path) -> RepoPaths:
    return RepoPaths(
        root=root,
        archetypes_seed_dir=root / "database" / "archetypes",
        archetype_models_dir=root / "database" / "archetype_models",
        personas_dir=root / "database" / "personas",
        manifests_dir=root / "database" / "manifests",
        schema_dir=root / "database" / "schema",
        docs_dir=root / "database" / "docs",
        docs_archetypes_dir=root / "database" / "docs" / "archetypes",
        docs_database_dir=root / "docs" / "database",
    )


def normalize_line(line: str) -> str:
    return line.replace("\u3000", " ").replace("：", ":").replace("（", "(").replace("）", ")").rstrip()


def normalize_key(value: str) -> str:
    cleaned = normalize_line(value).lower()
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", cleaned)


def strip_bullet_prefix(line: str) -> str:
    return re.sub(r"^\s*[•●\-*·o]\s*", "", line).strip()


def coalesce_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def sanitize_extracted_text(value: str) -> str:
    cleaned = value.replace("---", " ").replace("**", " ")
    cleaned = re.sub(r"(^|\s)--(\s|$)", " ", cleaned)
    return coalesce_text(cleaned)


def deep_clean_strings(value: Any) -> Any:
    if isinstance(value, str):
        return sanitize_extracted_text(value)
    if isinstance(value, list):
        cleaned = [deep_clean_strings(item) for item in value]
        return [item for item in cleaned if item not in ("", "--")]
    if isinstance(value, dict):
        return {key: deep_clean_strings(item) for key, item in value.items()}
    return value


def looks_like_persona_instance_contract(markdown: str) -> bool:
    return "## Identity" in markdown and "persona_id:" in markdown and "archetype_id:" in markdown


def parse_persona_instance_contract(markdown: str) -> Dict[str, Any]:
    allowed_sections = list(PERSONA_INSTANCE_SECTIONS.keys())
    allowed_fields = {
        field_name
        for fields in PERSONA_INSTANCE_SECTIONS.values()
        for field_name in fields
    }
    required_by_section = {
        section: {
            field_name
            for field_name in fields
            if field_name not in ("sample_lines", "notes")
        }
        for section, fields in PERSONA_INSTANCE_SECTIONS.items()
    }

    errors: List[str] = []
    warnings: List[str] = []
    values: Dict[str, Any] = {}
    section_fields_seen: Dict[str, List[str]] = {section: [] for section in allowed_sections}
    seen_sections: List[str] = []
    current_section: Optional[str] = None
    current_key: Optional[str] = None

    lines = markdown.splitlines()
    for line_no, raw in enumerate(lines, start=1):
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("## "):
            section_name = stripped[3:].strip()
            if section_name not in PERSONA_INSTANCE_SECTIONS:
                errors.append(f"line {line_no}: unexpected section header `{section_name}`")
                current_section = None
                current_key = None
                continue
            if section_name in seen_sections:
                errors.append(f"line {line_no}: duplicate section header `## {section_name}`")
            current_section = section_name
            seen_sections.append(section_name)
            current_key = None
            continue

        if current_section is None:
            errors.append(f"line {line_no}: content must be inside one of: {', '.join(allowed_sections)}")
            continue

        key_match = re.match(r"^([a-z_]+)\s*:\s*(.*)$", stripped)
        if key_match:
            key = key_match.group(1)
            value = key_match.group(2).strip()
            if key not in allowed_fields:
                errors.append(f"line {line_no}: unexpected field key `{key}`")
                current_key = None
                continue
            if key not in PERSONA_INSTANCE_SECTIONS[current_section]:
                errors.append(f"line {line_no}: field `{key}` is not allowed in section `{current_section}`")
                current_key = None
                continue
            if key in values:
                errors.append(f"line {line_no}: duplicate field `{key}`")
                current_key = key
                continue

            if value:
                values[key] = sanitize_extracted_text(value)
            else:
                values[key] = []
            section_fields_seen[current_section].append(key)
            current_key = key
            continue

        bullet_match = re.match(r"^\s*[-*]\s+(.+)$", line)
        if bullet_match:
            if not current_key:
                errors.append(f"line {line_no}: bullet list item has no active field key")
                continue
            current_value = values.get(current_key)
            if isinstance(current_value, str) and current_value:
                errors.append(f"line {line_no}: cannot append bullet list to single-line field `{current_key}`")
                continue
            if not isinstance(current_value, list):
                current_value = []
            current_value.append(sanitize_extracted_text(bullet_match.group(1)))
            values[current_key] = current_value
            continue

        if current_key:
            current_value = values.get(current_key)
            if isinstance(current_value, list):
                current_value.append(sanitize_extracted_text(stripped))
                values[current_key] = current_value
            elif isinstance(current_value, str) and current_value:
                errors.append(f"line {line_no}: multi-line text is not allowed for field `{current_key}`")
            else:
                values[current_key] = sanitize_extracted_text(stripped)
            continue

        errors.append(f"line {line_no}: unrecognized content `{stripped}`")

    for section_name, fields in required_by_section.items():
        missing_section_fields = sorted(fields - set(section_fields_seen[section_name]))
        for field_name in missing_section_fields:
            errors.append(f"missing field `{field_name}` in section `{section_name}`")
    for section_name in allowed_sections:
        if section_name not in seen_sections:
            errors.append(f"missing required section header `## {section_name}`")

    for field_name in PERSONA_INSTANCE_REQUIRED_FIELDS:
        if field_name not in values:
            errors.append(f"missing required field `{field_name}`")
            continue
        field_value = values[field_name]
        if isinstance(field_value, list):
            if not [item for item in field_value if item]:
                errors.append(f"required field `{field_name}` cannot be empty")
        elif not str(field_value).strip():
            errors.append(f"required field `{field_name}` cannot be empty")

    for field_name in PERSONA_INSTANCE_SOFT_WARNING_FIELDS:
        if field_name not in values:
            warnings.append(f"missing optional field `{field_name}`")
            continue
        value = values[field_name]
        if isinstance(value, list):
            if not [item for item in value if item]:
                warnings.append(f"optional field `{field_name}` is empty")
        elif not str(value).strip():
            warnings.append(f"optional field `{field_name}` is empty")

    prohibited_key_patterns = [
        r"\bdyn_param\b",
        r"^[EORB]\s*:",
    ]
    archetype_logic_patterns = [
        r"\bmotive\b",
        r"\bphilosophy\b",
        r"\bcore_logic\b",
        r"\bpower_logic\b",
    ]
    for line_no, raw in enumerate(lines, start=1):
        stripped = raw.strip()
        if any(re.search(pattern, stripped, flags=re.IGNORECASE) for pattern in prohibited_key_patterns):
            errors.append(f"line {line_no}: archetype parameter field detected; persona input cannot redefine archetype dyn params")
        if any(re.search(pattern, stripped, flags=re.IGNORECASE) for pattern in archetype_logic_patterns):
            warnings.append(f"line {line_no}: archetype logic-like content detected (`{stripped}`)")

    if errors:
        raise ValueError("Persona instance contract validation failed:\n- " + "\n- ".join(errors))
    if warnings:
        for warning in warnings:
            print(f"[warning:persona-contract] {warning}")

    normalized: Dict[str, Any] = {}
    for key, value in values.items():
        if isinstance(value, list):
            normalized[key] = [coalesce_text(item) for item in value if coalesce_text(item)]
        else:
            normalized[key] = coalesce_text(value)
    return normalized


def parse_strict_markdown_contract(
    markdown: str,
    sections: Dict[str, Tuple[str, ...]],
    hard_required_fields: Tuple[str, ...],
    soft_warning_fields: Tuple[str, ...],
    warning_label: str,
) -> Dict[str, Any]:
    allowed_sections = list(sections.keys())
    allowed_fields = {field_name for group in sections.values() for field_name in group}
    required_by_section = {
        section_name: {
            field_name
            for field_name in field_names
            if field_name in hard_required_fields
        }
        for section_name, field_names in sections.items()
    }

    errors: List[str] = []
    warnings: List[str] = []
    values: Dict[str, Any] = {}
    section_fields_seen: Dict[str, List[str]] = {section_name: [] for section_name in allowed_sections}
    seen_sections: List[str] = []
    current_section: Optional[str] = None
    current_key: Optional[str] = None

    for line_no, raw in enumerate(markdown.splitlines(), start=1):
        line = raw.rstrip()
        stripped = line.strip()
        if not stripped:
            continue

        if stripped.startswith("## "):
            section_name = stripped[3:].strip()
            if section_name not in sections:
                errors.append(f"line {line_no}: unexpected section header `{section_name}`")
                current_section = None
                current_key = None
                continue
            if section_name in seen_sections:
                errors.append(f"line {line_no}: duplicate section header `## {section_name}`")
            seen_sections.append(section_name)
            current_section = section_name
            current_key = None
            continue

        if current_section is None:
            errors.append(f"line {line_no}: content must be inside one of: {', '.join(allowed_sections)}")
            continue

        key_match = re.match(r"^([a-z_]+)\s*:\s*(.*)$", stripped)
        if key_match:
            key = key_match.group(1)
            value = key_match.group(2).strip()
            if key not in allowed_fields:
                errors.append(f"line {line_no}: unexpected field key `{key}`")
                current_key = None
                continue
            if key not in sections[current_section]:
                errors.append(f"line {line_no}: field `{key}` is not allowed in section `{current_section}`")
                current_key = None
                continue
            if key in values:
                errors.append(f"line {line_no}: duplicate field `{key}`")
                current_key = None
                continue
            values[key] = sanitize_extracted_text(value) if value else []
            section_fields_seen[current_section].append(key)
            current_key = key
            continue

        bullet_match = re.match(r"^\s*[-*]\s+(.+)$", line)
        if bullet_match:
            if not current_key:
                errors.append(f"line {line_no}: bullet list item has no active field key")
                continue
            cursor = values.get(current_key)
            if isinstance(cursor, str) and cursor:
                errors.append(f"line {line_no}: cannot append bullet list to single-line field `{current_key}`")
                continue
            if not isinstance(cursor, list):
                cursor = []
            cursor.append(sanitize_extracted_text(bullet_match.group(1)))
            values[current_key] = cursor
            continue

        if current_key:
            cursor = values.get(current_key)
            if isinstance(cursor, list):
                cursor.append(sanitize_extracted_text(stripped))
                values[current_key] = cursor
            elif isinstance(cursor, str) and cursor:
                errors.append(f"line {line_no}: multi-line text is not allowed for field `{current_key}`")
            else:
                values[current_key] = sanitize_extracted_text(stripped)
            continue

        errors.append(f"line {line_no}: unrecognized content `{stripped}`")

    for section_name in allowed_sections:
        if section_name not in seen_sections:
            errors.append(f"missing required section header `## {section_name}`")
    for section_name, section_required in required_by_section.items():
        for field_name in sorted(section_required - set(section_fields_seen[section_name])):
            errors.append(f"missing field `{field_name}` in section `{section_name}`")

    for field_name in hard_required_fields:
        if field_name not in values:
            errors.append(f"missing required field `{field_name}`")
            continue
        value = values[field_name]
        if isinstance(value, list):
            if not [item for item in value if item]:
                errors.append(f"required field `{field_name}` cannot be empty")
        elif not str(value).strip():
            errors.append(f"required field `{field_name}` cannot be empty")

    for field_name in soft_warning_fields:
        if field_name not in values:
            warnings.append(f"missing optional field `{field_name}`")
            continue
        value = values[field_name]
        if isinstance(value, list):
            if not [item for item in value if item]:
                warnings.append(f"optional field `{field_name}` is empty")
        elif not str(value).strip():
            warnings.append(f"optional field `{field_name}` is empty")

    if errors:
        raise ValueError("Strict markdown contract validation failed:\n- " + "\n- ".join(errors))
    for warning in warnings:
        print(f"[warning:{warning_label}] {warning}")

    normalized: Dict[str, Any] = {}
    for key, value in values.items():
        if isinstance(value, list):
            normalized[key] = [coalesce_text(item) for item in value if coalesce_text(item)]
        else:
            normalized[key] = coalesce_text(value)
    return normalized


def parse_archetype_seed_contract(markdown: str) -> Dict[str, Any]:
    payload = parse_strict_markdown_contract(
        markdown=markdown,
        sections=ARCHETYPE_SEED_SECTIONS,
        hard_required_fields=ARCHETYPE_SEED_HARD_REQUIRED_FIELDS,
        soft_warning_fields=ARCHETYPE_SEED_SOFT_WARNING_FIELDS,
        warning_label="seed-contract",
    )
    for field in (
        "core_drive",
        "interaction_logic",
        "emotional_logic",
        "power_logic",
        "voice_anchor",
        "behavior_anchor",
        "name",
        "slogan",
    ):
        if isinstance(payload.get(field), list):
            payload[field] = " ".join(payload[field]).strip()
    payload["quadrants"] = parse_seed_quadrants(payload["quadrants"])

    archetype_id = payload["archetype_id"]
    if not re.match(r"^ARCHETYPE_[0-9]{2,}$", archetype_id):
        raise ValueError(f"Seed field `archetype_id` must match ^ARCHETYPE_[0-9]{{2,}}$, got `{archetype_id}`")
    return payload


def parse_seed_quadrants(value: Any) -> Dict[str, float]:
    text = " ".join(value) if isinstance(value, list) else str(value)
    matches = re.findall(r"\b([EORB])\s*[:=]\s*([+-]?\d+(?:\.\d+)?)", text)
    quadrants: Dict[str, float] = {}
    for key, raw_value in matches:
        parsed = round(float(raw_value), 2)
        quadrants[key] = max(-1.0, min(1.0, parsed))
    expected = {"E", "O", "R", "B"}
    missing = expected - set(quadrants)
    if missing:
        raise ValueError(f"Seed field `quadrants` must define E/O/R/B explicitly, missing: {', '.join(sorted(missing))}")
    return {key: quadrants[key] for key in ["E", "O", "R", "B"]}


def normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [coalesce_text(str(item)) for item in value if coalesce_text(str(item))]
    if isinstance(value, str):
        cleaned = coalesce_text(value)
        return [cleaned] if cleaned else []
    return []


def first_clause(text: str) -> str:
    clauses = _split_clauses(text)
    return clauses[0] if clauses else coalesce_text(text)


def compact_anchor(text: str, limit: int = 2) -> str:
    clauses = _split_clauses(text)
    if not clauses:
        return coalesce_text(text)
    return " / ".join(clauses[:limit])


def parse_reaction_cues(patterns: List[str]) -> List[Dict[str, str]]:
    cues: List[Dict[str, str]] = []
    for raw in patterns:
        text = coalesce_text(raw)
        if not text:
            continue
        match = re.match(r"(.+?)时[，,]?\s*(.+)$", text)
        if match:
            trigger = sanitize_extracted_text(match.group(1))
            guidance = sanitize_extracted_text(match.group(2))
        else:
            trigger = "general_scene"
            guidance = text
        cues.append({"trigger": trigger, "guidance": guidance})
    return cues


def build_theater_support_from_seed(seed: Dict[str, Any]) -> Dict[str, Any]:
    social_stance = build_social_stance(seed["interaction_logic"], seed["power_logic"])
    interaction_focus = first_clause(seed["interaction_logic"])
    emotional_guard = first_clause(seed["emotional_logic"])
    power_move = first_clause(seed["power_logic"])
    reaction_cues = parse_reaction_cues(normalize_string_list(seed["reaction_patterns_pool"]))
    return {
        "logic_axes": {
            "interaction_focus": interaction_focus,
            "emotional_guard": emotional_guard,
            "power_move": power_move,
        },
        "scene_tactics": {
            "small_scale": f"小场景围绕{social_stance}维持距离，再用{emotional_guard}控制进入节奏。",
            "large_scale": f"大场景优先执行{interaction_focus}，并用{power_move}收束场域方向。",
        },
        "expression_modulators": {
            "delivery_mode": compact_anchor(seed.get("voice_anchor", "")),
            "physicality": compact_anchor(seed.get("behavior_anchor", "")),
        },
        "reaction_cues": reaction_cues,
    }


def build_theater_support_from_runtime_sources(
    interaction_logic: str,
    social_stance: str,
    emotional_logic: str,
    power_logic: str,
    voice_anchor: str,
    behavior_anchor: str,
    reaction_patterns: List[str],
) -> Dict[str, Any]:
    interaction_focus = first_clause(interaction_logic)
    emotional_guard = first_clause(emotional_logic)
    power_move = first_clause(power_logic)
    return {
        "logic_axes": {
            "interaction_focus": interaction_focus,
            "emotional_guard": emotional_guard,
            "power_move": power_move,
        },
        "scene_tactics": {
            "small_scale": f"小场景围绕{social_stance}维持距离，再用{emotional_guard}控制进入节奏。",
            "large_scale": f"大场景优先执行{interaction_focus}，并用{power_move}收束场域方向。",
        },
        "expression_modulators": {
            "delivery_mode": compact_anchor(voice_anchor),
            "physicality": compact_anchor(behavior_anchor),
        },
        "reaction_cues": parse_reaction_cues(reaction_patterns),
    }


def build_social_stance(interaction_logic: str, power_logic: str) -> str:
    interaction_focus = first_clause(interaction_logic)
    power_move = first_clause(power_logic)
    return f"以{interaction_focus}定义社交距离，并通过{power_move}维持位置与节奏。"


def persona_id_from_archetype_id(archetype_id: str) -> str:
    match = re.match(r"^ARCHETYPE_([0-9]{2,})$", archetype_id)
    if not match:
        raise ValueError(f"Cannot derive persona id from archetype id `{archetype_id}`")
    return f"ARCH{int(match.group(1)):02d}"


def deterministic_parameter_space(seed: Dict[str, Any]) -> Dict[str, Dict[str, float]]:
    def _as_text(value: Any) -> str:
        if isinstance(value, list):
            return " | ".join(str(item) for item in value)
        return str(value)

    material = "|".join(
        [
            _as_text(seed["archetype_id"]),
            _as_text(seed["name"]),
            _as_text(seed["core_drive"]),
            _as_text(seed["interaction_logic"]),
            _as_text(seed["emotional_logic"]),
            _as_text(seed["power_logic"]),
        ]
    )
    digest = hashlib.sha256(material.encode("utf-8")).hexdigest()
    channels = ["E", "O", "R", "B"]
    space: Dict[str, Dict[str, float]] = {}
    for index, channel in enumerate(channels):
        pair = digest[index * 2 : index * 2 + 2]
        raw = int(pair, 16) / 255.0
        center = round(-0.8 + (1.6 * raw), 2)
        spread = 0.2
        minimum = max(-1.0, round(center - spread, 2))
        maximum = min(1.0, round(center + spread, 2))
        space[channel] = {"min": minimum, "max": maximum}
    return space


def markdown_to_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    if raw.lstrip().startswith("{\\rtf1"):
        converted = run(["textutil", "-convert", "txt", "-stdout", str(path)], cwd=path.parent, check=True)
        return converted.stdout.strip()
    return raw


def extract_first_tag(markdown: str, tags: List[str]) -> str:
    for tag in tags:
        value = extract_tag(markdown, tag)
        if value:
            return value
    return ""


def strip_known_prefix(value: str, prefixes: List[str]) -> str:
    cleaned = sanitize_extracted_text(value)
    for prefix in prefixes:
        normalized_prefix = sanitize_extracted_text(prefix)
        if cleaned.startswith(normalized_prefix):
            return sanitize_extracted_text(cleaned[len(normalized_prefix):])
    return cleaned


def kebab_case(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return normalized or "archetype"


def persona_id_to_archetype_id(persona_id: str) -> str:
    return persona_id.replace("ARCH", "ARCHETYPE_")


def derive_seed_path(paths: RepoPaths, persona_id: str) -> Path:
    return paths.archetypes_seed_dir / f"{persona_id_to_archetype_id(persona_id)}_seed.md"


def build_parameter_range(value: float) -> Tuple[float, float]:
    delta = 0.2 if abs(value) < 0.9 else 0.15
    lower = max(-1.0, round(value - delta, 1))
    upper = min(1.0, round(value + delta, 1))
    return lower, upper


def parameter_temperature_descriptors(values: Dict[str, float]) -> List[str]:
    descriptors: List[str] = []
    if values.get("E", 0.0) >= 0.6:
        descriptors.append("高热外放")
    elif values.get("E", 0.0) <= -0.6:
        descriptors.append("低噪冷感")
    if values.get("O", 0.0) >= 0.6:
        descriptors.append("秩序驱动")
    elif values.get("O", 0.0) <= -0.6:
        descriptors.append("即兴驱动")
    if values.get("R", 0.0) >= 0.6:
        descriptors.append("高仪式感")
    elif values.get("R", 0.0) <= -0.6:
        descriptors.append("反结构活性")
    if values.get("B", 0.0) >= 0.6:
        descriptors.append("高边界")
    elif values.get("B", 0.0) <= -0.6:
        descriptors.append("低边界渗透")
    return descriptors or ["中性温度"]


def pattern_from_dialogue(dialogue: str) -> str:
    match = re.match(r"^【(.+?)】[:：]\s*(.+)$", dialogue)
    if not match:
        return "以稳定母体语气表达，不依赖固定句子。"
    label = match.group(1)
    if "初次见面" in label:
        return "初次见面时先主动定义气氛和关系位置，抢先建立场域主导。"
    if "拒绝" in label:
        return "拒绝时不做冗长解释，而是用风格化否决重新掌握选择权。"
    if "对抗" in label or "遭遇" in label:
        return "面对对抗时优先命名对方状态或重构冲突节奏，而不是被动接招。"
    if "好感" in label:
        return "接收好感时顺势承认吸引力，但保留解释权和定义权。"
    if "结束" in label or "任务" in label:
        return "结束互动时由自己宣布退场，并留下可延续的气场余韵。"
    return f"{label}场景下保持统一表达姿态，由自己定义互动节奏。"


def infer_symbolic_objects(sensory_profile: str) -> str:
    for pattern in [r"随身携带(.+?)(?:。|；|$)", r"随身带着(.+?)(?:。|；|$)"]:
        match = re.search(pattern, sensory_profile)
        if match:
            return sanitize_extracted_text(match.group(1))
    return "由感官标签延伸出的象征性物件"


def parse_tagged_forbid_example(value: str) -> List[str]:
    cleaned = sanitize_extracted_text(value)
    entries: List[str] = []
    first = re.match(r"(禁止[^：:]+)[:：](.+)", cleaned)
    if first:
        entries.append(sanitize_extracted_text(f"{first.group(1)}：{first.group(2)}"))
    tail = re.split(r"[。；]", cleaned, maxsplit=1)[-1] if re.search(r"[。；]", cleaned) else cleaned
    for extra in re.findall(r"(禁止[^、，。；:：]+)", tail):
        normalized_extra = sanitize_extracted_text(extra)
        if entries and normalized_extra in entries[0]:
            continue
        entries.append(normalized_extra)
    return entries


def extract_tagged_source(markdown: str, source_path: Path) -> Dict[str, Any]:
    title = parse_tagged_title(markdown)
    persona_id = title.get("id") or derive_persona_id(source_path, markdown)
    dialogues = []
    for idx in range(1, 6):
        dialogues.append(extract_first_tag(markdown, [f"dialogue_{idx:02d}", f"line_{idx:02d}"]))
    dialogues = [line for line in dialogues if line]
    taboos = parse_tagged_taboos(markdown)
    if not taboos:
        taboos = parse_tagged_forbid_example(extract_first_tag(markdown, ["forbid_example", "forbid_rules"]))

    return {
        "persona_id": persona_id,
        "name_cn": title.get("name") or persona_id,
        "name_en": title.get("subtitle") or PERSONA_TITLE_ALIASES.get(persona_id, persona_id),
        "core_slogan": strip_known_prefix(extract_first_tag(markdown, ["slogan", "core_slogan"]), ["核心 Slogan:", "核心 Slogan：", "Slogan:", "Slogan："]),
        "psych_suggest": strip_known_prefix(extract_first_tag(markdown, ["hint_psych", "psych_suggest"]), ["心理暗示:", "心理暗示："]),
        "module_title": extract_first_tag(markdown, ["module_01_title", "module_title"]),
        "parameters": parse_tagged_params(markdown),
        "references": parse_tagged_references(markdown),
        "logic": {
            "core_motivation": strip_known_prefix(extract_first_tag(markdown, ["item_motive", "logic_motive"]), ["核心动机:", "核心动机："]),
            "power_logic": strip_known_prefix(extract_first_tag(markdown, ["item_power", "logic_power"]), ["权力观:", "权力观："]),
            "social_logic": strip_known_prefix(extract_first_tag(markdown, ["item_social_view", "logic_social"]), ["社交观:", "社交观："]),
            "emotion_logic": strip_known_prefix(extract_first_tag(markdown, ["item_emotion_view", "logic_emotion"]), ["情感观:", "情感观："]),
            "security_anchor": strip_known_prefix(extract_first_tag(markdown, ["item_safety", "logic_safe"]), ["安全感:", "安全感："]),
            "blind_spot": strip_known_prefix(extract_first_tag(markdown, ["item_cognitive_blind", "logic_blind"]), ["认知盲区:", "认知盲区："]),
            "conflict_logic": strip_known_prefix(extract_first_tag(markdown, ["item_conflict_response", "logic_conflict"]), ["冲突响应:", "冲突响应："]),
            "repair_logic": strip_known_prefix(extract_first_tag(markdown, ["item_mental_repair", "logic_repair"]), ["心灵修复:", "心灵修复："]),
        },
        "behavioral_model": {
            "visual_style": strip_known_prefix(extract_first_tag(markdown, ["action_vision", "sop_vision"]), ["视觉指令:", "视觉指令："]),
            "physical_style": strip_known_prefix(extract_first_tag(markdown, ["action_physical", "sop_physical"]), ["物理指令:", "物理指令："]),
            "verbal_style": strip_known_prefix(extract_first_tag(markdown, ["action_language", "sop_language"]), ["语言指令:", "语言指令："]),
        },
        "expression_rules": {
            "dialogues": dialogues,
            "taboos": taboos,
        },
        "spatial_algorithms": {
            "crowded": strip_known_prefix(extract_first_tag(markdown, ["space_crowded"]), ["人多场合 (Crowded):", "人多场合 (Crowded)："]),
            "one_on_one": strip_known_prefix(extract_first_tag(markdown, ["space_one2one", "space_alone"]), ["人少场合 (One-on-One):", "人少场合 (One-on-One)："]),
        },
        "social_layers": {
            "outer_layer": strip_known_prefix(extract_first_tag(markdown, ["social_outer"]), ["外层逻辑 (Strangers):", "外层逻辑 (Strangers)："]),
            "inner_layer": strip_known_prefix(extract_first_tag(markdown, ["social_inner"]), ["内里逻辑 (Intimates):", "内里逻辑 (Intimates)："]),
        },
        "details": {
            "sensory_profile": strip_known_prefix(extract_first_tag(markdown, ["sense_label", "sense_tag"]), ["感官标签:", "感官标签："]),
            "breakdown_repair": strip_known_prefix(extract_first_tag(markdown, ["error_repair", "roll_repair"]), ["翻车补救:", "翻车补救："]),
        },
    }


def is_tagged_persona(markdown: str) -> bool:
    return "<root>" in markdown and "<module_" in markdown


def extract_tag(markdown: str, tag: str) -> str:
    match = re.search(rf"<{tag}\b[^>]*>\s*(.*?)\s*</{tag}>", markdown, flags=re.S)
    if not match:
        return ""
    return sanitize_extracted_text(match.group(1))


def parse_tagged_title(markdown: str) -> Dict[str, str]:
    title = extract_first_tag(markdown, ["title", "arch_code"])
    if not title:
        return {}
    match = re.match(r"ARCH\s*[-_ ]?\s*(\d{1,2})\s*[:：]\s*(.*?)\s*\|\s*(.+)$", title, flags=re.I)
    if not match:
        return {}
    return {
        "id": f"ARCH{int(match.group(1)):02d}",
        "name": sanitize_extracted_text(match.group(2)),
        "subtitle": sanitize_extracted_text(match.group(3)),
        "classification": "",
    }


def parse_tagged_params(markdown: str) -> Dict[str, Dict[str, Any]]:
    raw = extract_first_tag(markdown, ["param_array", "dyn_param"])
    body_match = re.search(r"\{(.*?)\}", raw)
    if not body_match:
        return {}
    values: Dict[str, Dict[str, Any]] = {}
    for part in body_match.group(1).split(","):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        key = sanitize_extracted_text(key)
        numeric = value.strip().replace("+", "")
        try:
            parsed_value = float(numeric)
        except ValueError:
            continue
        values[key] = {
            "value": parsed_value,
            "confidence": 0.98,
            "evidence": f"Explicit value declared in canonical markdown param_array for {key}.",
        }
    return values


def parse_tagged_references(markdown: str) -> List[Dict[str, str]]:
    raw = extract_first_tag(markdown, ["reference_char", "ref_character"])
    if re.search(r"[:：]", raw):
        raw = re.split(r"[:：]", raw, maxsplit=1)[1]
    refs = []
    for part in re.split(r"[、,，]", raw):
        name = sanitize_extracted_text(part)
        if name:
            refs.append({"name": name, "principle": "Canonical reference character named in persona source."})
    return refs


def parse_tagged_dialogues(markdown: str) -> List[str]:
    lines = []
    for index in range(1, 6):
        value = extract_first_tag(markdown, [f"dialogue_{index:02d}", f"line_{index:02d}"])
        if value:
            lines.append(value)
    return lines


def parse_tagged_taboos(markdown: str) -> List[str]:
    taboos: List[str] = []
    for index in range(1, 6):
        value = extract_first_tag(markdown, [f"forbid_{index:02d}"])
        if not value:
            continue
        taboos.append(sanitize_extracted_text(value))
    return taboos


def parse_tagged_persona(markdown: str, source_path: Path, archetype_id: str, report: DiagnosticReport) -> Dict[str, Any]:
    source = extract_tagged_source(markdown, source_path)
    persona_id = source["persona_id"]
    primary = source["name_cn"]
    subtitle = source["name_en"]
    slogan = source["core_slogan"]
    hint_psych = source["psych_suggest"]
    source_classification = source["module_title"] or "canonical_tagged_markdown"

    scene_behavior = {
        "small_scale": {
            "label": "人少场合 (One-on-One)",
            "strategy": source["spatial_algorithms"]["one_on_one"],
            "actions": source["behavioral_model"]["visual_style"],
            "logic": source["logic"]["social_logic"],
        },
        "large_scale": {
            "label": "人多场合 (Crowded)",
            "strategy": source["spatial_algorithms"]["crowded"],
            "actions": source["behavioral_model"]["physical_style"],
            "logic": source["logic"]["conflict_logic"],
        },
    }

    interaction_matrix = [
        {
            "input_signal": "遭遇攻击",
            "interpretation": source["logic"]["blind_spot"],
            "response_adjustment": source["expression_rules"]["dialogues"][2] if len(source["expression_rules"]["dialogues"]) > 2 else "",
        },
        {
            "input_signal": "接收好感",
            "interpretation": source["logic"]["conflict_logic"],
            "response_adjustment": source["expression_rules"]["dialogues"][3] if len(source["expression_rules"]["dialogues"]) > 3 else "",
        },
        {
            "input_signal": "对方不回应",
            "interpretation": source["expression_rules"]["taboos"][1] if len(source["expression_rules"]["taboos"]) > 1 else "",
            "response_adjustment": "保持静默直到对方重新进入你的秩序。",
        },
    ]

    negative_feedback = {
        "conflict_response": {
            "label": "冲突响应",
            "cognitive_filter": source["logic"]["blind_spot"],
            "response_actions": source["logic"]["conflict_logic"],
            "breaker_line": source["expression_rules"]["dialogues"][2] if len(source["expression_rules"]["dialogues"]) > 2 else "",
            "logic": source["logic"]["power_logic"],
        }
    }
    positive_feedback = {
        "affection_acceptance": {
            "label": "接收好感",
            "cognitive_filter": "对赞赏先做客观性评估，再决定是否接受。",
            "response_actions": source["logic"]["conflict_logic"],
            "breaker_line": source["expression_rules"]["dialogues"][3] if len(source["expression_rules"]["dialogues"]) > 3 else "",
            "logic": source["logic"]["emotion_logic"],
        }
    }
    extreme_pressure = {
        "label": "系统维护",
        "cognitive_filter": source["details"]["breakdown_repair"],
        "response_actions": source["logic"]["repair_logic"],
        "breaker_line": source["expression_rules"]["dialogues"][4] if len(source["expression_rules"]["dialogues"]) > 4 else "",
        "logic": "当系统偏离低熵状态时，立即切断交互并执行维护。",
    }

    signature_lines = source["expression_rules"]["dialogues"]
    realized_parameters = source["parameters"]

    persona = {
        "id": persona_id,
        "archetype_id": archetype_id,
        "name": {
            "primary": primary,
            "en": subtitle,
            "source_classification": source_classification,
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "consumer_fields": {
            "display_name": primary,
            "quadrants": {key: payload["value"] for key, payload in realized_parameters.items()},
            "slogan": slogan,
            "core_essence": source["logic"]["core_motivation"],
            "social_essence": build_social_stance(source["logic"]["social_logic"], source["logic"]["power_logic"]),
            "signature_lines_pool": signature_lines,
            "taboos": source["expression_rules"]["taboos"],
            "behavior_style": source["behavioral_model"]["physical_style"],
            "language_style": source["behavioral_model"]["verbal_style"],
            "reaction_patterns_pool": [
                source["logic"]["conflict_logic"],
                source["logic"]["repair_logic"],
            ],
        },
        "theater_support": build_theater_support_from_runtime_sources(
            source["logic"]["social_logic"],
            build_social_stance(source["logic"]["social_logic"], source["logic"]["power_logic"]),
            source["logic"]["emotion_logic"],
            source["logic"]["power_logic"],
            source["behavioral_model"]["verbal_style"],
            source["behavioral_model"]["physical_style"],
            [source["logic"]["conflict_logic"], source["logic"]["repair_logic"]],
        ),
        "realized_parameters": realized_parameters,
        "generation_contract": make_persona_generation_contract(source["expression_rules"]["taboos"]),
    }

    if not realized_parameters:
        report.inferred_fields.extend(["realized_parameters.E", "realized_parameters.O", "realized_parameters.R", "realized_parameters.B"])

    for required_path in [
        "id",
        "archetype_id",
        "name.primary",
        "consumer_fields.display_name",
        "consumer_fields.core_essence",
        "theater_support.logic_axes.interaction_focus",
    ]:
        if not _dig(persona, required_path):
            report.missing_fields.append(required_path)
    report.mapping_confidence = max(0.0, 1 - (0.06 * len(report.missing_fields)) - (0.02 * len(report.inferred_fields)))
    return deep_clean_strings(persona)


def synthesize_seed_markdown(markdown: str, source_path: Path, template_text: str, report: DiagnosticReport) -> Tuple[str, str]:
    if not is_tagged_persona(markdown):
        raise ValueError("Single-input seed generation currently requires canonical tagged persona markdown.")

    source = extract_tagged_source(markdown, source_path)
    persona_id = source["persona_id"]
    archetype_id = persona_id_to_archetype_id(persona_id)
    param_values = {key: payload["value"] for key, payload in source["parameters"].items()}
    if not param_values:
        report.inferred_fields.extend(["seed.parameters.E", "seed.parameters.O", "seed.parameters.R", "seed.parameters.B"])
        param_values = {"E": 0.0, "O": 0.0, "R": 0.0, "B": 0.0}

    descriptors = parameter_temperature_descriptors(param_values)
    thesis = f"一种以{'、'.join(descriptors[:3])}为核心的人格母体。"
    positioning = (
        f"其以{source['logic']['power_logic'] or '独特的权力逻辑'}为支配方式，"
        f"并以{source['logic']['social_logic'] or '清晰的社交算法'}塑造场域影响，而不是依赖单次实例表现。"
    )
    core_temperature = " / ".join(descriptors)

    core_traits = descriptors[:]
    if source["logic"]["conflict_logic"]:
        core_traits.append("强反应场域控制")
    if source["behavioral_model"]["verbal_style"]:
        core_traits.append("稳定表达风格")
    core_traits = core_traits[:5]

    parameter_space_lines = []
    for key in ["E", "O", "R", "B"]:
        lower, upper = build_parameter_range(param_values.get(key, 0.0))
        parameter_space_lines.append(f"{key}: [{lower:.1f}, {upper:.1f}]")

    canonical_expression_mode = (
        f"以{source['behavioral_model']['verbal_style'] or '稳定语气'}为基础，"
        "通过固定的人设张力和命名权来统一表达，而不是依赖逐句复用。"
    )
    signature_patterns = source["expression_rules"]["dialogues"] or [
        "初次见面时先建立气氛主导。",
        "拒绝时不进入解释模式。",
        "对抗时先重构对方状态。",
        "接收好感时保留定义权。",
        "结束互动时由自己宣布退场。",
    ]
    signature_patterns = [pattern_from_dialogue(line) for line in signature_patterns[:5]]

    taboo_actions = list(source["expression_rules"]["taboos"])
    must_have = core_traits[:3] + [
        "稳定的母体逻辑",
        "清晰的空间策略",
    ]
    must_not_have = taboo_actions[:3] if taboo_actions else ["失去母体边界", "失去表达风格", "失去结构稳定性"]
    forbidden_drift = taboo_actions[:3]

    details = source["details"]
    summary = (
        f"该 archetype 允许在台词、感官细节和场景发挥上变化，"
        f"但本质上始终保持{'、'.join(descriptors[:3])}的母体结构。"
    )

    template_marker = "# ARCHETYPE_XX"
    if template_marker not in template_text:
        report.inferred_fields.append("seed.template_structure")

    seed_markdown = "\n".join(
        [
            f"# {archetype_id} - {source['name_cn']} ({source['name_en']})",
            "",
            "## [IDENTITY]",
            f"id: {archetype_id}",
            f"slug: {kebab_case(source['name_en'])}",
            f"name_cn: {source['name_cn']}",
            f"name_en: {source['name_en']}",
            "",
            "## [SOURCE]",
            f"derived_from: {persona_id}",
            "source_template: ARCH persona.md",
            "",
            "## [POSITIONING]",
            thesis,
            positioning,
            "",
            "## [CORE_TEMPERATURE]",
            core_temperature,
            "",
            "## [CORE_TRAITS]",
            *[f"- {item}" for item in core_traits],
            "",
            "## [PARAMETERS]",
            *parameter_space_lines,
            "",
            "## [CORE_LOGIC]",
            "",
            "### core_motivation",
            source["logic"]["core_motivation"],
            "",
            "### power_logic",
            source["logic"]["power_logic"],
            "",
            "### social_logic",
            source["logic"]["social_logic"],
            "",
            "### emotion_logic",
            source["logic"]["emotion_logic"],
            "",
            "### security_anchor",
            source["logic"]["security_anchor"],
            "",
            "### blind_spot",
            source["logic"]["blind_spot"],
            "",
            "### conflict_logic",
            source["logic"]["conflict_logic"],
            "",
            "### repair_logic",
            source["logic"]["repair_logic"],
            "",
            "## [BEHAVIORAL_MODEL]",
            "",
            "### visual_style",
            source["behavioral_model"]["visual_style"],
            "",
            "### physical_style",
            source["behavioral_model"]["physical_style"],
            "",
            "### verbal_style",
            source["behavioral_model"]["verbal_style"],
            "",
            "## [EXPRESSION_RULES]",
            "",
            "### canonical_expression_mode",
            canonical_expression_mode,
            "",
            "### signature_line_patterns",
            *[f"- {item}" for item in signature_patterns],
            "",
            "## [MUST_HAVE]",
            *[f"- {item}" for item in must_have],
            "",
            "## [MUST_NOT_HAVE]",
            *[f"- {item}" for item in must_not_have],
            "",
            "## [FORBIDDEN_DRIFT]",
            *[f"- {item}" for item in forbidden_drift],
            "",
            "## [SPATIAL_ALGORITHMS]",
            "",
            "### crowded",
            source["spatial_algorithms"]["crowded"],
            "",
            "### one_on_one",
            source["spatial_algorithms"]["one_on_one"],
            "",
            "## [SOCIAL_LAYERS]",
            "",
            "### outer_layer",
            source["social_layers"]["outer_layer"],
            "",
            "### inner_layer",
            source["social_layers"]["inner_layer"],
            "",
            "## [DETAILS]",
            "",
            "### sensory_profile",
            details["sensory_profile"],
            "",
            "### symbolic_objects",
            infer_symbolic_objects(details["sensory_profile"]),
            "",
            "### breakdown_repair",
            details["breakdown_repair"],
            "",
            "## [GENERATION_FREEDOM]",
            "",
            "### allowed_to_vary",
            "- 台词具体措辞",
            "- 感官与道具细节",
            "- 场景化发挥方式",
            "- 互动节奏的具体编排",
            "",
            "### must_remain_stable",
            *[f"- {item}" for item in core_traits[:4]],
            "- 核心权力逻辑",
            "- 核心社交算法",
            "",
            "### forbidden_drift",
            *[f"- {item}" for item in forbidden_drift],
            "",
            "## [ARCHETYPE_SUMMARY]",
            summary,
            "",
        ]
    )
    return seed_markdown, archetype_id


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def parse_seed_sections(text: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    matches = list(re.finditer(r"^## \[([A-Z_]+)\]\s*$", text, flags=re.MULTILINE))
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        sections[match.group(1)] = text[start:end].strip()
    return sections


def parse_seed_key_values(text: str) -> Dict[str, str]:
    parsed: Dict[str, str] = {}
    for raw in text.splitlines():
        line = normalize_line(raw).strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip()] = value.strip()
    return parsed


def parse_seed_subsections(text: str) -> Dict[str, str]:
    parsed: Dict[str, str] = {}
    current_key: Optional[str] = None
    current_lines: List[str] = []

    def flush() -> None:
        nonlocal current_key, current_lines
        if current_key:
            parsed[current_key] = sanitize_extracted_text(" ".join(current_lines))
        current_key = None
        current_lines = []

    for raw in text.splitlines():
        line = raw.rstrip()
        header = re.match(r"^###\s+([a-zA-Z_]+)\s*$", line.strip())
        if header:
            flush()
            current_key = header.group(1).strip()
            continue
        if current_key and line.strip():
            current_lines.append(strip_bullet_prefix(line.strip()))
    flush()
    return parsed


def parse_seed_list(text: str) -> List[str]:
    items: List[str] = []
    for raw in text.splitlines():
        stripped = strip_bullet_prefix(normalize_line(raw))
        if stripped and not re.fullmatch(r"-{2,}", stripped):
            items.append(sanitize_extracted_text(stripped))
    return items


def parse_seed_subsection_lists(text: str) -> Dict[str, List[str]]:
    blocks: Dict[str, List[str]] = {}
    current_key: Optional[str] = None
    current_items: List[str] = []

    def flush() -> None:
        nonlocal current_key, current_items
        if current_key:
            blocks[current_key] = [item for item in current_items if item]
        current_key = None
        current_items = []

    for raw in text.splitlines():
        line = normalize_line(raw).strip()
        header = re.match(r"^###\s+([a-zA-Z_]+)\s*$", line)
        if header:
            flush()
            current_key = header.group(1).strip()
            continue
        item = strip_bullet_prefix(line)
        if current_key and item and not re.fullmatch(r"-{2,}", item):
            current_items.append(sanitize_extracted_text(item))
    flush()
    return blocks


def parse_parameter_space(text: str) -> Dict[str, Dict[str, float]]:
    ranges: Dict[str, Dict[str, float]] = {}
    for raw in text.splitlines():
        line = normalize_line(raw).strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        match = re.search(r"\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]", value)
        if not match:
            continue
        ranges[key.strip()] = {"min": float(match.group(1)), "max": float(match.group(2))}
    return ranges


def extract_positioning(text: str) -> Dict[str, str]:
    lines = [coalesce_text(line) for line in text.splitlines() if line.strip() and line.strip() != "---"]
    thesis = lines[0] if lines else ""
    mechanism = lines[1] if len(lines) > 1 else ""
    return {"thesis": thesis, "mechanism": mechanism}


def make_generation_contract_for_archetype(seed: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "locked_fields": [
            {"field": "model_core", "reason": "Model core is the canonical owner of the mother-model worldview and behavioral logic."},
            {"field": "quadrants", "reason": "Quadrants must remain traceable to authored seed input."},
            {"field": "style_profile", "reason": "Style profile owns stable language and behavior summaries."},
            {"field": "assets", "reason": "Assets own the authored slogan and semi-fixed content pools."},
            {"field": "constraints.forbidden_drift", "reason": "Forbidden drift must stay identical to the authored seed prohibitions."},
        ],
        "support_fields": [
            {"field": "parameter_space", "reason": "Parameter envelopes remain a compiled support layer around the authored quadrants."},
            {"field": "summary", "reason": "Summary remains a compact description but is not the canonical owner of any semantic concept."},
        ],
        "expansion_zones": [
            {"zone": "persona shaping", "guidance": "Persona instances may reshape the mother-model into consumer and theater-support layers without changing model_core."},
            {"zone": "runtime micro-variation", "guidance": "Runtime may vary scene usage without changing assets, style_profile, or constraints."},
        ],
        "forbidden_drift": list(seed["constraints"]["forbidden_drift"]),
    }


def build_archetype(seed_text: str, seed_path: Path, report: DiagnosticReport) -> Dict[str, Any]:
    sections = parse_seed_sections(seed_text)
    identity = parse_seed_key_values(sections.get("IDENTITY", ""))
    source_profile = parse_seed_key_values(sections.get("SOURCE", ""))
    positioning = extract_positioning(sections.get("POSITIONING", ""))
    behavioral_model = parse_seed_subsections(sections.get("BEHAVIORAL_MODEL", ""))
    expression_rules = parse_seed_subsection_lists(sections.get("EXPRESSION_RULES", ""))
    spatial_algorithms = parse_seed_subsections(sections.get("SPATIAL_ALGORITHMS", ""))
    social_layers = parse_seed_subsections(sections.get("SOCIAL_LAYERS", ""))
    details = parse_seed_subsections(sections.get("DETAILS", ""))
    core_logic = parse_seed_subsections(sections.get("CORE_LOGIC", ""))
    generation_freedom = parse_seed_subsection_lists(sections.get("GENERATION_FREEDOM", ""))

    archetype = {
        "id": identity.get("id", ""),
        "slug": identity.get("slug", ""),
        "name": {
            "cn": identity.get("name_cn", ""),
            "en": identity.get("name_en", ""),
        },
        "seed_source": {
            "markdown_path": str(seed_path.relative_to(seed_path.parents[3])),
            "authority": "authoritative seed definition",
        },
        "source_profile": {
            "derived_from": source_profile.get("derived_from", ""),
            "source_template": source_profile.get("source_template", ""),
        },
        "positioning": positioning,
        "core_temperature": sanitize_extracted_text(sections.get("CORE_TEMPERATURE", "")),
        "core_traits": parse_seed_list(sections.get("CORE_TRAITS", "")),
        "parameter_space": parse_parameter_space(sections.get("PARAMETERS", "")),
        "core_logic": {
            "core_motivation": core_logic.get("core_motivation", ""),
            "power_logic": core_logic.get("power_logic", ""),
            "social_logic": core_logic.get("social_logic", ""),
            "emotion_logic": core_logic.get("emotion_logic", ""),
            "security_anchor": core_logic.get("security_anchor", ""),
            "blind_spot": core_logic.get("blind_spot", ""),
            "conflict_logic": core_logic.get("conflict_logic", ""),
            "repair_logic": core_logic.get("repair_logic", ""),
        },
        "behavioral_model": {
            "visual_style": behavioral_model.get("visual_style", ""),
            "physical_style": behavioral_model.get("physical_style", ""),
            "verbal_style": behavioral_model.get("verbal_style", ""),
        },
        "expression_rules": {
            "canonical_expression_mode": sanitize_extracted_text(
                sections.get("EXPRESSION_RULES", "").split("### signature_line_patterns")[0].split("### canonical_expression_mode")[-1]
            ),
            "signature_line_patterns": expression_rules.get("signature_line_patterns", []),
        },
        "constraints": {
            "must_have": parse_seed_list(sections.get("MUST_HAVE", "")),
            "must_not_have": parse_seed_list(sections.get("MUST_NOT_HAVE", "")),
            "forbidden_drift": parse_seed_list(sections.get("FORBIDDEN_DRIFT", "")),
        },
        "spatial_algorithms": {
            "crowded": spatial_algorithms.get("crowded", ""),
            "one_on_one": spatial_algorithms.get("one_on_one", ""),
        },
        "social_layers": {
            "outer_layer": social_layers.get("outer_layer", ""),
            "inner_layer": social_layers.get("inner_layer", ""),
        },
        "details": {
            "sensory_profile": details.get("sensory_profile", ""),
            "symbolic_objects": details.get("symbolic_objects", ""),
            "breakdown_repair": details.get("breakdown_repair", ""),
        },
        "generation_freedom": {
            "allowed_to_vary": generation_freedom.get("allowed_to_vary", []),
            "must_remain_stable": generation_freedom.get("must_remain_stable", []),
            "forbidden_drift": generation_freedom.get("forbidden_drift", []),
        },
        "summary": coalesce_text(
            (sections.get("ARCHETYPE_SUMMARY", "") or sections.get("SUMMARY", "")).replace("\n", " ")
        ),
    }
    archetype["generation_contract"] = make_generation_contract_for_archetype(archetype)

    report.missing_fields.extend(
        key
        for key in ["id", "slug", "name.cn", "name.en", "positioning.thesis", "core_temperature", "summary"]
        if not _dig(archetype, key)
    )
    report.mapping_confidence = max(0.0, 1 - (0.08 * len(report.missing_fields)))
    archetype = deep_clean_strings(archetype)
    return {
        key: archetype[key]
        for key in [
            "id",
            "slug",
            "name",
            "seed_source",
            "source_profile",
            "positioning",
            "core_temperature",
            "core_traits",
            "parameter_space",
            "core_logic",
            "behavioral_model",
            "expression_rules",
            "constraints",
            "spatial_algorithms",
            "social_layers",
            "details",
            "generation_freedom",
            "generation_contract",
            "summary",
        ]
    }


def derive_persona_id(source_path: Path, markdown: str) -> str:
    title_match = re.search(r"ARCH\s*[-_ ]?\s*(\d{1,2})", markdown[:200], flags=re.IGNORECASE)
    if title_match:
        return f"ARCH{int(title_match.group(1)):02d}"
    file_match = re.search(r"(\d{1,2})", source_path.stem)
    if file_match:
        return f"ARCH{int(file_match.group(1)):02d}"
    raise ValueError("Unable to derive persona id from markdown.")


def parse_title_metadata(markdown: str) -> Dict[str, str]:
    for raw in markdown.splitlines():
        line = raw.strip()
        match = re.match(r"^#\s*ARCH\s*[-_ ]?\s*\d{1,2}\s*[:：]\s*(.+)$", line, flags=re.IGNORECASE)
        if not match:
            continue
        left, right = (match.group(1).split("|", 1) + [""])[:2]
        left = left.strip()
        right = right.strip()
        primary = left
        subtitle = ""
        named = re.match(r"^(.*?)\s*\((.*?)\)\s*$", left)
        if named:
            primary = named.group(1).strip()
            subtitle = named.group(2).strip()
        return {
            "name": primary,
            "subtitle": subtitle,
            "classification": right,
        }
    return {}


def first_quote_or_paragraph(markdown: str) -> str:
    match = re.search(r"^>\s*\*\*核心[:：]\*\*\s*[\"“]?(.+?)[\"”]?\s*$", markdown, flags=re.MULTILINE)
    if match:
        return match.group(1).strip()
    quote = re.search(r"^>\s*(.+)$", markdown, flags=re.MULTILINE)
    if quote:
        return quote.group(1).strip().strip('"“”')
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            return stripped
    return ""


def split_numbered_sections(markdown: str) -> Dict[str, str]:
    sections: Dict[str, str] = {}
    current_key: Optional[str] = None
    buffer: List[str] = []
    for raw in markdown.splitlines():
        normalized = normalize_line(raw)
        heading = re.match(r"^\s*(?:#+\s*)?(\d{1,2})\.\s+(.+?)\s*$", normalized)
        if heading:
            if current_key:
                sections[current_key] = "\n".join(buffer).strip()
            current_key = heading.group(1)
            buffer = [heading.group(2)]
            continue
        if current_key:
            buffer.append(raw.rstrip())
    if current_key:
        sections[current_key] = "\n".join(buffer).strip()
    return sections


def parse_label_value_section(text: str, aliases: Dict[str, List[str]]) -> Dict[str, str]:
    mapped: Dict[str, str] = {}
    for label, value in re.findall(r"\*\*(.+?)\*\*\s*(.*?)(?=\n\s*\*\*.+?\*\*|\Z)", text, flags=re.S):
        normalized = normalize_key(label.rstrip(":"))
        clean_value = sanitize_extracted_text(value.replace("\n", " "))
        for canonical, alias_list in aliases.items():
            candidates = [canonical] + alias_list
            if any(normalize_key(candidate) in normalized or normalized in normalize_key(candidate) for candidate in candidates):
                mapped[canonical] = clean_value
                break
    return mapped


def parse_body_language(text: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "center_of_gravity": "",
        "gaze_protocol": {"focus_rule": "", "movement_rule": ""},
        "breathing_protocol": "",
        "hand_constraints": "",
        "latency_buffer": {"delay_seconds": "", "rule": ""},
        "spatial_sovereignty": "",
        "negative_buffer": "",
    }
    for label, value in re.findall(r"\*\*(.+?)\*\*\s*(.*?)(?=\n\s*\*\*.+?\*\*|\Z)", text, flags=re.S):
        clean_label = label.rstrip(":")
        clean_value = value.strip()
        text_value = sanitize_extracted_text(clean_value.replace("\n", " "))
        if "重心控制" in clean_label:
            result["center_of_gravity"] = text_value
        elif "视线压制" in clean_label:
            bullets = [
                sanitize_extracted_text(strip_bullet_prefix(normalize_line(item)))
                for item in clean_value.splitlines()
                if strip_bullet_prefix(normalize_line(item))
            ]
            if bullets:
                result["gaze_protocol"]["focus_rule"] = bullets[0]
            if len(bullets) > 1:
                result["gaze_protocol"]["movement_rule"] = bullets[1]
        elif "呼吸协议" in clean_label:
            result["breathing_protocol"] = text_value
        elif "手部约束" in clean_label:
            result["hand_constraints"] = text_value
        elif "延迟反馈" in clean_label:
            delay_match = re.search(r"([0-9.]+\s*到\s*[0-9.]+\s*秒|[0-9.]+\s*-\s*[0-9.]+\s*秒)", text_value)
            result["latency_buffer"]["delay_seconds"] = delay_match.group(1) if delay_match else "0.5 到 1.5 秒"
            result["latency_buffer"]["rule"] = text_value
        elif "空间占据" in clean_label:
            result["spatial_sovereignty"] = text_value
        elif "负面信息处理" in clean_label:
            result["negative_buffer"] = text_value
    return result


def parse_taboos(text: str) -> List[str]:
    taboos: List[str] = []
    for raw in text.splitlines():
        stripped = strip_bullet_prefix(normalize_line(raw))
        if not stripped:
            continue
        if "Forbidden" in stripped and "拒绝人性污染" in stripped:
            continue
        if ":" in stripped or "：" in stripped:
            taboos.append(sanitize_extracted_text(stripped))
    return taboos


def parse_scene_behavior(text: str) -> Dict[str, Dict[str, str]]:
    result = {
        "small_scale": {"label": "", "strategy": "", "actions": "", "logic": ""},
        "large_scale": {"label": "", "strategy": "", "actions": "", "logic": ""},
    }
    for label, body in re.findall(r"\*\*(小范围交谈.+?|大范围聚会.+?)\*\*\s*(.*?)(?=\n\s*\*\*(?:小范围交谈|大范围聚会).+?\*\*|\Z)", text, flags=re.S):
        kv: Dict[str, str] = {}
        for raw in body.splitlines():
            stripped = strip_bullet_prefix(normalize_line(raw)).strip("*")
            if ":" in stripped:
                key, value = stripped.split(":", 1)
                kv[normalize_key(key)] = value.strip()
        target = "small_scale" if "小范围" in label else "large_scale"
        result[target] = {
            "label": label,
            "strategy": sanitize_extracted_text(kv.get(normalize_key("策略"), "")),
            "actions": sanitize_extracted_text(kv.get(normalize_key("动作"), "")),
            "logic": sanitize_extracted_text(kv.get(normalize_key("逻辑"), "")),
        }
    return result


def parse_interaction_matrix(text: str) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line.startswith("|") or "---" in line:
            continue
        columns = [column.strip() for column in line.strip("|").split("|")]
        if len(columns) != 3 or columns[0].startswith("对方的行为"):
            continue
        rows.append(
            {
                "input_signal": sanitize_extracted_text(columns[0]),
                "interpretation": sanitize_extracted_text(columns[1]),
                "response_adjustment": sanitize_extracted_text(columns[2]),
            }
        )
    return rows


def parse_protocol_chapter(text: str) -> Dict[str, Dict[str, str]]:
    protocols: Dict[str, Dict[str, str]] = {}
    current_key: Optional[str] = None
    current_title: Optional[str] = None
    fields: Dict[str, str] = {}

    def flush() -> None:
        nonlocal current_key, current_title, fields
        if current_key and current_title:
            protocols[current_key] = {
                "label": current_title,
                "cognitive_filter": fields.get("认知过滤", ""),
                "response_actions": fields.get("响应动作", ""),
                "breaker_line": fields.get("破局语言", "无"),
                "logic": fields.get("逻辑心法", fields.get("博弈结果", fields.get("逻辑转换", ""))),
            }
        current_key = None
        current_title = None
        fields = {}

    blocks = re.split(r"\n(?=###\s+)", text)
    for block in blocks:
        header = re.match(r"^###\s+([A-Z]\.)\s+(.+)$", block.strip(), flags=re.MULTILINE)
        if not header:
            continue
        flush()
        current_key = slugify(header.group(2))
        current_title = header.group(2).strip()
        for raw in block.splitlines()[1:]:
            stripped = strip_bullet_prefix(normalize_line(raw)).strip("*")
            if ":" in stripped:
                label, value = stripped.split(":", 1)
                label = label.strip()
                value = value.strip()
                if label in {"认知过滤", "响应动作", "破局语言", "逻辑心法", "博弈结果", "逻辑转换"}:
                    fields[label] = sanitize_extracted_text(value)
                elif label in {"物理动作"}:
                    previous = fields.get("响应动作", "")
                    fields["响应动作"] = sanitize_extracted_text(f"{previous} {value}".strip())
    flush()
    return protocols


def parse_reference_models(text: str) -> List[Dict[str, str]]:
    refs: List[Dict[str, str]] = []
    for raw in text.splitlines():
        stripped = strip_bullet_prefix(normalize_line(raw))
        if not stripped or ":" not in stripped:
            continue
        name, principle = stripped.split(":", 1)
        refs.append({"name": sanitize_extracted_text(name), "principle": sanitize_extracted_text(principle)})
    return refs


def slugify(value: str) -> str:
    slug = normalize_key(value)
    return slug[:48] if slug else "protocol"


def resolve_archetype_id(
    explicit_archetype_id: Optional[str],
    archetype: Optional[Dict[str, Any]],
    title_meta: Dict[str, str],
    paths: RepoPaths,
) -> Optional[str]:
    if explicit_archetype_id:
        return explicit_archetype_id
    if archetype:
        return str(archetype.get("id"))
    classification = title_meta.get("classification", "")
    if classification:
        for token in re.split(r"[|/]", classification):
            resolved = ARCHETYPE_ALIAS_MAP.get(token.strip().lower()) or ARCHETYPE_ALIAS_MAP.get(token.strip())
            if resolved:
                return resolved
    if paths.archetype_manifest.exists():
        manifest = load_json(paths.archetype_manifest)
        archetypes = manifest.get("archetypes", [])
        if len(archetypes) == 1:
            return archetypes[0]["id"]
    return None


def infer_realized_parameters(archetype: Dict[str, Any], persona_text: str) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
    ranges = archetype.get("parameter_space", {})
    if not isinstance(ranges, dict):
        return {}, []

    full_text = persona_text
    inferred: List[str] = []
    realized: Dict[str, Dict[str, Any]] = {}
    heuristics = {
        "E": ("冷、延迟、静默与情绪压缩", 0.20),
        "O": ("秩序、规则与执行风险对冲", 0.86),
        "R": ("礼仪、仪式与王后式场域控制", 0.90),
        "B": ("边界、拒绝解释与空间主权", 0.88),
    }
    for param_id, param_range in ranges.items():
        if not isinstance(param_range, dict):
            continue
        minimum = float(param_range["min"])
        maximum = float(param_range["max"])
        evidence, anchor = heuristics.get(param_id, ("通过文本强度推断的具体实现值", 0.5))
        if param_id == "E":
            value = minimum + ((maximum - minimum) * anchor)
        else:
            value = minimum + ((maximum - minimum) * anchor)
        realized[param_id] = {
            "value": round(value, 2),
            "confidence": 0.72 if param_id == "E" else 0.78,
            "evidence": f"{evidence}；来源于《{archetype.get('name', {}).get('cn', archetype.get('id', 'archetype'))}》范围与 persona 文本联合推断。",
        }
        inferred.append(f"realized_parameters.{param_id}")
    if "断头" in full_text:
        realized["R"]["confidence"] = 0.84
        realized["R"]["evidence"] = "断头王后的人设直接强化了礼仪、仪式与主权感，因此 R 被推断到范围高位。"
    return realized, inferred


def make_persona_generation_contract(forbidden_drift: List[str]) -> Dict[str, Any]:
    return {
        "locked_fields": [
            {"field": "archetype_id", "reason": "The persona must remain anchored to a valid archetype."},
            {"field": "consumer_fields", "reason": "Frontend consumers should read the explicit consumer-facing contract."},
            {"field": "theater_support", "reason": "Theater support fields provide semi-fixed runtime guidance without replacing consumer fields."},
        ],
        "support_fields": [
            {"field": "realized_parameters", "reason": "Quadrant compatibility mirrors may remain without becoming the canonical consumer owner."},
            {"field": "runtime.theater", "reason": "Scene-specific responses remain runtime-only and are not canonical consumer data."},
        ],
        "expansion_zones": [
            {"zone": "theater runtime expression", "guidance": "Generate scene-specific dialogue only from the authored stable pools and logic anchors."},
            {"zone": "scene micro-structure", "guidance": "Runtime may vary staging without changing the consumer-facing fixed fields."},
        ],
        "forbidden_drift": list(forbidden_drift),
    }


def build_consumer_fields(seed: Dict[str, Any]) -> Dict[str, Any]:
    taboos = normalize_string_list(seed["forbidden_drift"])
    return {
        "display_name": seed["name"],
        "quadrants": seed["quadrants"],
        "slogan": seed["slogan"],
        "core_essence": seed["core_drive"],
        "social_essence": seed["interaction_logic"],
        "signature_lines_pool": normalize_string_list(seed["signature_lines_pool"]),
        "taboos": taboos,
        "behavior_style": seed.get("behavior_anchor", ""),
        "language_style": seed.get("voice_anchor", ""),
        "reaction_patterns_pool": normalize_string_list(seed["reaction_patterns_pool"]),
    }


def build_consumer_fields_from_archetype(archetype: Dict[str, Any]) -> Dict[str, Any]:
    assets = archetype.get("assets", {})
    model_core = archetype.get("model_core", {})
    style_profile = archetype.get("style_profile", {})
    constraints = archetype.get("constraints", {})
    return {
        "display_name": archetype["name"]["cn"],
        "quadrants": archetype.get("quadrants", {}),
        "slogan": assets.get("slogan", ""),
        "core_essence": model_core.get("core_essence", ""),
        "social_essence": model_core.get("social_stance", ""),
        "signature_lines_pool": normalize_string_list(assets.get("signature_lines_pool", [])),
        "taboos": normalize_string_list(constraints.get("forbidden_drift", [])),
        "behavior_style": style_profile.get("behavior_style", ""),
        "language_style": style_profile.get("language_style", ""),
        "reaction_patterns_pool": normalize_string_list(assets.get("reaction_patterns_pool", [])),
    }


def infer_realized_parameters_from_quadrants(quadrants: Dict[str, float], evidence: str) -> Dict[str, Dict[str, Any]]:
    return {
        key: {
            "value": value,
            "confidence": 1.0,
            "evidence": evidence,
        }
        for key, value in quadrants.items()
    }


def build_archetype_from_seed_contract(seed: Dict[str, Any], seed_path: Path, report: DiagnosticReport) -> Dict[str, Any]:
    archetype_id = seed["archetype_id"]
    persona_id = persona_id_from_archetype_id(archetype_id)
    forbidden_list = normalize_string_list(seed["forbidden_drift"])
    if not forbidden_list:
        report.missing_fields.append("constraints.forbidden_drift")
        forbidden_list = ["Do not drift outside declared seed logic."]

    parameter_space = {
        key: {"min": build_parameter_range(value)[0], "max": build_parameter_range(value)[1]}
        for key, value in seed["quadrants"].items()
    }
    report.mapping_confidence = 0.98

    archetype = {
        "id": archetype_id,
        "slug": kebab_case(seed["name"]),
        "name": {
            "cn": seed["name"],
            "en": seed["name"],
        },
        "version": seed["version"],
        "seed_source": {
            "markdown_path": str(seed_path.relative_to(seed_path.parents[2])),
            "authority": "authoritative strict seed",
        },
        "source_profile": {
            "derived_from": persona_id,
            "source_template": "ARCHETYPE strict seed contract v1",
        },
        "quadrants": seed["quadrants"],
        "parameter_space": parameter_space,
        "model_core": {
            "core_essence": seed["core_drive"],
            "social_stance": build_social_stance(seed["interaction_logic"], seed["power_logic"]),
            "interaction_logic": seed["interaction_logic"],
            "emotional_logic": seed["emotional_logic"],
            "power_logic": seed["power_logic"],
        },
        "style_profile": {
            "behavior_style": seed.get("behavior_anchor", ""),
            "language_style": seed.get("voice_anchor", ""),
        },
        "assets": {
            "slogan": seed["slogan"],
            "signature_lines_pool": normalize_string_list(seed["signature_lines_pool"]),
            "reaction_patterns_pool": normalize_string_list(seed["reaction_patterns_pool"]),
        },
        "constraints": {
            "forbidden_drift": forbidden_list,
        },
        "generation_contract": make_generation_contract_for_archetype(
            {
                "constraints": {"forbidden_drift": forbidden_list},
            }
        ),
        "summary": f"{seed['name']} is a seed-traceable mother-model with canonical logic, style profile, assets, and prohibitions.",
    }
    return deep_clean_strings(archetype)


def _split_clauses(text: str) -> List[str]:
    fragments = re.split(r"[，,。；;、\n]", text)
    return [coalesce_text(item) for item in fragments if coalesce_text(item)]


def _derive_voice(seed: Dict[str, Any]) -> str:
    anchor = seed.get("voice_anchor", "")
    if anchor:
        primary = _split_clauses(anchor)
        compact = "、".join(primary[:3]) if primary else anchor
        return f"语气{compact}"
    interaction = _split_clauses(seed["interaction_logic"])
    emotional = _split_clauses(seed["emotional_logic"])
    power = _split_clauses(seed["power_logic"])
    pieces = []
    if interaction:
        pieces.append(f"先{interaction[0]}")
    if emotional:
        pieces.append(f"并保持{emotional[0]}")
    if power:
        pieces.append(f"维持{power[0]}")
    return "，".join(pieces[:3]) or "语气克制、边界清晰、响应稳定"


def _derive_behavioral_signature(seed: Dict[str, Any]) -> List[str]:
    anchor = seed.get("behavior_anchor", "")
    clauses = _split_clauses(anchor) if anchor else []
    if clauses:
        traits = clauses[:3]
    else:
        interaction = _split_clauses(seed["interaction_logic"])
        power = _split_clauses(seed["power_logic"])
        traits = []
        if interaction:
            traits.append(f"先执行{interaction[0]}")
        if power:
            traits.append(f"互动中保持{power[0]}")
        traits.append("响应前短暂停顿并复述边界")
    while len(traits) < 2:
        traits.append("保持稳定节奏与边界")
    return traits[:3]


def _derive_relationship_dynamic(seed: Dict[str, Any]) -> str:
    interaction = _split_clauses(seed["interaction_logic"])
    power = _split_clauses(seed["power_logic"])
    first = interaction[0] if interaction else seed["interaction_logic"]
    second = power[0] if power else seed["power_logic"]
    return f"关系距离默认中高边界；以{first}建立互动；由{second}保持主导秩序。"


def _derive_emotional_tendency(seed: Dict[str, Any]) -> str:
    emotional = _split_clauses(seed["emotional_logic"])
    first = emotional[0] if emotional else seed["emotional_logic"]
    second = emotional[1] if len(emotional) > 1 else "受压时先收缩再校准"
    return f"基线{first}；防御倾向{second}；温度变化遵循边界先行。"


def _derive_trigger_response(seed: Dict[str, Any]) -> List[str]:
    interaction = _split_clauses(seed["interaction_logic"])
    power = _split_clauses(seed["power_logic"])
    emotional = _split_clauses(seed["emotional_logic"])
    i = interaction[0] if interaction else seed["interaction_logic"]
    p = power[0] if power else seed["power_logic"]
    e = emotional[0] if emotional else seed["emotional_logic"]
    return [
        f"对方越界 → 先重申边界，再按{i}继续",
        f"对方施压 → 维持{p}，拒绝失序互动",
        f"对方示好 → 以{e}回应，不放松核心边界",
    ]


def compile_persona_policy_fields(seed: Dict[str, Any], report: DiagnosticReport) -> Dict[str, Any]:
    missing_voice_anchor = not bool(seed.get("voice_anchor"))
    missing_behavior_anchor = not bool(seed.get("behavior_anchor"))
    if missing_voice_anchor:
        report.inferred_fields.append("voice (fallback from interaction/emotional/power logic)")
    if missing_behavior_anchor:
        report.inferred_fields.append("behavioral_signature (fallback from interaction/power logic)")
    return {
        "voice": _derive_voice(seed),
        "behavioral_signature": _derive_behavioral_signature(seed),
        "relationship_dynamic": _derive_relationship_dynamic(seed),
        "emotional_tendency": _derive_emotional_tendency(seed),
        "trigger_response": _derive_trigger_response(seed),
        "forbidden_behavior": seed["forbidden_drift"] if isinstance(seed["forbidden_drift"], list) else [seed["forbidden_drift"]],
    }


def apply_drift_guardrails(seed: Dict[str, Any], policy_fields: Dict[str, Any]) -> Dict[str, Any]:
    normalized = dict(policy_fields)
    forbidden = [item for item in normalized["forbidden_behavior"] if item]
    canonical_forbidden = seed["forbidden_drift"] if isinstance(seed["forbidden_drift"], list) else [seed["forbidden_drift"]]
    for item in canonical_forbidden:
        if item and item not in forbidden:
            forbidden.append(item)
    normalized["forbidden_behavior"] = forbidden

    dominant_power = bool(re.search(r"主导|控制|边界|标准|秩序", seed["power_logic"]))
    if dominant_power and re.search(r"讨好|迎合|服从|取悦", normalized["voice"]):
        normalized["voice"] = _derive_voice(seed)

    interaction_rule = _split_clauses(seed["interaction_logic"])
    if interaction_rule:
        must_phrase = interaction_rule[0]
        signature = normalized["behavioral_signature"]
        if all(must_phrase not in item for item in signature):
            signature = signature[:2] + [f"关键时刻执行{must_phrase}"]
            normalized["behavioral_signature"] = signature[:3]

    emotional_rule = _split_clauses(seed["emotional_logic"])
    if emotional_rule and emotional_rule[0] not in normalized["emotional_tendency"]:
        normalized["emotional_tendency"] = _derive_emotional_tendency(seed)

    if not normalized["trigger_response"]:
        normalized["trigger_response"] = _derive_trigger_response(seed)
    return normalized


def validate_persona_policy_invariants(seed: Dict[str, Any], policy_fields: Dict[str, Any]) -> None:
    required_paths = [
        ("voice", policy_fields.get("voice")),
        ("behavioral_signature", policy_fields.get("behavioral_signature")),
        ("relationship_dynamic", policy_fields.get("relationship_dynamic")),
        ("emotional_tendency", policy_fields.get("emotional_tendency")),
        ("trigger_response", policy_fields.get("trigger_response")),
        ("forbidden_behavior", policy_fields.get("forbidden_behavior")),
    ]
    missing = [name for name, value in required_paths if not value]
    if missing:
        raise ValueError(f"Persona generation policy invariant failed: empty generated fields `{', '.join(missing)}`")

    forbidden_seed = seed["forbidden_drift"] if isinstance(seed["forbidden_drift"], list) else [seed["forbidden_drift"]]
    forbidden_generated = policy_fields["forbidden_behavior"]
    if any(item not in forbidden_generated for item in forbidden_seed):
        raise ValueError("Persona generation policy invariant failed: forbidden_behavior weaker than forbidden_drift")


def build_persona_from_seed_contract(seed: Dict[str, Any], source_path: Path, archetype: Dict[str, Any], report: DiagnosticReport) -> Dict[str, Any]:
    persona_id = persona_id_from_archetype_id(seed["archetype_id"])
    consumer_fields = build_consumer_fields_from_archetype(archetype)
    theater_support = build_theater_support_from_runtime_sources(
        archetype["model_core"]["interaction_logic"],
        archetype["model_core"]["social_stance"],
        archetype["model_core"]["emotional_logic"],
        archetype["model_core"]["power_logic"],
        archetype["style_profile"]["language_style"],
        archetype["style_profile"]["behavior_style"],
        consumer_fields["reaction_patterns_pool"],
    )

    persona = {
        "id": persona_id,
        "version": seed["version"],
        "archetype_id": seed["archetype_id"],
        "name": {
            "primary": seed["name"],
            "en": seed["name"],
            "source_classification": "generated_from_strict_seed",
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "consumer_fields": consumer_fields,
        "theater_support": theater_support,
        "realized_parameters": infer_realized_parameters_from_quadrants(
            seed["quadrants"],
            "Copied directly from authored seed quadrants for compatibility; consumer_fields.quadrants is canonical.",
        ),
        "generation_contract": make_persona_generation_contract(consumer_fields["taboos"]),
    }
    report.mapping_confidence = max(0.0, 1 - (0.02 * len(report.inferred_fields)))
    return deep_clean_strings(persona)


def infer_realized_parameters_from_archetype(archetype: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    if isinstance(archetype.get("quadrants"), dict):
        return infer_realized_parameters_from_quadrants(
            archetype["quadrants"],
            "Copied from archetype quadrants derived from authored seed quadrants.",
        )
    realized: Dict[str, Dict[str, Any]] = {}
    for param_id, envelope in archetype.get("parameter_space", {}).items():
        minimum = envelope.get("min")
        maximum = envelope.get("max")
        if isinstance(minimum, (int, float)) and isinstance(maximum, (int, float)):
            value = round((minimum + maximum) / 2, 2)
        else:
            value = 0.0
        realized[param_id] = {
            "value": value,
            "confidence": 0.8,
            "evidence": "Derived deterministically from archetype parameter envelope midpoint.",
        }
    return realized


def build_persona_from_instance_contract(
    contract: Dict[str, Any],
    source_path: Path,
    archetype: Dict[str, Any],
    report: DiagnosticReport,
) -> Dict[str, Any]:
    persona_id = contract["persona_id"]
    archetype_id = contract["archetype_id"]
    persona_name = contract["name"]
    role_in_interaction = contract.get("role_in_interaction", "")

    taboo_entries = normalize_string_list(contract["forbidden_behavior"])

    sample_lines = contract.get("sample_lines", [])
    if isinstance(sample_lines, str):
        sample_lines = [sample_lines] if sample_lines else []

    trigger_response = contract.get("trigger_response", "")
    relationship_dynamic = contract.get("relationship_dynamic", "")
    emotional_tendency = contract.get("emotional_tendency", "")

    model_core = archetype.get("model_core", {})
    style_profile = archetype.get("style_profile", {})
    consumer_fields = build_consumer_fields_from_archetype(archetype)
    consumer_fields["display_name"] = persona_name
    if sample_lines:
        consumer_fields["signature_lines_pool"] = sample_lines
    if taboo_entries:
        consumer_fields["taboos"] = taboo_entries
    runtime_patterns = [item for item in [trigger_response, emotional_tendency] if item]
    if runtime_patterns:
        consumer_fields["reaction_patterns_pool"] = runtime_patterns
    theater_support = build_theater_support_from_runtime_sources(
        model_core.get("interaction_logic", relationship_dynamic),
        model_core.get("social_stance", consumer_fields["social_essence"]),
        model_core.get("emotional_logic", emotional_tendency or contract["instance_premise"]),
        model_core.get("power_logic", ""),
        style_profile.get("language_style", contract["voice"]),
        style_profile.get("behavior_style", contract["behavioral_signature"]),
        consumer_fields["reaction_patterns_pool"],
    )
    persona = {
        "id": persona_id,
        "version": contract["version"],
        "archetype_id": archetype_id,
        "name": {
            "primary": persona_name,
            "en": role_in_interaction or persona_name,
            "source_classification": "persona_instance_contract_v1",
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "consumer_fields": consumer_fields,
        "theater_support": theater_support,
        "realized_parameters": infer_realized_parameters_from_archetype(archetype),
        "generation_contract": make_persona_generation_contract(taboo_entries),
    }

    for required_path in [
        "id",
        "version",
        "archetype_id",
        "name.primary",
        "consumer_fields.display_name",
        "consumer_fields.core_essence",
        "consumer_fields.taboos",
    ]:
        if not _dig(persona, required_path):
            report.missing_fields.append(required_path)

    report.mapping_confidence = max(0.0, 1 - (0.06 * len(report.missing_fields)) - (0.02 * len(report.inferred_fields)))
    return deep_clean_strings(persona)


def build_persona(
    markdown: str,
    source_path: Path,
    archetype_id: str,
    archetype: Optional[Dict[str, Any]],
    report: DiagnosticReport,
    parsed_contract: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if parsed_contract is not None:
        if archetype is None:
            raise ValueError("Persona contract ingestion requires an existing archetype payload.")
        return build_persona_from_instance_contract(parsed_contract, source_path, archetype, report)

    if is_tagged_persona(markdown):
        persona = parse_tagged_persona(markdown, source_path, archetype_id, report)
        return {
            "id": persona["id"],
            "version": "0.0.0-legacy",
            "archetype_id": persona["archetype_id"],
            "name": persona["name"],
            "source_markdown": persona["source_markdown"],
            "consumer_fields": persona["consumer_fields"],
            "theater_support": persona["theater_support"],
            "realized_parameters": persona["realized_parameters"],
            "generation_contract": persona["generation_contract"],
        }

    title_meta = parse_title_metadata(markdown)
    sections = split_numbered_sections(markdown)
    core_logic = parse_label_value_section(sections.get("1", ""), ROOT_LOGIC_ALIASES)
    cognitive_filters = parse_label_value_section(sections.get("2", ""), COGNITIVE_ALIASES)
    embodiment = parse_body_language(sections.get("3", ""))
    taboos = parse_taboos(sections.get("4", ""))
    negative_feedback = parse_protocol_chapter(sections.get("7", ""))
    positive_feedback = parse_protocol_chapter(sections.get("8", ""))
    extreme_pressure = {
        "label": "应对现实主义与暴力逻辑",
        "cognitive_filter": coalesce_text(re.sub(r"\*\*心态变化[:：]\*\*", "", sections.get("9", "")).split("**做法：**")[0]),
        "response_actions": sanitize_extracted_text(" ".join(re.findall(r"\*\*[^*]+[:：]\*\*\s*(.+)", sections.get("9", "")))),
        "breaker_line": "你的音量已经超过了正常人类逻辑交流的上限。等你恢复生物平衡后，我们再继续。",
        "logic": "不在内容层面反击，而是通过结构性蔑视将对方推离文明阈值。",
    }
    persona_id = derive_persona_id(source_path, markdown)
    primary = title_meta.get("name", persona_id)
    subtitle = title_meta.get("subtitle", "") or PERSONA_TITLE_ALIASES.get(persona_id, "")
    source_classification = title_meta.get("classification", "")
    core_directive = first_quote_or_paragraph(markdown)

    if not subtitle:
        report.inferred_fields.append("name.en")
        subtitle = primary
    realized_parameters, inferred = infer_realized_parameters(archetype or {}, markdown)
    report.inferred_fields.extend(inferred)

    signature_lines = []
    for collection in [negative_feedback, positive_feedback]:
        for payload in collection.values():
            if payload.get("breaker_line") and payload["breaker_line"] != "无":
                signature_lines.append(payload["breaker_line"])
    signature_lines.append(extreme_pressure["breaker_line"])
    reaction_patterns = [payload["response_actions"] for payload in negative_feedback.values() if payload.get("response_actions")]
    reaction_patterns.extend([payload["response_actions"] for payload in positive_feedback.values() if payload.get("response_actions")])
    if extreme_pressure.get("response_actions"):
        reaction_patterns.append(extreme_pressure["response_actions"])

    persona = {
        "id": persona_id,
        "archetype_id": archetype_id,
        "name": {
            "primary": primary,
            "en": subtitle,
            "source_classification": source_classification,
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "consumer_fields": {
            "display_name": primary,
            "quadrants": archetype.get("quadrants", {}) if archetype else {},
            "slogan": core_directive,
            "core_essence": core_directive,
            "social_essence": core_logic.get("social_essence", ""),
            "signature_lines_pool": signature_lines,
            "taboos": taboos,
            "behavior_style": embodiment.get("center_of_gravity", ""),
            "language_style": core_directive,
            "reaction_patterns_pool": reaction_patterns,
        },
        "theater_support": build_theater_support_from_runtime_sources(
            core_logic.get("social_essence", ""),
            build_social_stance(core_logic.get("social_essence", ""), core_logic.get("power_source", "")),
            cognitive_filters.get("downward_compatibility", ""),
            core_logic.get("power_source", ""),
            core_directive,
            embodiment.get("center_of_gravity", ""),
            reaction_patterns,
        ),
        "realized_parameters": realized_parameters,
        "generation_contract": make_persona_generation_contract(taboos),
    }

    for required_path in [
        "id",
        "archetype_id",
        "name.primary",
        "consumer_fields.core_essence",
        "theater_support.logic_axes.interaction_focus",
    ]:
        if not _dig(persona, required_path):
            report.missing_fields.append(required_path)
    report.mapping_confidence = max(0.0, 1 - (0.06 * len(report.missing_fields)) - (0.02 * len(report.inferred_fields)))
    persona = deep_clean_strings(persona)

    ordered = {
        "id": persona["id"],
        "version": "0.0.0-legacy",
        "archetype_id": persona["archetype_id"],
        "name": persona["name"],
        "source_markdown": persona["source_markdown"],
        "consumer_fields": persona["consumer_fields"],
        "theater_support": persona["theater_support"],
        "realized_parameters": persona["realized_parameters"],
        "generation_contract": persona["generation_contract"],
    }
    return ordered


def _dig(payload: Dict[str, Any], path: str) -> Any:
    cursor: Any = payload
    for chunk in path.split("."):
        if not isinstance(cursor, dict) or chunk not in cursor:
            return None
        cursor = cursor[chunk]
    return cursor


def load_schema(schema_dir: Path, filename: str) -> Dict[str, Any]:
    return load_json(schema_dir / filename)


def resolve_ref(schema: Dict[str, Any], root_schema: Dict[str, Any], schema_dir: Path) -> Dict[str, Any]:
    ref = schema["$ref"]
    if ref.startswith("#/"):
        target: Any = root_schema
        for part in ref[2:].split("/"):
            target = target[part]
        return target
    ref_path = schema_dir / ref
    return load_json(ref_path)


def validate_instance(instance: Any, schema: Dict[str, Any], schema_dir: Path, root_schema: Optional[Dict[str, Any]] = None, path: str = "$") -> List[str]:
    root = root_schema or schema
    if "$ref" in schema:
        ref = schema["$ref"]
        resolved = resolve_ref(schema, root, schema_dir)
        next_root = root if ref.startswith("#/") else resolved
        return validate_instance(instance, resolved, schema_dir, root_schema=next_root, path=path)

    errors: List[str] = []
    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(instance, dict):
            return [f"{path}: expected object"]
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                errors.append(f"{path}: missing required field `{key}`")
        properties = schema.get("properties", {})
        for key, value in instance.items():
            if key in properties:
                errors.extend(validate_instance(value, properties[key], schema_dir, root_schema=root, path=f"{path}.{key}"))
            else:
                additional = schema.get("additionalProperties", True)
                if additional is False:
                    errors.append(f"{path}: unexpected field `{key}`")
                elif isinstance(additional, dict):
                    errors.extend(validate_instance(value, additional, schema_dir, root_schema=root, path=f"{path}.{key}"))
        min_properties = schema.get("minProperties")
        if min_properties is not None and len(instance) < min_properties:
            errors.append(f"{path}: expected at least {min_properties} properties")
        return errors

    if expected_type == "array":
        if not isinstance(instance, list):
            return [f"{path}: expected array"]
        min_items = schema.get("minItems")
        if min_items is not None and len(instance) < min_items:
            errors.append(f"{path}: expected at least {min_items} items")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, value in enumerate(instance):
                errors.extend(validate_instance(value, item_schema, schema_dir, root_schema=root, path=f"{path}[{index}]"))
        return errors

    if expected_type == "string":
        if not isinstance(instance, str):
            return [f"{path}: expected string"]
        pattern = schema.get("pattern")
        if pattern and not re.match(pattern, instance):
            errors.append(f"{path}: value `{instance}` does not match pattern {pattern}")
        return errors

    if expected_type == "number":
        if not isinstance(instance, (int, float)) or isinstance(instance, bool):
            return [f"{path}: expected number"]
        minimum = schema.get("minimum")
        maximum = schema.get("maximum")
        if minimum is not None and instance < minimum:
            errors.append(f"{path}: value {instance} is less than minimum {minimum}")
        if maximum is not None and instance > maximum:
            errors.append(f"{path}: value {instance} is greater than maximum {maximum}")
        return errors

    enum_values = schema.get("enum")
    if enum_values and instance not in enum_values:
        errors.append(f"{path}: value `{instance}` not in enum {enum_values}")
    return errors


def validate_cross_references(paths: RepoPaths) -> List[str]:
    errors: List[str] = []
    archetype_ids = set()
    for json_file in sorted(paths.archetype_models_dir.glob("*.json")):
        payload = load_json(json_file)
        archetype_ids.add(payload["id"])
    seen_ids = set()
    for json_file in sorted(paths.personas_dir.glob("*.json")):
        payload = load_json(json_file)
        persona_id = payload["id"]
        if persona_id in seen_ids:
            errors.append(f"duplicate persona id `{persona_id}`")
        seen_ids.add(persona_id)
        if payload.get("archetype_id") not in archetype_ids:
            errors.append(f"{json_file}: archetype_id `{payload.get('archetype_id')}` does not exist")
    if len(archetype_ids) != len(list(paths.archetype_models_dir.glob('*.json'))):
        errors.append("duplicate archetype ids detected")
    return errors


def rebuild_manifests(paths: RepoPaths) -> None:
    archetype_entries: List[Dict[str, Any]] = []
    persona_entries: List[Dict[str, Any]] = []

    for json_file in sorted(paths.archetype_models_dir.glob("*.json")):
        payload = load_json(json_file)
        archetype_entries.append(
            {
                "id": payload["id"],
                "slug": payload["slug"],
                "json_path": str(json_file.relative_to(paths.root)),
                "seed_path": payload["seed_source"]["markdown_path"],
                "name_cn": payload["name"]["cn"],
                "name_en": payload["name"]["en"],
                "status": "active",
            }
        )

    for json_file in sorted(paths.personas_dir.glob("*.json")):
        payload = load_json(json_file)
        md_path = paths.personas_dir / f"{payload['id']}.md"
        persona_entries.append(
            {
                "id": payload["id"],
                "archetype_id": payload["archetype_id"],
                "json_path": str(json_file.relative_to(paths.root)),
                "md_path": str(md_path.relative_to(paths.root)) if md_path.exists() else None,
                "name": payload["name"]["primary"],
                "subtitle": payload["name"]["en"],
                "status": "active",
            }
        )

    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    write_json(
        paths.archetype_manifest,
        {
            "schema_version": "2.0.0",
            "generated_at": timestamp,
            "total_archetypes": len(archetype_entries),
            "archetypes": archetype_entries,
        },
    )
    write_json(
        paths.persona_manifest,
        {
            "schema_version": "2.0.0",
            "generated_at": timestamp,
            "total_personas": len(persona_entries),
            "personas": persona_entries,
        },
    )


def validate_database(paths: RepoPaths) -> None:
    archetype_schema = load_schema(paths.schema_dir, "archetype.schema.json")
    persona_schema = load_schema(paths.schema_dir, "persona.schema.json")
    errors: List[str] = []
    for json_file in sorted(paths.archetype_models_dir.glob("*.json")):
        errors.extend(validate_instance(load_json(json_file), archetype_schema, paths.schema_dir, path=str(json_file.relative_to(paths.root))))
    for json_file in sorted(paths.personas_dir.glob("*.json")):
        errors.extend(validate_instance(load_json(json_file), persona_schema, paths.schema_dir, path=str(json_file.relative_to(paths.root))))
    errors.extend(validate_cross_references(paths))
    if errors:
        raise ValueError("Schema validation failed:\n- " + "\n- ".join(errors))


def sync_docs_mirror(paths: RepoPaths) -> None:
    mirror_root = paths.docs_database_dir
    mirror_root.mkdir(parents=True, exist_ok=True)

    copy_plan = [
        (paths.archetypes_seed_dir, mirror_root / "archetypes"),
        (paths.archetype_models_dir, mirror_root / "archetype_models"),
        (paths.personas_dir, mirror_root / "personas"),
        (paths.manifests_dir, mirror_root / "manifests"),
    ]

    for child in list(mirror_root.iterdir()):
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()

    for source_dir, destination_dir in copy_plan:
        shutil.copytree(
            source_dir,
            destination_dir,
            ignore=shutil.ignore_patterns(".DS_Store"),
        )


def collect_mirror_files(root: Path) -> List[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and path.name != ".DS_Store")


def validate_docs_mirror(paths: RepoPaths) -> None:
    mirror_root = paths.docs_database_dir
    copy_plan = [
        (paths.archetypes_seed_dir, mirror_root / "archetypes"),
        (paths.archetype_models_dir, mirror_root / "archetype_models"),
        (paths.personas_dir, mirror_root / "personas"),
        (paths.manifests_dir, mirror_root / "manifests"),
    ]

    errors: List[str] = []
    allowed_dirs = {mirror_dir.name for _, mirror_dir in copy_plan}
    actual_dirs = {path.name for path in mirror_root.iterdir() if path.is_dir()} if mirror_root.exists() else set()
    unexpected_dirs = sorted(actual_dirs - allowed_dirs)
    for directory in unexpected_dirs:
        errors.append(f"unexpected mirror directory `{(mirror_root / directory).relative_to(paths.root)}`")

    for source_dir, mirror_dir in copy_plan:
        if not mirror_dir.exists():
            errors.append(f"missing mirror directory `{mirror_dir.relative_to(paths.root)}`")
            continue

        source_files = collect_mirror_files(source_dir)
        mirror_files = collect_mirror_files(mirror_dir)
        source_rel = {path.relative_to(source_dir) for path in source_files}
        mirror_rel = {path.relative_to(mirror_dir) for path in mirror_files}

        missing = sorted(source_rel - mirror_rel)
        stale = sorted(mirror_rel - source_rel)
        for rel_path in missing:
            errors.append(f"missing mirrored file `{(mirror_dir / rel_path).relative_to(paths.root)}`")
        for rel_path in stale:
            errors.append(f"stale mirrored file `{(mirror_dir / rel_path).relative_to(paths.root)}`")

        for rel_path in sorted(source_rel & mirror_rel):
            if not filecmp.cmp(source_dir / rel_path, mirror_dir / rel_path, shallow=False):
                errors.append(f"stale content in `{(mirror_dir / rel_path).relative_to(paths.root)}`")

    if errors:
        raise ValueError("Docs mirror validation failed:\n- " + "\n- ".join(errors))


def print_report(label: str, report: DiagnosticReport) -> None:
    missing = ", ".join(report.missing_fields) if report.missing_fields else "none"
    inferred = ", ".join(report.inferred_fields) if report.inferred_fields else "none"
    print(f"[diagnostics:{label}] missing_fields: {missing}")
    print(f"[diagnostics:{label}] inferred_fields: {inferred}")
    print(f"[diagnostics:{label}] mapping_confidence: {report.mapping_confidence:.2f}")


def ingest(
    seed_md: Path,
    paths: RepoPaths,
    dry_run: bool = False,
) -> Tuple[str, Optional[str]]:
    markdown = markdown_to_text(seed_md)
    seed_payload = parse_archetype_seed_contract(markdown)
    seed_report = DiagnosticReport()
    print_report("seed", seed_report)

    archetype_report = DiagnosticReport()
    archetype_payload = build_archetype_from_seed_contract(seed_payload, seed_md, archetype_report)
    print_report("archetype", archetype_report)
    persona_report = DiagnosticReport()
    persona_payload = build_persona_from_seed_contract(seed_payload, seed_md, archetype_payload, persona_report)
    print_report("persona", persona_report)

    if not dry_run:
        write_json(paths.archetype_models_dir / f"{archetype_payload['id']}.json", archetype_payload)
        write_json(paths.personas_dir / f"{persona_payload['id']}.json", persona_payload)
        rebuild_manifests(paths)
        validate_database(paths)
        sync_docs_mirror(paths)
        validate_docs_mirror(paths)
    return persona_payload["id"], archetype_payload["id"] if archetype_payload else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate archetype/persona JSON artifacts from a strict archetype seed markdown.")
    parser.add_argument("source", type=Path, help="Archetype seed markdown path (database/archetypes/ARCHETYPE_XX_seed.md)")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--sync-git", action="store_true", help="Best-effort pull --ff-only when tracking origin")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without writing files")
    args = parser.parse_args()

    paths = build_paths(args.repo_root.resolve())
    git_ctx = detect_git_context(paths.root)
    if args.sync_git:
        adaptive_presync(paths.root, git_ctx)

    persona_id, generated_archetype_id = ingest(
        args.source.resolve(),
        paths,
        dry_run=args.dry_run,
    )
    if generated_archetype_id:
        print(f"[ingest] generated archetype {generated_archetype_id}")
    print(f"[ingest] generated persona {persona_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
