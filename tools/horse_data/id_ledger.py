"""Stable identities shared by the initial migration and weekly reconciliation."""
from __future__ import annotations

import argparse
import copy
import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

LOG = logging.getLogger(__name__)
DEFAULT_LEDGER = Path("data/source/id_ledger.json")


def normalize(value: object) -> str:
    if isinstance(value, list):
        value = "".join(str(item) for item in value)
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or ""))).casefold()


def ability_identity(value: object) -> str:
    # The official search excerpt omits punctuation such as trailing ellipses.
    return re.sub(r"\W+", "", normalize(value))


def horse_names(horse: dict, nodes: dict) -> set[str]:
    node = nodes.get(str(horse.get("node_id")), {})
    name, subname = node.get("name", ""), node.get("subname", "")
    names = {horse["name"], name}
    if subname:
        names.update((name + subname, f"{name}-{subname}-"))
    return {normalize(name) for name in names if name}


def load_ledger(path: Path) -> dict:
    if not path.exists():
        return {"version": 1, "stallions": {}, "broodmares": {}}
    ledger = json.loads(path.read_text(encoding="utf-8"))
    validate_ledger(ledger)
    return ledger


def validate_ledger(ledger: dict) -> None:
    if ledger.get("version") != 1:
        raise ValueError("Unsupported ID ledger version")
    for kind in ("stallions", "broodmares"):
        entries = ledger[kind].values()
        for field in ("HorseId", "SerialNumber"):
            values = [entry[field] for entry in entries]
            if len(values) != len(set(values)) or any(not str(value) for value in values):
                raise ValueError(f"Duplicate or empty {kind} {field}")


def official_horses(source: dict, metadata: dict) -> list[dict]:
    from tools.horse_data import generate_horselist as g
    urls = g.build_url_by_serial(source["horse_list"])
    horses = []
    for row in g.iter_all_rows(source["all"]):
        serial = g.row_value(row, g.COL_SERIAL_NUMBER)
        horse_id = g.compute_horse_id(serial, row, urls)
        gender = g.row_value(row, g.COL_GENDER)
        horses.append({"HorseId": horse_id, "SerialNumber": serial,
                       "Gender": gender, "name": g.row_value(row, g.COL_HORSE_NAME),
                       "rarity": g.row_value(row, g.COL_RARE),
                       "ability": metadata.get(horse_id, {}).get("extraordinaryAbility") if gender == "0" else None})
    return horses


def candidates_for(official: dict, candidates: list[dict], abilities: dict) -> list[dict]:
    # A node's base-name alias must not steal the ID of an explicitly named variant.
    exact = [horse for horse in candidates if normalize(horse["name"]) == normalize(official["name"])]
    candidates = exact or candidates
    if len(candidates) > 1 and official["rarity"].isdigit():
        rarity = min(5, int(official["rarity"]))
        narrowed = [h for h in candidates if int(h.get("rarity") or 0) == rarity]
        candidates = narrowed or candidates
    if len(candidates) > 1:
        skill = official["ability"]
        if skill:
            narrowed = [h for h in candidates if (ability := abilities.get(str(h.get("nonordinary_ability_id"))))
                        and normalize(ability["name"]) == normalize(skill.get("name"))
                        and ability_identity(ability.get("description")) == ability_identity(skill.get("description"))]
            if len(narrowed) > 1:
                effects = normalize([line for tab in skill.get("detailTabs", []) for line in tab.get("effects", [])])
                by_effect = [h for h in narrowed if normalize([line for detail in abilities[str(h["nonordinary_ability_id"])].get("details", [])
                                                             for line in detail.get("effects", [])]) == effects]
                narrowed = by_effect or narrowed
        else:
            narrowed = [h for h in candidates if str(h.get("nonordinary_ability_id") or "0") == "0"]
        candidates = narrowed or candidates
    return candidates


def update_ledger(ledger: dict, data: dict, source: dict, metadata: dict,
                  *, initial: bool = False, previous: list[dict] | None = None) -> dict:
    """Return a copy; daily generation never writes the weekly ledger.

    Previously published rows reserve daily allocations until the weekly writer
    persists them. This keeps IDs/serials stable when R2 adds rows between Fridays.
    """
    from tools.horse_data.r2_source import index_rows
    result = copy.deepcopy(ledger)
    nodes = index_rows(data["nodes"], "node_id")
    abilities = index_rows(data["abilities"], "game_ability_id")
    officials = official_horses(source, metadata)
    published_serials = {(row["Gender"], row["HorseId"]): row["SerialNumber"] for row in previous or []}
    for official in officials:
        official["SerialNumber"] = published_serials.get((official["Gender"], official["HorseId"]), official["SerialNumber"])
    for gender, kind, id_field, prefix in (("0", "stallions", "game_stallion_id", "r"),
                                          ("1", "broodmares", "game_broodmare_id", "rb")):
        entries = result[kind]
        for row in previous or []:
            game_id = (row.get("card") or {}).get("sourceGameId")
            if row["Gender"] == gender and game_id and str(game_id) not in entries:
                entries[str(game_id)] = {"HorseId": row["HorseId"], "SerialNumber": row["SerialNumber"],
                                         "source": "published", "legacy_ids": row.get("legacy_ids", [])}
        by_name = {}
        for horse in data[kind]:
            for name in horse_names(horse, nodes):
                by_name.setdefault(name, []).append(horse)
        current_officials = sorted((h for h in officials if h["Gender"] == gender), key=lambda h: int(h["SerialNumber"]))
        max_serial = max([0, *[int(e["SerialNumber"]) for e in entries.values()],
                          *[int(h["SerialNumber"]) for h in current_officials],
                          *[int(h["SerialNumber"]) for h in previous or [] if h["Gender"] == gender]])
        assigned_officials = {str(i) for entry in entries.values() for i in [entry["HorseId"], *entry.get("legacy_ids", [])]}
        for official in current_officials:
            if official["HorseId"] in assigned_officials:
                continue
            candidates = candidates_for(official, by_name.get(normalize(official["name"]), []), abilities)
            if len(candidates) > 1:
                LOG.warning("Ambiguous official horse: %s %s (%d candidates)", official["HorseId"], official["name"], len(candidates))
                if not initial:
                    continue
                candidates = [h for h in candidates if str(h[id_field]) not in entries]
                candidates.sort(key=lambda h: (datetime.fromisoformat(h["display_start_at"].replace("Z", "+00:00"))
                                               if h.get("display_start_at") else datetime.min.replace(tzinfo=timezone.utc), int(h[id_field])))
                candidates = candidates[:1]
            if len(candidates) != 1:
                continue
            game_id = str(candidates[0][id_field])
            if game_id in entries:
                entries[game_id].setdefault("legacy_ids", []).append(official["HorseId"])
            else:
                serial = official["SerialNumber"]
                if any(e["SerialNumber"] == serial for e in entries.values()):
                    max_serial += 1
                    serial = f"{max_serial:05}"
                entries[game_id] = {"HorseId": official["HorseId"], "SerialNumber": serial, "source": "official_link"}
            assigned_officials.add(official["HorseId"])
        for horse in sorted(data[kind], key=lambda h: int(h[id_field])):
            game_id = str(horse[id_field])
            if game_id not in entries:
                max_serial += 1
                entries[game_id] = {"HorseId": prefix + game_id, "SerialNumber": f"{max_serial:05}", "source": "r2"}
    validate_ledger(result)
    return result


def main() -> int:
    from tools.horse_data.generate_horselist import load_source_json, write_text
    from tools.horse_data.r2_source import load_r2
    from tools.horse_data.site_metadata import load_site_metadata
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--r2-dir", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, default=DEFAULT_LEDGER)
    parser.add_argument("--source-json", type=Path, default=Path("data/source/workbook.json"))
    parser.add_argument("--site-metadata", type=Path, default=Path("data/source/site_metadata.json"))
    parser.add_argument("--previous", type=Path, default=Path("json/horselist.json"))
    parser.add_argument("--initial", action="store_true")
    args = parser.parse_args()
    if args.initial and args.ledger.exists():
        raise ValueError("Initial migration requires a new ledger path")
    ledger = update_ledger(load_ledger(args.ledger), load_r2(args.r2_dir), load_source_json(args.source_json),
                           load_site_metadata(args.site_metadata), initial=args.initial,
                           previous=json.loads(args.previous.read_text(encoding="utf-8")) if args.previous.exists() else [])
    write_text(args.ledger, json.dumps(ledger, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
