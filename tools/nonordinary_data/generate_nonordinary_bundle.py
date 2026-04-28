from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag


ABILITIES_URL = "https://dabimas.jp/kouryaku/abilities/"
ABILITY_TYPE_NONORDINARY = 1
DEFAULT_RAW_HTML_PATH = Path("data/nonordinary/raw/official_search/abilities.html")
DEFAULT_OUTPUT_PATH = Path("json/nonordinary_abilities_bundle.json")

RACECOURSE_BY_ID = {
    1: "中山",
    2: "東京",
    3: "阪神",
    4: "小倉",
    5: "新潟",
    6: "福島",
    7: "京都",
    8: "中京",
    9: "函館",
    10: "札幌",
    11: "ロンシャン",
    12: "メイダン",
    13: "シャティン",
    14: "大井",
    15: "大井（夜）",
}
SURFACE_BY_ID = {0: "芝", 1: "ダート"}
GOING_BY_ID = {1: "良", 2: "稍重", 3: "重", 4: "不良"}
WEATHER_BY_ID = {1: "晴", 2: "曇", 3: "雨", 4: "雪"}
TACTIC_BY_ID = {1: "逃げ", 2: "先行", 3: "差し", 4: "追込", 6: "マーク"}


def now_jst_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def fetch_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; dabimasData nonordinary builder; "
                "+https://github.com/)"
            )
        },
    )
    with urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8")


def load_or_fetch_html(path: Path, refresh: bool) -> str:
    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")

    html = fetch_text(ABILITIES_URL)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8", newline="\n")
    return html


def extract_js_value(script: str, key: str) -> str:
    marker = f"{key}:"
    start = script.index(marker) + len(marker)
    while start < len(script) and script[start].isspace():
        start += 1

    opening = script[start]
    if opening not in "{[":
        raise ValueError(f"Expected object or array for {key}.")

    stack: list[str] = []
    close_for = {"{": "}", "[": "]"}
    in_string = False
    escaped = False

    for index in range(start, len(script)):
        char = script[index]

        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char in close_for:
            stack.append(close_for[char])
        elif stack and char == stack[-1]:
            stack.pop()
            if not stack:
                return script[start : index + 1]

    raise ValueError(f"Could not find end of JS value for {key}.")


def parse_vue_data(soup: BeautifulSoup) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    scripts = [
        script.get_text("\n")
        for script in soup.find_all("script")
        if "ability_conditions" in script.get_text()
    ]
    if not scripts:
        raise ValueError("Could not find Vue ability condition data.")

    script = scripts[0]
    ability_conditions = json.loads(extract_js_value(script, "ability_conditions"))
    races = json.loads(extract_js_value(script, "races"))
    association_races = json.loads(extract_js_value(script, "association_races"))
    return ability_conditions, races, association_races


def normalized_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def text_lines(node: Tag) -> list[str]:
    lines: list[str] = []
    for raw_line in node.get_text("\n").splitlines():
        line = raw_line.strip().strip("・").strip()
        if line:
            lines.append(line)
    return lines


def section_lines(panel: Tag, label_prefix: str) -> list[str]:
    lines: list[str] = []
    for heading in panel.select(".th"):
        label = normalized_text(heading.get_text(" "))
        if not label.startswith(label_prefix):
            continue

        parent = heading.parent
        if not isinstance(parent, Tag):
            continue

        section = []
        for paragraph in parent.find_all("p"):
            section.extend(text_lines(paragraph))
        if section:
            if label != label_prefix:
                lines.append(label)
            lines.extend(section)

    return lines


def first_text(panel: Tag, selector: str) -> str:
    node = panel.select_one(selector)
    return normalized_text(node.get_text(" ")) if node else ""


def parse_race_filter_options(soup: BeautifulSoup) -> list[dict[str, Any]]:
    select = soup.select_one('select[v-model="race"]')
    if select is None:
        raise ValueError("Could not find race select.")

    options: list[dict[str, Any]] = []
    for sort_order, option in enumerate(select.find_all("option")):
        value = option.get("value", "")
        race_name = normalized_text(option.get_text(" "))
        is_all = value in {"", "all"} or race_name == "すべて"
        options.append(
            {
                "sort_order": sort_order,
                "race_id": None if is_all else value,
                "race_name": race_name,
                "is_all": is_all,
            }
        )
    return options


def convert_race(row: dict[str, Any]) -> dict[str, Any]:
    race_id = str(row["code"])
    distance = row.get("distance")
    surface = row.get("course_surface")
    raw_course = f"{distance}m({surface})" if distance and surface else None
    return {
        "race_id": race_id,
        "race_name": row.get("name") or race_id,
        "racecourse": row.get("racecourse"),
        "surface": surface,
        "distance": distance,
        "raw_course": raw_course,
        "source_url": f"https://dabimas.jp/kouryaku/races/{race_id}.html",
    }


def add_rule(
    rules: list[dict[str, Any]],
    *,
    ability_id: str,
    detail_id: str,
    group_id: str,
    index: int,
    field: str,
    operator: str,
    value_text: str | None = None,
    value_number: int | None = None,
    min_number: int | None = None,
    max_number: int | None = None,
    raw_text: str = "",
) -> int:
    op = {
        "range_include": "range",
        "eq": "equals",
    }.get(operator, operator)
    row = {
        "rule_id": f"{group_id}_r{index:02d}",
        "ability_id": ability_id,
        "detail_id": detail_id,
        "condition_group_id": group_id,
        "group_id": group_id,
        "group_no": 1,
        "field": field,
        "operator": operator,
        "op": op,
        "value_text": value_text,
        "value_number": value_number,
        "value_num": value_number,
        "min_number": min_number,
        "min_num": min_number,
        "max_number": max_number,
        "max_num": max_number,
        "raw_text": raw_text,
        "raw": raw_text,
        "parse_status": "parsed",
    }
    rules.append(row)
    return index + 1


def append_value_rules(
    rules: list[dict[str, Any]],
    *,
    ability_id: str,
    detail_id: str,
    group_id: str,
    start_index: int,
    field: str,
    values: list[Any] | None,
    labels: dict[int, str] | dict[str, str],
    raw_prefix: str,
) -> int:
    index = start_index
    for value in values or []:
        label = labels.get(value) or labels.get(str(value)) or str(value)
        index = add_rule(
            rules,
            ability_id=ability_id,
            detail_id=detail_id,
            group_id=group_id,
            index=index,
            field=field,
            operator="include",
            value_text=label,
            raw_text=f"{raw_prefix}: {label}",
        )
    return index


def build_condition_rules(
    ability_id: str,
    detail_id: str,
    group_id: str,
    condition: dict[str, Any],
    races_by_code: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    index = 1
    index = append_value_rules(
        rules,
        ability_id=ability_id,
        detail_id=detail_id,
        group_id=group_id,
        start_index=index,
        field="racecourse",
        values=condition.get("racecourses"),
        labels=RACECOURSE_BY_ID,
        raw_prefix="競馬場",
    )
    index = append_value_rules(
        rules,
        ability_id=ability_id,
        detail_id=detail_id,
        group_id=group_id,
        start_index=index,
        field="surface",
        values=condition.get("course_surfaces"),
        labels=SURFACE_BY_ID,
        raw_prefix="コース",
    )
    index = append_value_rules(
        rules,
        ability_id=ability_id,
        detail_id=detail_id,
        group_id=group_id,
        start_index=index,
        field="going",
        values=condition.get("track_conditions"),
        labels=GOING_BY_ID,
        raw_prefix="馬場状態",
    )
    index = append_value_rules(
        rules,
        ability_id=ability_id,
        detail_id=detail_id,
        group_id=group_id,
        start_index=index,
        field="weather",
        values=condition.get("weathers"),
        labels=WEATHER_BY_ID,
        raw_prefix="天候",
    )
    index = append_value_rules(
        rules,
        ability_id=ability_id,
        detail_id=detail_id,
        group_id=group_id,
        start_index=index,
        field="tactic",
        values=condition.get("running_styles"),
        labels=TACTIC_BY_ID,
        raw_prefix="騎乗指示",
    )

    for race_code in condition.get("races") or []:
        race = races_by_code.get(str(race_code))
        race_name = race.get("name") if race else str(race_code)
        index = add_rule(
            rules,
            ability_id=ability_id,
            detail_id=detail_id,
            group_id=group_id,
            index=index,
            field="race_name",
            operator="include",
            value_text=race_name,
            raw_text=f"レース: {race_name}",
        )

    distance_min = condition.get("distance_min")
    distance_max = condition.get("distance_max")
    if distance_min is not None and distance_max is not None:
        index = add_rule(
            rules,
            ability_id=ability_id,
            detail_id=detail_id,
            group_id=group_id,
            index=index,
            field="distance",
            operator="range_include",
            min_number=int(distance_min),
            max_number=int(distance_max),
            raw_text=f"{distance_min}～{distance_max}m",
        )

    for distance in condition.get("distances") or []:
        index = add_rule(
            rules,
            ability_id=ability_id,
            detail_id=detail_id,
            group_id=group_id,
            index=index,
            field="distance",
            operator="range_include",
            min_number=int(distance),
            max_number=int(distance),
            raw_text=f"{distance}m",
        )

    for jockey_code in condition.get("jockeys") or []:
        index = add_rule(
            rules,
            ability_id=ability_id,
            detail_id=detail_id,
            group_id=group_id,
            index=index,
            field="jockey",
            operator="include",
            value_text=str(jockey_code),
            raw_text=f"騎手: {jockey_code}",
        )

    return rules


def build_bundle(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")
    ability_conditions, races, association_races = parse_vue_data(soup)
    race_filter_options = parse_race_filter_options(soup)
    races_by_code = {
        str(row["code"]): row
        for row in [*association_races, *races]
        if isinstance(row, dict) and row.get("code")
    }
    visible_races_by_code = {
        str(row["code"]): row
        for row in races
        if isinstance(row, dict) and row.get("code")
    }

    abilities: list[dict[str, Any]] = []
    stallions_by_id: dict[str, dict[str, Any]] = {}
    ability_stallions: list[dict[str, Any]] = []
    ability_details: list[dict[str, Any]] = []
    ability_effects: list[dict[str, Any]] = []
    condition_groups: list[dict[str, Any]] = []
    condition_rules: list[dict[str, Any]] = []
    parse_warnings: list[dict[str, Any]] = []
    seen_ability_stallions: set[tuple[str, str]] = set()

    for panel in soup.select("div.title_panel.ability_index[id]"):
        ability_id = str(panel.get("id"))
        condition_info = ability_conditions.get(ability_id)
        official_conditions = [
            condition
            for condition in (condition_info or {}).get("conditions", [])
            if condition.get("ability_type") == ABILITY_TYPE_NONORDINARY
        ]
        if not official_conditions:
            continue

        ability_name = first_text(panel, ".ability_name p.large")
        kana = first_text(panel, ".ability_name p.small") or None
        description_lines = section_lines(panel, "説明")
        effect_lines = section_lines(panel, "発揮効果")
        condition_lines = section_lines(panel, "発揮条件")
        target_lines = section_lines(panel, "発揮対象")
        probability_lines = section_lines(panel, "発揮確率")
        ability_url = f"https://dabimas.jp/kouryaku/abilities/{ability_id}.html"
        raw_text = panel.get_text("\n")

        abilities.append(
            {
                "ability_id": ability_id,
                "ability_name": ability_name,
                "kana": kana,
                "ability_type": "非凡な才能",
                "description": "\n".join(description_lines),
                "url": ability_url,
                "source_url": ability_url,
                "source_status": "official_search_result",
                "raw_text_hash": f"sha256:{hashlib.sha256(raw_text.encode('utf-8')).hexdigest()}",
            }
        )

        for anchor in panel.find_all("a", href=True):
            match = re.search(r"/kouryaku/stallions/(\d+)\.html", anchor["href"])
            if not match:
                continue

            stallion_id = match.group(1)
            stallion_name = normalized_text(anchor.get_text(" "))
            stallions_by_id.setdefault(
                stallion_id,
                {
                    "stallion_id": stallion_id,
                    "stallion_name": stallion_name,
                    "url": f"https://dabimas.jp/kouryaku/stallions/{stallion_id}.html",
                    "source": "ability_obtain_route",
                },
            )
            key = (ability_id, stallion_id)
            if key not in seen_ability_stallions:
                seen_ability_stallions.add(key)
                ability_stallions.append(
                    {
                        "ability_id": ability_id,
                        "stallion_id": stallion_id,
                        "stallion_name": stallion_name,
                        "source": "ability_obtain_route",
                        "verified_by_stallion_page": None,
                    }
                )

        for detail_index, condition in enumerate(official_conditions, start=1):
            detail_id = f"{ability_id}_d{detail_index:02d}"
            group_id = f"{detail_id}_g01"
            detail_label = "才能詳細" if len(official_conditions) == 1 else f"才能詳細：その{detail_index}"
            effect_raw = "\n".join(effect_lines)
            condition_raw = "\n".join(condition_lines)
            target_raw = "\n".join(target_lines)
            probability_raw = "\n".join(probability_lines)
            probability_match = re.search(r"(\d+(?:\.\d+)?)\s*%", probability_raw)

            ability_details.append(
                {
                    "detail_id": detail_id,
                    "ability_id": ability_id,
                    "detail_index": detail_index,
                    "detail_order": detail_index,
                    "detail_label": detail_label,
                    "effect_raw": effect_raw,
                    "condition_raw": condition_raw,
                    "target_raw": target_raw,
                    "probability_raw": probability_raw,
                    "probability_percent": (
                        float(probability_match.group(1)) if probability_match else None
                    ),
                }
            )
            condition_groups.append(
                {
                    "group_id": group_id,
                    "condition_group_id": group_id,
                    "detail_id": detail_id,
                    "group_no": 1,
                    "group_label": "通常条件",
                    "group_raw": condition_raw,
                }
            )
            if effect_raw:
                ability_effects.append(
                    {
                        "effect_id": f"{detail_id}_e01",
                        "detail_id": detail_id,
                        "effect_no": 1,
                        "effect_raw": effect_raw,
                        "requires_group_nos": [1],
                    }
                )
            condition_rules.extend(
                build_condition_rules(
                    ability_id,
                    detail_id,
                    group_id,
                    condition,
                    races_by_code,
                )
            )

            unsupported_keys = [
                key
                for key in ("race_types", "ages")
                if condition.get(key) not in (None, [], "")
            ]
            if unsupported_keys:
                parse_warnings.append(
                    {
                        "ability_id": ability_id,
                        "detail_id": detail_id,
                        "raw": json.dumps(
                            {key: condition.get(key) for key in unsupported_keys},
                            ensure_ascii=False,
                        ),
                        "message": "フロント非表示条件として保持しました",
                    }
                )

    abilities.sort(key=lambda row: (row["kana"] or "", row["ability_name"], row["ability_id"]))
    ability_details.sort(key=lambda row: (row["ability_id"], row["detail_index"]))
    ability_effects.sort(key=lambda row: row["effect_id"])
    condition_groups.sort(key=lambda row: row["group_id"])
    condition_rules.sort(key=lambda row: row["rule_id"])
    ability_stallions.sort(key=lambda row: (row["ability_id"], row["stallion_id"]))
    stallions = sorted(stallions_by_id.values(), key=lambda row: row["stallion_id"])

    return {
        "meta": {
            "schema_version": "1.2.0",
            "generated_at": now_jst_iso(),
            "source": "dabimas.jp/kouryaku/abilities",
            "source_policy": "official_search_result_is_authoritative",
            "ability_type": "非凡な才能",
        },
        "race_filter_options": race_filter_options,
        "races": [
            convert_race(visible_races_by_code[str(option["race_id"])])
            for option in race_filter_options
            if option["race_id"] is not None and str(option["race_id"]) in visible_races_by_code
        ],
        "abilities": abilities,
        "stallions": stallions,
        "ability_stallions": ability_stallions,
        "ability_details": ability_details,
        "ability_effects": ability_effects,
        "condition_groups": condition_groups,
        "condition_rules": condition_rules,
        "parse_warnings": parse_warnings,
    }


def serialize_bundle(bundle: dict[str, Any]) -> str:
    return json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate nonordinary ability search JSON from Dabimas official ability data."
    )
    parser.add_argument(
        "--source-html",
        type=Path,
        default=DEFAULT_RAW_HTML_PATH,
        help="Cached abilities page HTML path.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Fetch the abilities page even when cached HTML exists.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_PATH,
        help="Output bundle path.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    html = load_or_fetch_html(args.source_html, args.refresh)
    write_text(args.output, serialize_bundle(build_bundle(html)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
