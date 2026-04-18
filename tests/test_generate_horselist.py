import json
from pathlib import Path

import pytest

from tools.horse_data.generate_horselist import (
    build_factor_options,
    build_records,
    build_records_from_json,
    generate_source_json_text,
    serialize_factor_options,
    serialize_records,
)


ROOT = Path(__file__).resolve().parent.parent
SOURCE_JSON = ROOT / "data" / "source" / "workbook.json"
WORKBOOKS = sorted(ROOT.glob("*.xlsm"))
WORKBOOK = WORKBOOKS[0] if WORKBOOKS else None
RECORDS = build_records_from_json(SOURCE_JSON)
GENERATED = serialize_records(RECORDS)
RECORDS_BY_SERIAL = {record["SerialNumber"]: record for record in RECORDS}
SOURCE = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))["sheets"]
SOURCE_URL_BY_SERIAL = {
    f"{index:05d}": row[0]
    for index, row in enumerate(SOURCE["horse_list"], start=1)
}
FACTOR_OPTIONS = build_factor_options(RECORDS)
GENERATED_FACTOR = serialize_factor_options(FACTOR_OPTIONS)


def test_generated_horselist_snapshot_hash() -> None:
    assert len(RECORDS) > 0
    assert '"HeaderDetail"' not in GENERATED


def test_generated_outputs_match_checked_in_json() -> None:
    assert GENERATED == (ROOT / "json" / "horselist.json").read_text(encoding="utf-8")
    assert GENERATED_FACTOR == (ROOT / "json" / "factor.json").read_text(encoding="utf-8")


def test_json_source_matches_workbook_generation_when_available() -> None:
    if WORKBOOK is None:
        pytest.skip("No .xlsm workbook is available for migration parity.")

    assert serialize_records(build_records(WORKBOOK)) == GENERATED


def test_checked_in_source_json_matches_workbook_export_when_available() -> None:
    if WORKBOOK is None:
        pytest.skip("No .xlsm workbook is available for migration parity.")

    assert generate_source_json_text(WORKBOOK) == SOURCE_JSON.read_text(encoding="utf-8")


def test_horse_ids_are_recovered_from_source_urls() -> None:
    assert all(record["HorseId"] for record in RECORDS)

    for record in RECORDS:
        source_url = SOURCE_URL_BY_SERIAL[record["SerialNumber"]]
        assert record["HorseId"] == source_url.rsplit("/", 1)[-1].removesuffix(".html")


def test_rare_badges_match_rare_codes() -> None:
    for record in RECORDS:
        card = record["card"]

        if record["RareCd"] == "8":
            assert card["rareBadgeClass"] == "header01_8"
            assert card["rareBadgeLabel"] == "究極"
        elif record["RareCd"] == "7":
            assert card["rareBadgeClass"] == "header01_7"
            assert card["rareBadgeLabel"] == "究極"
        elif record["RareCd"] == "6":
            assert card["rareBadgeClass"] == "header01_6"


def test_generated_factor_options_match_pedigree_entries_with_factors() -> None:
    pedigree_factor_names = {
        entry[0]
        for record in RECORDS
        for entry in record["card"]["pedigree"]
        if entry[0] and entry[3]
    }

    assert {option["id"] for option in FACTOR_OPTIONS} == pedigree_factor_names
    assert all(option["name"] == option["id"] for option in FACTOR_OPTIONS)
    assert all("(" not in option["name"] for option in FACTOR_OPTIONS)
    assert all("badges" in option for option in FACTOR_OPTIONS)
    assert all(option["badges"] for option in FACTOR_OPTIONS)
    assert len(FACTOR_OPTIONS) == 248


def test_generated_factor_json_shape() -> None:
    payload = json.loads(GENERATED_FACTOR)

    assert payload == {"factor": FACTOR_OPTIONS}
    assert FACTOR_OPTIONS[:5] == [
        {"name": "Abernant", "id": "Abernant", "badges": ["短"]},
        {"name": "Admiral Drake", "id": "Admiral Drake", "badges": ["長"]},
        {"name": "Alizier", "id": "Alizier", "badges": ["長"]},
        {"name": "Alycidon", "id": "Alycidon", "badges": ["長"]},
        {"name": "Aureole", "id": "Aureole", "badges": ["底", "難"]},
    ]
