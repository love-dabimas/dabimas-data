"""Match official ability IDs to game IDs without guessing ambiguous versions."""
from __future__ import annotations

import argparse
import json
import logging
import re
from pathlib import Path

from tools.horse_data.id_ledger import normalize, ability_identity

DEFAULT_LINKS = Path("data/source/ability_links.json")


def build_links(abilities: list[dict], bundle: dict, overrides: list[dict], metadata: dict | None = None) -> list[dict]:
    official_by_id = {row["ability_id"]: row for row in bundle["abilities"]}
    game_by_id = {str(row["game_ability_id"]): row for row in abilities if row.get("ability_type") == "nonordinary"}
    manual = {}
    for link in overrides:
        official_id, game_id = str(link["ability_id"]), str(link["game_ability_id"])
        if official_id not in official_by_id or game_id not in game_by_id:
            raise ValueError(f"Unknown ability override: {link}")
        if game_id in manual:
            raise ValueError(f"Duplicate ability override: {game_id}")
        if normalize(official_by_id[official_id]["ability_name"]) != normalize(game_by_id[game_id]["name"]):
            raise ValueError(f"Ability override name mismatch: {link}")
        manual[game_id] = official_id
    details = {}
    for detail in bundle["ability_details"]:
        details.setdefault(detail["ability_id"], []).append(detail)
    official_tabs = {}
    for horse in (metadata or {}).values():
        skill = horse.get("extraordinaryAbility") or {}
        match = re.search(r"/([0-9]+)\.html$", skill.get("detailUrl", ""))
        if match and skill.get("detailTabs"):
            official_tabs[match.group(1)] = skill["detailTabs"]
    result = []
    for game_id, ability in game_by_id.items():
        candidates = [row for row in bundle["abilities"]
                      if normalize(row["ability_name"]) == normalize(ability["name"])
                      and ability_identity(row.get("description")) == ability_identity(ability.get("description"))]
        if len(candidates) > 1:
            def signature(rows: list[dict], game: bool) -> tuple[str, str]:
                return tuple(normalize([row.get(field) for row in rows]) if not game else
                             normalize([line for row in rows for line in row.get(field, [])])
                             for field in (("effects", "conditions") if game else ("effect_raw", "condition_raw")))
            expected = signature(ability.get("details", []), True)
            candidates = [row for row in candidates
                          if (signature(official_tabs[row["ability_id"]], True) if row["ability_id"] in official_tabs
                              else signature(details.get(row["ability_id"], []), False)) == expected]
        official_id = manual.get(game_id)
        if official_id is None and len(candidates) == 1:
            official_id = candidates[0]["ability_id"]
        if official_id:
            result.append({"ability_id": official_id, "game_ability_id": game_id})
        else:
            logging.getLogger(__name__).warning("Unlinked ability: %s %s", game_id, ability["name"])
    return sorted(result, key=lambda row: (row["ability_id"], row["game_ability_id"]))


def main() -> int:
    from tools.horse_data.generate_horselist import write_text
    from tools.horse_data.r2_source import load_r2
    from tools.horse_data.site_metadata import load_site_metadata
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--r2-dir", type=Path, required=True)
    parser.add_argument("--bundle", type=Path, default=Path("json/nonordinary_abilities_bundle.json"))
    parser.add_argument("--output", type=Path, default=DEFAULT_LINKS)
    parser.add_argument("--overrides", type=Path, default=Path("data/source/ability_links_override.json"))
    parser.add_argument("--site-metadata", type=Path, default=Path("data/source/site_metadata.json"))
    args = parser.parse_args()
    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    overrides = json.loads(args.overrides.read_text(encoding="utf-8"))
    links = build_links(load_r2(args.r2_dir)["abilities"], bundle, overrides, load_site_metadata(args.site_metadata))
    bundle["ability_game_links"] = links
    write_text(args.output, json.dumps(links, ensure_ascii=False, indent=2) + "\n")
    write_text(args.bundle, json.dumps(bundle, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
