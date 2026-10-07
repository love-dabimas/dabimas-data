"""Validated game masters and the adapter to the existing workbook generator."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

FILES = {
    "stallions": "stallion_master.game.json",
    "broodmares": "broodmare_master.game.json",
    "pedigrees": "pedigree_master.json",
    "nodes": "pedigree_master.game.json",
    "abilities": "ability_master.game.json",
}
SLOTS = "t tt ttt tttt ttht tht thtt thht ht htt httt htht hht hhtt hhht".split()
JST = timezone(timedelta(hours=9))
LOG = logging.getLogger(__name__)


class DatasetVersionMismatch(ValueError):
    """The five masters do not belong to one complete published dataset."""


def publication_cutoff(as_of: str | None = None) -> datetime:
    day = date.fromisoformat(as_of) if as_of else datetime.now(JST).date()
    return datetime.combine(day, time(11, 30), JST)


def is_published(horse: dict, cutoff: datetime) -> bool:
    value = horse.get("display_start_at")
    if value is None:
        return True
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.tzinfo is None:
        raise ValueError("display_start_at must include a timezone")
    return timestamp <= cutoff


def load_r2(directory: Path) -> dict:
    payloads = {key: json.loads((directory / filename).read_text(encoding="utf-8"))
                for key, filename in FILES.items()}
    versions = {payload.get("dataset_version") for payload in payloads.values()}
    if len(versions) != 1 or not next(iter(versions)):
        raise DatasetVersionMismatch("R2 dataset_version mismatch or missing")
    data = {key: payload[key] for key, payload in payloads.items()}
    data["dataset_version"] = next(iter(versions))
    validate_r2(data)
    return data


def index_rows(rows: list[dict], key: str) -> dict:
    result = {str(row[key]): row for row in rows}
    if len(result) != len(rows):
        raise ValueError(f"Duplicate R2 {key}")
    return result


def validate_r2(data: dict) -> None:
    pedigrees = index_rows(data["pedigrees"], "pedigree_id")
    nodes = index_rows(data["nodes"], "node_id")
    abilities = index_rows(data["abilities"], "game_ability_id")
    for kind, id_field in (("stallions", "game_stallion_id"), ("broodmares", "game_broodmare_id")):
        index_rows(data[kind], id_field)
        for horse in data[kind]:
            node = nodes.get(str(horse["node_id"]))
            if (str(horse["pedigree_id"]) not in pedigrees or node is None
                    or str(node["pedigree_id"]) != str(horse["pedigree_id"])):
                raise ValueError(f"Missing/inconsistent pedigree reference: {horse[id_field]}")
            for field in ("nonordinary_ability_id", "sub_ability_id"):
                ability_id = str(horse.get(field) or "0")
                if ability_id != "0" and ability_id not in abilities:
                    raise ValueError(f"Unknown {field}: {ability_id}")
    for row in [*data["nodes"], *data["pedigrees"]]:
        for factor in row.get("pedigree_effect_ids") or []:
            if type(factor) is not int or not 1 <= factor <= 14:
                raise ValueError(f"Invalid pedigree_effect_ids: {factor}")


def check_population(current: int, previous: int) -> None:
    if current * 100 < previous * 99:
        raise ValueError(f"Published stallions decreased by more than 1%: {previous} -> {current}")


def lines(value: object) -> list[str]:
    values = value if isinstance(value, list) else [value]
    return [line.lstrip() for item in values if item is not None
            for line in str(item).splitlines() if line.strip()]


def skill_card(ability: dict | None, url: str = "") -> dict | None:
    if not ability:
        return None
    details = ability.get("details") or []
    if ability.get("level_max"):
        groups = [("レベル 1", details), ("レベル MAX", ability["level_max"].get("details") or [])]
    elif len(details) >= 2:
        groups = [(f"その{i}", [detail]) for i, detail in enumerate(details, 1)]
    else:
        groups = [("詳細", details)]
    tabs = []
    for label, group in groups:
        tab = {"label": label}
        for field in ("effects", "conditions", "targets", "probability"):
            tab[field] = [line for detail in group for line in lines(detail.get(field))]
        tab["probability"] = ["・" + line.removeprefix("・") for line in tab["probability"]]
        tabs.append(tab)
    return {"name": ability["name"], "description": lines(ability.get("description")),
            "detailUrl": url, "detailTabs": tabs}


def known_ability_urls(abilities: list[dict], metadata: dict) -> dict[str, str]:
    from tools.horse_data.id_ledger import normalize, ability_identity
    catalog = {}
    for horse in metadata.values():
        for field, kind in (("extraordinaryAbility", "nonordinary"), ("innateTalent", "innate")):
            skill = horse.get(field) or {}
            if skill.get("detailUrl"):
                key = (kind, normalize(skill.get("name")), ability_identity(skill.get("description")))
                catalog.setdefault(key, set()).add(skill["detailUrl"])
    urls = {}
    for ability in abilities:
        candidates = catalog.get((ability.get("ability_type"), normalize(ability["name"]),
                                  ability_identity(ability.get("description"))), set())
        if len(candidates) == 1:
            urls[str(ability["game_ability_id"])] = next(iter(candidates))
    return urls


def convert_source(data: dict, ledger: dict, official: dict, metadata: dict,
                   as_of: str | None = None, ability_urls: dict | None = None,
                   previous: list[dict] | None = None) -> tuple[dict, dict]:
    from tools.horse_data import generate_horselist as g
    from tools.horse_data.id_ledger import horse_names, normalize

    pedigrees = index_rows(data["pedigrees"], "pedigree_id")
    nodes = index_rows(data["nodes"], "node_id")
    abilities = index_rows(data["abilities"], "game_ability_id")
    cutoff = publication_cutoff(as_of)
    rows, horse_metadata = [], dict(metadata)
    ability_urls = {**known_ability_urls(data["abilities"], metadata), **(ability_urls or {})}
    previous_serials = {(row["Gender"], row["HorseId"]): row["SerialNumber"] for row in previous or []}
    official_urls = g.build_url_by_serial(official["horse_list"])

    def lineage(pedigree_id: str) -> dict:
        visited = set()
        while pedigree_id in pedigrees and pedigree_id not in visited:
            visited.add(pedigree_id)
            pedigree = pedigrees[pedigree_id]
            if pedigree.get("child_sire_line"):
                return pedigree
            pedigree_id = str(pedigree.get("father_pedigree_id"))
        return {}

    for gender, kind, id_field in (("0", "stallions", "game_stallion_id"), ("1", "broodmares", "game_broodmare_id")):
        names = {name for horse in data[kind] for name in horse_names(horse, nodes)}
        for horse in sorted(data[kind], key=lambda h: int(ledger[kind][str(h[id_field])]["SerialNumber"])):
            if not is_published(horse, cutoff):
                continue
            identity = ledger[kind][str(horse[id_field])]
            row = [""] * 112

            def put(column: int, value: object) -> None:
                row[column - 1] = value

            put(g.COL_GENDER, gender)
            put(g.COL_SERIAL_NUMBER, identity["SerialNumber"])
            put(g.COL_HORSE_ID, identity["HorseId"])
            put(g.COL_HORSE_NAME, horse["name"])
            pedigree = pedigrees[str(horse["pedigree_id"])]
            node = nodes[str(horse["node_id"])]
            put(g.COL_PARENT_LINE, (lineage(str(horse["pedigree_id"])).get("child_sire_line") or {}).get("name", ""))
            factors = node.get("pedigree_effect_ids") or pedigree.get("pedigree_effect_ids") or []
            for i, factor in enumerate(factors[:3]):
                put(g.COL_FACTOR_NAME_1 + i, f"{factor:02}")
            if gender == "0":
                put(g.COL_RARE, horse["rarity"])
                put(g.COL_ICON, (horse.get("header_badge") or {}).get("asset_key") or "")
                put(g.COL_TALENT_SLOTS, horse["talent_slot_count"])
                distance = horse.get("distance") or {}
                put(g.COL_DISTANCE_MIN, f'{distance.get("min", "")}〜{distance.get("max", "")}')
                put(g.COL_GROWTH, horse.get("growth"))
                put(g.COL_RUNNING_STYLE, horse.get("running_style"))
                put(g.COL_DIRT, {"△": 1, "〇": 2, "○": 2, "◎": 3}.get(horse.get("dirt"), ""))
                for column, field in ((g.COL_HEALTH, "health"), (g.COL_CLEMENCY, "temperament"),
                                      (g.COL_ACHIEVEMENT, "achievement"), (g.COL_POTENTIAL, "potential"), (g.COL_STABLE, "stability")):
                    put(column, {"A": 1, "B": 2, "C": 3}.get(horse.get(field), ""))
            else:
                grade = horse["broodmare_grade"]
                if not grade["exchange_ticket_eligible"]:
                    put(g.COL_RARE, 1)
                    put(g.COL_ICON, f'list_icn_cat_sale_{dict(X="05", W="06", V="07", U="08", Y="09")[grade["code"]]}.png')
            for slot, path in enumerate(SLOTS):
                ancestor_id = str(horse["pedigree_id"])
                for step in path:
                    ancestor_id = str(pedigrees.get(ancestor_id, {}).get("father_pedigree_id" if step == "t" else "mother_pedigree_id"))
                ancestor = pedigrees.get(ancestor_id)
                if ancestor is None:
                    LOG.warning("Missing ancestor: %s %s", identity["HorseId"], path)
                    continue
                line = lineage(ancestor_id)
                put(g.COL_NAME_T + slot, ancestor.get("pedigree_name") or ancestor.get("canonical_name", ""))
                put(g.COL_PARENT_LINE_T + slot, (line.get("parent_sire_line") or {}).get("name", ""))
                put(g.COL_SON_T + slot, (line.get("child_sire_line") or {}).get("name", ""))
                for i, factor in enumerate((nodes.get(ancestor_id + "-00", {}).get("pedigree_effect_ids") or [])[:3]):
                    put(g.COL_FACTOR_T1 + slot * 3 + i, f"{factor:02}")
            ability_id = str(horse.get("nonordinary_ability_id") or "0")
            ability = abilities.get(ability_id)
            innate_id = str(horse.get("sub_ability_id") or "0")
            innate = abilities.get(innate_id)
            if innate and innate.get("ability_type") != "innate":
                raise ValueError(f"sub_ability_id is not innate: {innate_id}")
            put(g.COL_ABILITY, ability["name"] if ability else "")
            horse_metadata[g.horse_metadata_key(gender, identity["HorseId"])] = {
                "extraordinaryAbility": skill_card(ability, ability_urls.get(ability_id, "")),
                "innateTalent": skill_card(innate, ability_urls.get(innate_id, "")),
                "abilityGameId": ability_id if ability else None,
                "sourceGameId": str(horse[id_field]),
                "legacy_ids": identity.get("legacy_ids", []),
            }
            rows.append(row)
        used_serials = {int(entry["SerialNumber"]) for entry in ledger[kind].values()}
        next_serial = max([0, *used_serials, *[int(serial) for (sex, _), serial in previous_serials.items() if sex == gender]])
        for row in g.iter_all_rows(official["all"]):
            if g.row_value(row, g.COL_GENDER) == gender and normalize(g.row_value(row, g.COL_HORSE_NAME)) not in names:
                row = list(row)
                horse_id = g.compute_horse_id(g.row_value(row, g.COL_SERIAL_NUMBER), row, official_urls)
                serial = previous_serials.get((gender, horse_id), g.row_value(row, g.COL_SERIAL_NUMBER))
                if int(serial) in used_serials:
                    next_serial += 1
                    serial = f"{next_serial:05}"
                used_serials.add(int(serial))
                next_serial = max(next_serial, int(serial))
                row[g.COL_HORSE_ID], row[g.COL_SERIAL_NUMBER] = horse_id, serial
                rows.append(row[1:])
    return {"all": rows, "horse_list": official["horse_list"]}, horse_metadata
