from __future__ import annotations

import json
from pathlib import Path


DEFAULT_SITE_METADATA_PATH = Path("data/source/site_metadata.json")


def serialize_site_metadata(horses: dict[str, object]) -> str:
    return json.dumps(
        {"version": 1, "horses": horses},
        ensure_ascii=False,
        separators=(",", ":"),
    )


def load_site_metadata(path: Path | None) -> dict[str, dict[str, object]]:
    if path is None or not path.exists():
        return {}

    payload = json.loads(path.read_text(encoding="utf-8"))
    horses = payload.get("horses") if isinstance(payload, dict) else None
    if not isinstance(horses, dict):
        return {}

    return {
        str(horse_id): value
        for horse_id, value in horses.items()
        if isinstance(value, dict)
    }


def default_site_metadata_for_source(source_json_path: Path) -> Path | None:
    candidate = source_json_path.with_name("site_metadata.json")
    return candidate if candidate.exists() else None


def default_site_metadata_for_workbook(workbook_path: Path) -> Path | None:
    candidate = workbook_path.with_name(DEFAULT_SITE_METADATA_PATH.name)
    return candidate if candidate.exists() else None
