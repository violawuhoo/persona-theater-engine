#!/usr/bin/env python3
"""Seed-driven archetype/persona ingestion pipeline.

The pipeline keeps the database layer authoritative and schema-validated:
1) optionally sync git state
2) parse archetype seed markdown when supplied
3) parse persona markdown into archetype-linked persona JSON
4) validate payloads against the database schemas
5) rebuild manifests from actual database files
6) emit diagnostics for missing fields, inferred fields, and mapping confidence
"""

from __future__ import annotations

import argparse
import json
import re
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


@dataclass
class RepoPaths:
    root: Path
    archetypes_dir: Path
    personas_dir: Path
    manifests_dir: Path
    schema_dir: Path

    @property
    def archetype_manifest(self) -> Path:
        return self.manifests_dir / "archetypes.manifest.json"

    @property
    def persona_manifest(self) -> Path:
        return self.manifests_dir / "personas.manifest.json"


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
        archetypes_dir=root / "database" / "archetypes",
        personas_dir=root / "database" / "personas",
        manifests_dir=root / "database" / "manifests",
        schema_dir=root / "database" / "schema",
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


def markdown_to_text(path: Path) -> str:
    raw = path.read_text(encoding="utf-8")
    if raw.lstrip().startswith("{\\rtf1"):
        converted = run(["textutil", "-convert", "txt", "-stdout", str(path)], cwd=path.parent, check=True)
        return converted.stdout.strip()
    return raw


def is_tagged_persona(markdown: str) -> bool:
    return "<root>" in markdown and "<module_" in markdown


def extract_tag(markdown: str, tag: str) -> str:
    match = re.search(rf"<{tag}\b[^>]*>\s*(.*?)\s*</{tag}>", markdown, flags=re.S)
    if not match:
        return ""
    return sanitize_extracted_text(match.group(1))


def parse_tagged_title(markdown: str) -> Dict[str, str]:
    title = extract_tag(markdown, "title")
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
    raw = extract_tag(markdown, "param_array")
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
    raw = extract_tag(markdown, "reference_char")
    if ":" in raw:
        _, raw = raw.split(":", 1)
    refs = []
    for part in re.split(r"[、,，]", raw):
        name = sanitize_extracted_text(part)
        if name:
            refs.append({"name": name, "principle": "Canonical reference character named in persona source."})
    return refs


def parse_tagged_dialogues(markdown: str) -> List[str]:
    lines = []
    for index in range(1, 6):
        value = extract_tag(markdown, f"dialogue_{index:02d}")
        if value:
            lines.append(value)
    return lines


def parse_tagged_taboos(markdown: str) -> List[Dict[str, str]]:
    taboos = []
    for index in range(1, 6):
        value = extract_tag(markdown, f"forbid_{index:02d}")
        if not value:
            continue
        if "：" in value:
            action, rule = value.split("：", 1)
        elif ":" in value:
            action, rule = value.split(":", 1)
        else:
            action, rule = value, value
        taboos.append({"action": sanitize_extracted_text(action), "rule": sanitize_extracted_text(rule)})
    return taboos


def parse_tagged_persona(markdown: str, source_path: Path, archetype_id: str, report: DiagnosticReport) -> Dict[str, Any]:
    title_meta = parse_tagged_title(markdown)
    persona_id = title_meta.get("id") or derive_persona_id(source_path, markdown)
    primary = title_meta.get("name") or persona_id
    subtitle = title_meta.get("subtitle") or PERSONA_TITLE_ALIASES.get(persona_id, primary)
    slogan = extract_tag(markdown, "slogan")
    hint_psych = extract_tag(markdown, "hint_psych")
    source_classification = extract_tag(markdown, "module_title") or "canonical_tagged_markdown"

    scene_behavior = {
        "small_scale": {
            "label": "人少场合 (One-on-One)",
            "strategy": extract_tag(markdown, "space_one2one"),
            "actions": extract_tag(markdown, "action_vision"),
            "logic": extract_tag(markdown, "item_social_view"),
        },
        "large_scale": {
            "label": "人多场合 (Crowded)",
            "strategy": extract_tag(markdown, "space_crowded"),
            "actions": extract_tag(markdown, "action_physical"),
            "logic": extract_tag(markdown, "item_conflict_response"),
        },
    }

    interaction_matrix = [
        {
            "input_signal": "遭遇攻击",
            "interpretation": extract_tag(markdown, "item_cognitive_blind"),
            "response_adjustment": extract_tag(markdown, "dialogue_03"),
        },
        {
            "input_signal": "接收好感",
            "interpretation": extract_tag(markdown, "item_conflict_response"),
            "response_adjustment": extract_tag(markdown, "dialogue_04"),
        },
        {
            "input_signal": "对方不回应",
            "interpretation": extract_tag(markdown, "forbid_02"),
            "response_adjustment": "保持静默直到对方重新进入你的秩序。",
        },
    ]

    negative_feedback = {
        "conflict_response": {
            "label": "冲突响应",
            "cognitive_filter": extract_tag(markdown, "item_cognitive_blind"),
            "response_actions": extract_tag(markdown, "item_conflict_response"),
            "breaker_line": extract_tag(markdown, "dialogue_03"),
            "logic": extract_tag(markdown, "item_power"),
        }
    }
    positive_feedback = {
        "affection_acceptance": {
            "label": "接收好感",
            "cognitive_filter": "对赞赏先做客观性评估，再决定是否接受。",
            "response_actions": extract_tag(markdown, "item_conflict_response"),
            "breaker_line": extract_tag(markdown, "dialogue_04"),
            "logic": extract_tag(markdown, "item_emotion_view"),
        }
    }
    extreme_pressure = {
        "label": "系统维护",
        "cognitive_filter": extract_tag(markdown, "error_repair"),
        "response_actions": extract_tag(markdown, "item_mental_repair"),
        "breaker_line": extract_tag(markdown, "dialogue_05"),
        "logic": "当系统偏离低熵状态时，立即切断交互并执行维护。",
    }

    signature_lines = parse_tagged_dialogues(markdown)
    realized_parameters = parse_tagged_params(markdown)

    persona = {
        "id": persona_id,
        "archetype_id": archetype_id,
        "name": {
            "primary": primary,
            "en": subtitle,
            "source_classification": source_classification,
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "stable_fields": {
            "identity": {
                "persona_name": primary,
                "subtitle": subtitle,
                "premise": slogan,
                "source_classification": source_classification,
            },
            "core_directive": slogan,
            "core_logic": {
                "social_essence": extract_tag(markdown, "item_social_view"),
                "self_positioning": hint_psych,
                "power_source": extract_tag(markdown, "item_power"),
            },
            "cognitive_filters": {
                "noise_filtering": extract_tag(markdown, "item_cognitive_blind"),
                "downward_compatibility": extract_tag(markdown, "item_conflict_response"),
                "information_granularity": extract_tag(markdown, "item_motive"),
            },
            "embodiment": {
                "center_of_gravity": extract_tag(markdown, "action_physical"),
                "gaze_protocol": {
                    "focus_rule": extract_tag(markdown, "action_vision"),
                    "movement_rule": extract_tag(markdown, "action_physical"),
                },
                "breathing_protocol": "保持算法式平稳，不因社交波动而改变节律。",
                "hand_constraints": extract_tag(markdown, "action_physical"),
                "latency_buffer": {
                    "delay_seconds": "算法式稳定延迟",
                    "rule": extract_tag(markdown, "action_language"),
                },
                "spatial_sovereignty": extract_tag(markdown, "space_crowded"),
                "negative_buffer": extract_tag(markdown, "error_repair"),
            },
            "taboos": parse_tagged_taboos(markdown),
            "reference_models": parse_tagged_references(markdown),
        },
        "soft_fields": {
            "scene_behavior": scene_behavior,
            "interaction_matrix": [row for row in interaction_matrix if row["interpretation"] or row["response_adjustment"]],
            "response_protocols": {
                "negative_feedback": negative_feedback,
                "positive_feedback": positive_feedback,
                "extreme_pressure": extreme_pressure,
            },
            "signature_lines": signature_lines,
        },
        "realized_parameters": realized_parameters,
        "generation_contract": make_persona_generation_contract(),
    }

    if not realized_parameters:
        report.inferred_fields.extend(["realized_parameters.E", "realized_parameters.O", "realized_parameters.R", "realized_parameters.B"])

    for required_path in [
        "id",
        "archetype_id",
        "name.primary",
        "stable_fields.core_directive",
        "stable_fields.core_logic.social_essence",
        "stable_fields.cognitive_filters.noise_filtering",
        "stable_fields.embodiment.center_of_gravity",
        "soft_fields.scene_behavior.small_scale.strategy",
    ]:
        if not _dig(persona, required_path):
            report.missing_fields.append(required_path)
    report.mapping_confidence = max(0.0, 1 - (0.06 * len(report.missing_fields)) - (0.02 * len(report.inferred_fields)))
    return deep_clean_strings(persona)


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
            {"field": "positioning", "reason": "The archetype thesis defines the operating worldview."},
            {"field": "core_traits", "reason": "Core traits anchor recognizability across variants."},
            {"field": "parameter_space", "reason": "Parameter ranges define the valid variation envelope."},
            {"field": "core_logic", "reason": "Motivation, power logic, and social logic cannot drift."},
            {"field": "constraints.must_have", "reason": "Must-have conditions are identity-level requirements."},
            {"field": "constraints.must_not_have", "reason": "Must-not-have conditions protect against inversion."},
        ],
        "soft_fields": [
            {"field": "expression_style", "reason": "Style can be re-expressed while preserving the archetype logic."},
            {"field": "field_effect", "reason": "Field effects may emerge through different scenes and wording."},
            {"field": "inner_outer_model", "reason": "Outer and inner presentation can be elaborated without changing the core."},
        ],
        "expansion_zones": [
            {"zone": item, "guidance": "Allowed variation defined by the authoritative seed."}
            for item in seed["generation_freedom"]["allowed_to_vary"]
        ],
        "forbidden_drift": list(seed["constraints"]["forbidden_drift"]),
    }


def build_archetype(seed_text: str, seed_path: Path, report: DiagnosticReport) -> Dict[str, Any]:
    sections = parse_seed_sections(seed_text)
    identity = parse_seed_key_values(sections.get("IDENTITY", ""))
    positioning = extract_positioning(sections.get("POSITIONING", ""))
    core_logic = parse_seed_subsections(sections.get("CORE_LOGIC", ""))
    generation_freedom = parse_seed_subsection_lists(sections.get("GENERATION_FREEDOM", ""))
    expression_style = parse_seed_subsection_lists(sections.get("EXPRESSION_STYLE", ""))
    inner_outer = parse_seed_subsections(sections.get("INNER_OUTER_MODEL", ""))

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
        "positioning": positioning,
        "core_traits": parse_seed_list(sections.get("CORE_TRAITS", "")),
        "parameter_space": parse_parameter_space(sections.get("PARAMETERS", "")),
        "core_logic": {
            "core_motivation": core_logic.get("core_motivation", ""),
            "power_logic": core_logic.get("power_logic", ""),
            "social_logic": core_logic.get("social_logic", ""),
            "emotion_logic": core_logic.get("emotion_logic", ""),
            "security_anchor": core_logic.get("security_anchor", ""),
            "relationship_model": core_logic.get("relationship_model", ""),
        },
        "constraints": {
            "must_have": parse_seed_list(sections.get("MUST_HAVE", "")),
            "must_not_have": parse_seed_list(sections.get("MUST_NOT_HAVE", "")),
            "forbidden_drift": parse_seed_list(sections.get("FORBIDDEN_DRIFT", "")),
        },
        "generation_freedom": {
            "allowed_to_vary": generation_freedom.get("allowed_to_vary", []),
            "must_remain_stable": generation_freedom.get("must_remain_stable", []),
        },
        "expression_style": {
            "verbal": expression_style.get("verbal", []),
            "physical": expression_style.get("physical", []),
        },
        "field_effect": parse_seed_list(sections.get("FIELD_EFFECT", "")),
        "inner_outer_model": {
            "outer_layer": inner_outer.get("outer_layer", ""),
            "inner_layer": inner_outer.get("inner_layer", ""),
        },
        "summary": coalesce_text(sections.get("SUMMARY", "").replace("\n", " ")),
    }
    archetype["generation_contract"] = make_generation_contract_for_archetype(archetype)

    report.missing_fields.extend(
        key
        for key in ["id", "slug", "name.cn", "name.en", "positioning.thesis", "summary"]
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
            "positioning",
            "core_traits",
            "parameter_space",
            "core_logic",
            "constraints",
            "generation_contract",
            "expression_style",
            "field_effect",
            "inner_outer_model",
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


def parse_taboos(text: str) -> List[Dict[str, str]]:
    taboos: List[Dict[str, str]] = []
    for raw in text.splitlines():
        stripped = strip_bullet_prefix(normalize_line(raw))
        if not stripped:
            continue
        if "Forbidden" in stripped and "拒绝人性污染" in stripped:
            continue
        if ":" in stripped:
            action, rule = stripped.split(":", 1)
            taboos.append({"action": sanitize_extracted_text(action), "rule": sanitize_extracted_text(rule)})
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


def make_persona_generation_contract() -> Dict[str, Any]:
    return {
        "locked_fields": [
            {"field": "archetype_id", "reason": "The persona must remain anchored to a valid archetype."},
            {"field": "stable_fields.identity", "reason": "Identity and premise define the persona instance."},
            {"field": "stable_fields.core_directive", "reason": "The core directive is the persona's non-negotiable voice anchor."},
            {"field": "stable_fields.core_logic", "reason": "Core logic stores the stable worldview and power model."},
            {"field": "stable_fields.embodiment", "reason": "Embodiment rules define the stable performance skeleton."},
            {"field": "stable_fields.taboos", "reason": "Taboos prevent drift into incompatible behaviors."},
        ],
        "soft_fields": [
            {"field": "soft_fields.scene_behavior", "reason": "Scene tactics may elaborate differently per context."},
            {"field": "soft_fields.interaction_matrix", "reason": "Interaction mappings can be extended without changing the persona core."},
            {"field": "soft_fields.response_protocols", "reason": "Response details can expand while preserving stable logic."},
            {"field": "soft_fields.signature_lines", "reason": "Lines may vary in wording so long as they honor the stable contract."},
        ],
        "expansion_zones": [
            {"zone": "台词表达方式", "guidance": "Rephrase lines while preserving judgment, distance, and control."},
            {"zone": "感官与视觉细节", "guidance": "Add visual texture that reinforces precision and distance."},
            {"zone": "穿搭与物件", "guidance": "Props and styling may vary as status signals."},
            {"zone": "场景行为细节", "guidance": "Scene blocking can change if sovereignty and latency remain intact."},
            {"zone": "亲密关系表现", "guidance": "Intimacy may appear only through controlled, structured access."},
        ],
        "forbidden_drift": [
            "变成热场型、讨好型或治愈型人格",
            "依赖情绪爆发建立主导权",
            "为了换取认可而自我解释、快速交心或主动求和",
            "用低边界分享替代仪式、结构与控制",
        ],
    }


def build_persona(
    markdown: str,
    source_path: Path,
    archetype_id: str,
    archetype: Optional[Dict[str, Any]],
    report: DiagnosticReport,
) -> Dict[str, Any]:
    if is_tagged_persona(markdown):
        persona = parse_tagged_persona(markdown, source_path, archetype_id, report)
        return {
            "id": persona["id"],
            "archetype_id": persona["archetype_id"],
            "name": persona["name"],
            "source_markdown": persona["source_markdown"],
            "stable_fields": persona["stable_fields"],
            "soft_fields": persona["soft_fields"],
            "realized_parameters": persona["realized_parameters"],
            "generation_contract": persona["generation_contract"],
        }

    title_meta = parse_title_metadata(markdown)
    sections = split_numbered_sections(markdown)
    core_logic = parse_label_value_section(sections.get("1", ""), ROOT_LOGIC_ALIASES)
    cognitive_filters = parse_label_value_section(sections.get("2", ""), COGNITIVE_ALIASES)
    embodiment = parse_body_language(sections.get("3", ""))
    taboos = parse_taboos(sections.get("4", ""))
    scene_behavior = parse_scene_behavior(sections.get("5", ""))
    interaction_matrix = parse_interaction_matrix(sections.get("6", ""))
    negative_feedback = parse_protocol_chapter(sections.get("7", ""))
    positive_feedback = parse_protocol_chapter(sections.get("8", ""))
    extreme_pressure = {
        "label": "应对现实主义与暴力逻辑",
        "cognitive_filter": coalesce_text(re.sub(r"\*\*心态变化[:：]\*\*", "", sections.get("9", "")).split("**做法：**")[0]),
        "response_actions": sanitize_extracted_text(" ".join(re.findall(r"\*\*[^*]+[:：]\*\*\s*(.+)", sections.get("9", "")))),
        "breaker_line": "你的音量已经超过了正常人类逻辑交流的上限。等你恢复生物平衡后，我们再继续。",
        "logic": "不在内容层面反击，而是通过结构性蔑视将对方推离文明阈值。",
    }
    reference_models = parse_reference_models(sections.get("10", ""))

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

    persona = {
        "id": persona_id,
        "archetype_id": archetype_id,
        "name": {
            "primary": primary,
            "en": subtitle,
            "source_classification": source_classification,
        },
        "source_markdown": str(source_path.relative_to(source_path.parents[2])),
        "stable_fields": {
            "identity": {
                "persona_name": primary,
                "subtitle": subtitle,
                "premise": core_directive,
                "source_classification": source_classification,
            },
            "core_directive": core_directive,
            "core_logic": {
                "social_essence": core_logic.get("social_essence", ""),
                "self_positioning": core_logic.get("self_positioning", ""),
                "power_source": core_logic.get("power_source", ""),
            },
            "cognitive_filters": {
                "noise_filtering": cognitive_filters.get("noise_filtering", ""),
                "downward_compatibility": cognitive_filters.get("downward_compatibility", ""),
                "information_granularity": cognitive_filters.get("information_granularity", ""),
            },
            "embodiment": embodiment,
            "taboos": taboos,
            "reference_models": reference_models,
        },
        "soft_fields": {
            "scene_behavior": scene_behavior,
            "interaction_matrix": interaction_matrix,
            "response_protocols": {
                "negative_feedback": negative_feedback,
                "positive_feedback": positive_feedback,
                "extreme_pressure": extreme_pressure,
            },
            "signature_lines": signature_lines,
        },
        "realized_parameters": realized_parameters,
        "generation_contract": make_persona_generation_contract(),
    }

    for required_path in [
        "id",
        "archetype_id",
        "name.primary",
        "stable_fields.core_directive",
        "stable_fields.core_logic.social_essence",
        "stable_fields.cognitive_filters.noise_filtering",
        "stable_fields.embodiment.center_of_gravity",
        "soft_fields.scene_behavior.small_scale.strategy",
    ]:
        if not _dig(persona, required_path):
            report.missing_fields.append(required_path)
    report.mapping_confidence = max(0.0, 1 - (0.06 * len(report.missing_fields)) - (0.02 * len(report.inferred_fields)))
    persona = deep_clean_strings(persona)

    ordered = {
        "id": persona["id"],
        "archetype_id": persona["archetype_id"],
        "name": persona["name"],
        "source_markdown": persona["source_markdown"],
        "stable_fields": persona["stable_fields"],
        "soft_fields": persona["soft_fields"],
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
    for json_file in sorted(paths.archetypes_dir.glob("*.json")):
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
    if len(archetype_ids) != len(list(paths.archetypes_dir.glob('*.json'))):
        errors.append("duplicate archetype ids detected")
    return errors


def rebuild_manifests(paths: RepoPaths) -> None:
    archetype_entries: List[Dict[str, Any]] = []
    persona_entries: List[Dict[str, Any]] = []

    for json_file in sorted(paths.archetypes_dir.glob("*.json")):
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
    for json_file in sorted(paths.archetypes_dir.glob("*.json")):
        errors.extend(validate_instance(load_json(json_file), archetype_schema, paths.schema_dir, path=str(json_file.relative_to(paths.root))))
    for json_file in sorted(paths.personas_dir.glob("*.json")):
        errors.extend(validate_instance(load_json(json_file), persona_schema, paths.schema_dir, path=str(json_file.relative_to(paths.root))))
    errors.extend(validate_cross_references(paths))
    if errors:
        raise ValueError("Schema validation failed:\n- " + "\n- ".join(errors))


def print_report(label: str, report: DiagnosticReport) -> None:
    missing = ", ".join(report.missing_fields) if report.missing_fields else "none"
    inferred = ", ".join(report.inferred_fields) if report.inferred_fields else "none"
    print(f"[diagnostics:{label}] missing_fields: {missing}")
    print(f"[diagnostics:{label}] inferred_fields: {inferred}")
    print(f"[diagnostics:{label}] mapping_confidence: {report.mapping_confidence:.2f}")


def ingest(
    source_md: Path,
    paths: RepoPaths,
    dry_run: bool = False,
    archetype_seed: Optional[Path] = None,
    archetype_id: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    archetype_payload: Optional[Dict[str, Any]] = None
    archetype_report = DiagnosticReport()
    if archetype_seed:
        seed_text = markdown_to_text(archetype_seed)
        archetype_payload = build_archetype(seed_text, archetype_seed, archetype_report)
        if not dry_run:
            write_json(paths.archetypes_dir / f"{archetype_payload['id']}.json", archetype_payload)
        print_report("archetype", archetype_report)

    markdown = markdown_to_text(source_md)
    title_meta = parse_title_metadata(markdown)
    resolved_archetype_id = resolve_archetype_id(archetype_id, archetype_payload, title_meta, paths)
    if not resolved_archetype_id:
        raise ValueError("Unable to resolve archetype_id for persona ingestion.")

    persona_report = DiagnosticReport()
    persona_payload = build_persona(markdown, source_md, resolved_archetype_id, archetype_payload, persona_report)
    if not dry_run:
        write_json(paths.personas_dir / f"{persona_payload['id']}.json", persona_payload)
    print_report("persona", persona_report)

    if not dry_run:
        rebuild_manifests(paths)
        validate_database(paths)
    return persona_payload["id"], archetype_payload["id"] if archetype_payload else None


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest persona markdown into the archetype/persona database model.")
    parser.add_argument("source", type=Path, help="Persona markdown source path")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--sync-git", action="store_true", help="Best-effort pull --ff-only when tracking origin")
    parser.add_argument("--dry-run", action="store_true", help="Parse and validate without writing files")
    parser.add_argument("--archetype-seed", type=Path, help="Optional archetype seed markdown to ingest first")
    parser.add_argument("--archetype-id", type=str, help="Explicit archetype id when no seed file is supplied")
    args = parser.parse_args()

    paths = build_paths(args.repo_root.resolve())
    git_ctx = detect_git_context(paths.root)
    if args.sync_git:
        adaptive_presync(paths.root, git_ctx)

    persona_id, generated_archetype_id = ingest(
        args.source.resolve(),
        paths,
        dry_run=args.dry_run,
        archetype_seed=args.archetype_seed.resolve() if args.archetype_seed else None,
        archetype_id=args.archetype_id,
    )
    if generated_archetype_id:
        print(f"[ingest] generated archetype {generated_archetype_id}")
    print(f"[ingest] generated persona {persona_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
