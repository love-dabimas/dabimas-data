import json
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError

import pytest

from tools.horse_data import generate_horselist as g
from tools.horse_data.ability_links import build_links
from tools.horse_data.id_ledger import update_ledger, official_horses
from tools.horse_data.download_r2 import download_r2
from tools.horse_data.r2_source import (
    FILES, check_population, convert_source, is_published,
    publication_cutoff, skill_card, validate_r2, known_ability_urls, DatasetVersionMismatch, load_r2,
)


@pytest.fixture
def data():
    return {
        "stallions": [{"game_stallion_id": "1", "node_id": "p-00", "pedigree_id": "p",
                       "name": "テスト", "rarity": 5, "talent_slot_count": 5,
                       "nonordinary_ability_id": "10", "sub_ability_id": "0", "display_start_at": None}],
        "broodmares": [],
        "pedigrees": [{"pedigree_id": "p", "canonical_name": "祖先", "father_pedigree_id": "p",
                       "mother_pedigree_id": "p", "child_sire_line": {"name": "ノーザンダンサー系"},
                       "parent_sire_line": {"name": "Nearctic"}}],
        "nodes": [{"node_id": "p-00", "pedigree_id": "p", "pedigree_effect_ids": [1, 2, 3]}],
        "abilities": [{"game_ability_id": "10", "name": "非凡", "ability_type": "nonordinary",
                       "description": ["説明"], "details": [{"effects": ["・効果\n　続き"], "probability": ["100%"]}]}],
    }


def empty_ledger():
    return {"version": 1, "stallions": {}, "broodmares": {}}


def official(name="テスト", horse_id="0123456789", serial="00001"):
    row = [""] * 112
    for column, value in ((g.COL_GENDER, "0"), (g.COL_SERIAL_NUMBER, serial),
                          (g.COL_HORSE_ID, horse_id), (g.COL_HORSE_NAME, name), (g.COL_RARE, "5")):
        row[column - 1] = value
    return {"all": [row], "horse_list": []}


@pytest.mark.parametrize("timestamp, expected", [
    (None, True), ("2026-10-13T00:00:00+09:00", True),
    ("2026-10-13T02:30:00Z", True), ("2026-10-13T02:30:01Z", False),
    ("2026-10-13T12:00:00+09:00", False), ("2030-01-01T00:00:00+09:00", False),
])
def test_publication_boundary(timestamp, expected):
    assert is_published({"display_start_at": timestamp}, publication_cutoff("2026-10-13")) is expected


def test_adapter_excludes_future_before_theory_and_preserves_r_ids(data):
    source = official()
    data["stallions"].append({**data["stallions"][0], "game_stallion_id": "2", "name": "未来",
                             "display_start_at": "2030-01-01T00:00:00Z"})
    ledger = update_ledger(empty_ledger(), data, {"all": [], "horse_list": []}, {}, initial=True)
    converted, metadata = convert_source(data, ledger, source, {}, "2026-10-13")
    records = g.build_records_from_source(converted, metadata)
    assert len(records) == 1
    horse = records[0]
    assert horse["HorseId"] == "r1"
    assert horse["RareCd"] == "8"
    assert horse["card"]["abilityGameId"] == "10"
    assert horse["card"]["abilityData"]["detailTabs"][0]["effects"] == ["・効果", "続き"]
    assert horse["card"]["pedigree"][0][0] == "祖先"
    assert g.serialize_records(records) == g.serialize_records(g.build_records_from_source(*convert_source(data, ledger, source, {}, "2026-10-13")))


@pytest.mark.parametrize("slots,factors,icon,expected", [
    (5, 3, "list_icn_cat_1057.png", "8"), (5, 2, "", "7"), (5, 0, "", "7"),
    (4, 3, "list_icn_cat_12.png", "5"), (5, 3, "list_icn_cat_14.png", "6"),
    ("", 0, "list_icn_cat_12.png", "8"), ("", 0, "list_icn_cat_11.png", "7"),
])
def test_rarity_uses_talent_slots_with_legacy_icon_fallback(slots, factors, icon, expected):
    row = [""] * 113
    row[g.COL_RARE], row[g.COL_TALENT_SLOTS], row[g.COL_ICON] = "5", slots, icon
    for i in range(factors):
        row[g.COL_FACTOR_NAME_1 + i] = "01"
    assert g.compute_rare_cd("0", row) == expected


def test_initial_ambiguous_ids_follow_publication_date_and_serial(data):
    data["stallions"] = [
        {**data["stallions"][0], "game_stallion_id": "2", "display_start_at": "2020-01-01T00:00:00Z"},
        data["stallions"][0],
    ]
    source = official()
    source["all"] += official(horse_id="9876543210", serial="00002")["all"]
    ledger = update_ledger(empty_ledger(), data, source, {}, initial=True)
    assert ledger["stallions"]["1"]["HorseId"] == "0123456789"
    assert ledger["stallions"]["2"]["HorseId"] == "9876543210"
    assert update_ledger(ledger, data, source, {}) == ledger


def test_later_official_match_preserves_identity_and_adds_alias(data):
    ledger = update_ledger(empty_ledger(), data, {"all": [], "horse_list": []}, {})
    updated = update_ledger(ledger, data, official(), {})
    assert updated["stallions"]["1"]["HorseId"] == "r1"
    assert updated["stallions"]["1"]["SerialNumber"] == "00001"
    assert updated["stallions"]["1"]["legacy_ids"] == ["0123456789"]
    assert "legacy_ids" not in ledger["stallions"]["1"]


def test_variant_base_alias_does_not_take_base_horse_identity(data):
    base = data["stallions"][0]
    data["nodes"][0]["name"] = "テスト"
    data["stallions"] = [{**base, "name": "テスト2020", "game_stallion_id": "2"}, base]
    source = official()
    source["all"] += official(name="テスト2020", horse_id="9876543210", serial="00002")["all"]
    ledger = update_ledger(empty_ledger(), data, source, {}, initial=True)
    assert ledger["stallions"]["1"]["HorseId"] == "0123456789"
    assert ledger["stallions"]["2"]["HorseId"] == "9876543210"


def test_previous_daily_result_reserves_identity_until_weekly_update(data):
    previous = [{"Gender": "0", "HorseId": "r1", "SerialNumber": "00009", "card": {"sourceGameId": "1"}}]
    updated = update_ledger(empty_ledger(), data, official(), {}, previous=previous)
    assert updated["stallions"]["1"]["SerialNumber"] == "00009"
    assert updated["stallions"]["1"]["HorseId"] == "r1"


def test_official_only_fallback_disappears_when_future_r2_candidate_exists(data):
    source = official(name="先行掲載")
    ledger = update_ledger(empty_ledger(), data, source, {})
    converted, _ = convert_source(data, ledger, source, {}, "2026-10-13")
    assert len(converted["all"]) == 2
    data["stallions"][0].update(name="先行掲載", display_start_at="2030-01-01T00:00:00Z")
    converted, _ = convert_source(data, ledger, source, {}, "2026-10-13")
    assert converted["all"] == []


@pytest.mark.parametrize("mutation", ["node", "pedigree", "ability", "sub_ability", "factor"])
def test_invalid_references_stop_generation(data, mutation):
    if mutation in {"node", "pedigree"}:
        data["stallions"][0][mutation + "_id"] = "missing"
    elif mutation in {"ability", "sub_ability"}:
        data["stallions"][0]["nonordinary_ability_id" if mutation == "ability" else "sub_ability_id"] = "999"
    else:
        data["nodes"][0]["pedigree_effect_ids"] = [15]
    with pytest.raises(ValueError):
        validate_r2(data)


def test_population_guard_is_strictly_more_than_one_percent():
    check_population(99, 100)
    with pytest.raises(ValueError):
        check_population(98, 100)


def test_mixed_dataset_leaves_outputs_untouched(data, tmp_path):
    for key, filename in FILES.items():
        (tmp_path / filename).write_text(json.dumps({"dataset_version": key, key: data[key]}), encoding="utf-8")
    output, factor = tmp_path / "horselist.json", tmp_path / "factor.json"
    output.write_text("previous horses")
    factor.write_text("previous factors")
    result = subprocess.run([sys.executable, "-m", "tools.horse_data.generate_horselist", "--r2-dir", str(tmp_path),
                             "--output", str(output), "--factor-output", str(factor)], capture_output=True)
    assert result.returncode != 0
    assert b"dataset_version" in result.stderr
    assert output.read_text() == "previous horses"
    assert factor.read_text() == "previous factors"


def test_level_max_and_numbered_skill_tabs(data):
    ability = data["abilities"][0]
    ability["level_max"] = {"details": [{"probability": [" 70%"], "conditions": ["　条件"]}]}
    card = skill_card(ability)
    assert [tab["label"] for tab in card["detailTabs"]] == ["レベル 1", "レベル MAX"]
    assert card["detailTabs"][1]["probability"] == ["・70%"]
    del ability["level_max"]
    ability["details"] *= 2
    assert [tab["label"] for tab in skill_card(ability)["detailTabs"]] == ["その1", "その2"]


def test_known_innate_url_can_be_reused_for_r2_only_horse():
    ability = {"game_ability_id": "20", "name": "天性", "description": ["説明"], "ability_type": "innate"}
    metadata = {"official": {"innateTalent": {"name": "天性", "description": ["説明"],
                                             "detailUrl": "/kouryaku/abilities/123.html"}}}
    assert known_ability_urls([ability], metadata) == {"20": "/kouryaku/abilities/123.html"}


def test_legacy_workbook_no_longer_requires_special_rare_sheet(tmp_path):
    openpyxl = pytest.importorskip("openpyxl")
    workbook = openpyxl.Workbook()
    workbook.active.title = "種牡馬一覧"
    all_sheet = workbook.create_sheet("ALL")
    for column, value in enumerate(official()["all"][0], 1):
        all_sheet.cell(3, column, value)
    path = tmp_path / "source.xlsx"
    workbook.save(path)
    source = g.load_excel_source(path)
    assert set(source) == {"all", "horse_list"}
    assert source["all"][0][g.COL_HORSE_ID - 1] == "0123456789"


def test_ability_links_require_disambiguation_and_validate_overrides(data):
    bundle = {"abilities": [{"ability_id": "a", "ability_name": "非凡", "description": "説明"},
                             {"ability_id": "b", "ability_name": "非凡", "description": "説明"}], "ability_details": []}
    assert build_links(data["abilities"], bundle, []) == []
    override = [{"ability_id": "b", "game_ability_id": "10"}]
    assert build_links(data["abilities"], bundle, override) == override
    with pytest.raises(ValueError):
        build_links(data["abilities"], bundle, [{"ability_id": "bad", "game_ability_id": "10"}])


def broodmare(game_id: str, name: str) -> dict:
    return {"game_broodmare_id": game_id, "name": name, "node_id": "p-00", "pedigree_id": "p",
            "broodmare_grade": {"exchange_ticket_eligible": True}}


def test_shared_horse_id_keeps_r2_skills_and_game_ids_separate(data):
    data["broodmares"] = [broodmare("2", "牝馬")]
    ledger = empty_ledger()
    for kind, game_id in (("stallions", "1"), ("broodmares", "2")):
        ledger[kind][game_id] = {"HorseId": "0123456789", "SerialNumber": "00001", "source": "official_link"}
    records = g.build_records_from_source(*convert_source(data, ledger, official(), {}, "2026-10-13"))
    male, female = records
    assert male["HorseId"] == female["HorseId"]
    assert male["card"]["abilityData"]["name"] == "非凡"
    assert male["card"]["abilityGameId"] == "10"
    assert male["card"]["sourceGameId"] == "1"
    assert female["card"]["abilityData"] is None
    assert female["card"]["temperamentData"] is None
    assert female["card"]["ability"] == ""
    assert female["card"]["abilityGameId"] is None
    assert female["card"]["sourceGameId"] == "2"


def test_legacy_metadata_never_attaches_stallion_skills_to_broodmare():
    source = official()
    female = list(source["all"][0])
    female[g.COL_GENDER - 1] = "1"
    female[g.COL_RARE - 1] = ""
    source["all"].append(female)
    metadata = {"0123456789": {"extraordinaryAbility": {"name": "非凡"}, "innateTalent": {"name": "天性"}}}
    male, female = g.build_records_from_source(source, metadata)
    assert male["card"]["abilityData"]["name"] == "非凡"
    assert male["card"]["temperamentData"]["name"] == "天性"
    assert female["card"]["abilityData"] is None
    assert female["card"]["temperamentData"] is None
    assert female["card"]["ability"] == ""
    identities = official_horses(source, metadata)
    assert identities[0]["ability"]["name"] == "非凡"
    assert identities[1]["ability"] is None
    # Even an empty scoped entry takes precedence over the old unscoped entry.
    metadata["0:0123456789"] = {}
    assert g.build_records_from_source(source, metadata)[0]["card"]["abilityData"] is None


def test_broodmare_publication_includes_missing_date_and_cutoff_equality(data):
    data["stallions"] = []
    data["broodmares"] = [
        {**broodmare("1", "公開済み"), "display_start_at": "2026-10-13T02:30:00Z"},
        {**broodmare("2", "未公開"), "display_start_at": "2030-01-01T00:00:00Z"},
        broodmare("3", "日付なし"),
    ]
    source = {"all": [], "horse_list": []}
    ledger = update_ledger(empty_ledger(), data, source, {})
    records = g.build_records_from_source(*convert_source(data, ledger, source, {}, "2026-10-13"))
    assert [record["card"]["name"] for record in records] == ["公開済み", "日付なし"]
    assert all(record["Gender"] == "1" for record in records)


def test_future_broodmare_is_not_restored_from_official_source(data):
    data["stallions"] = []
    data["broodmares"] = [{**broodmare("1", "未公開"), "display_start_at": "2030-01-01T00:00:00Z"}]
    source = official(name="未公開")
    source["all"][0][g.COL_GENDER - 1] = "1"
    ledger = update_ledger(empty_ledger(), data, source, {})
    records = g.build_records_from_source(*convert_source(data, ledger, source, {}, "2026-10-13"))
    assert records == []


def write_test_masters(directory: Path, data: dict, version: str) -> None:
    for key, filename in FILES.items():
        (directory / filename).write_text(json.dumps({"dataset_version": version, key: data[key]}), encoding="utf-8")


@pytest.mark.parametrize("missing", [False, True])
def test_dataset_version_errors_have_a_distinct_exception(data, tmp_path, missing):
    write_test_masters(tmp_path, data, "v1")
    payload = {"stallions": data["stallions"]}
    if not missing:
        payload["dataset_version"] = "v2"
    (tmp_path / FILES["stallions"]).write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(DatasetVersionMismatch, match="dataset_version"):
        load_r2(tmp_path)


def test_download_retries_complete_dataset_and_publishes_only_success(data, tmp_path, capsys):
    attempts, sleeps = [], []
    output = tmp_path / "output"

    def fetch(base_url: str, staging: Path) -> None:
        assert not list(staging.iterdir())
        assert not output.exists()
        attempts.append(staging)
        version = f"v{len(attempts)}"
        write_test_masters(staging, data, version)
        if len(attempts) == 1:
            (staging / FILES["stallions"]).write_text(json.dumps({"dataset_version": "stale", "stallions": data["stallions"]}), encoding="utf-8")

    download_r2("https://example.invalid", output, fetch=fetch, sleep=sleeps.append, retry_delay=0.1)
    assert len(attempts) == 2
    assert sleeps == [0.1]
    assert load_r2(output)["dataset_version"] == "v2"
    assert len(list(output.iterdir())) == 5
    log = capsys.readouterr().err.splitlines()
    assert len(log) == 1 and "1/3" in log[0] and "dataset_version" in log[0]


@pytest.mark.parametrize("existing", [False, True])
def test_download_exhaustion_preserves_output_and_last_exception(tmp_path, existing):
    output = tmp_path / "output"
    if existing:
        output.mkdir()
        (output / FILES["stallions"]).write_bytes(b"previous data")
    errors = [DatasetVersionMismatch(f"version {i}") for i in range(3)]
    calls, sleeps = [], []

    def fetch(base_url: str, staging: Path) -> None:
        calls.append(staging)
        (staging / FILES["stallions"]).write_bytes(b"partial download")
        raise errors[len(calls) - 1]

    with pytest.raises(DatasetVersionMismatch) as error:
        download_r2("https://example.invalid", output, fetch=fetch, sleep=sleeps.append)
    assert error.value is errors[-1]
    assert len(calls) == 3
    assert sleeps == [120, 120]
    if existing:
        assert [file.name for file in output.iterdir()] == [FILES["stallions"]]
        assert (output / FILES["stallions"]).read_bytes() == b"previous data"
    else:
        assert not output.exists()


def test_download_does_not_retry_invalid_references(data, tmp_path):
    data["stallions"][0]["node_id"] = "missing"
    calls, sleeps = [], []
    output = tmp_path / "output"

    def fetch(base_url: str, staging: Path) -> None:
        calls.append(staging)
        write_test_masters(staging, data, "v1")

    with pytest.raises(ValueError, match="pedigree reference"):
        download_r2("https://example.invalid", output, fetch=fetch, sleep=sleeps.append)
    assert len(calls) == 1
    assert sleeps == []
    assert not output.exists()


@pytest.mark.parametrize("error", [URLError("offline"), TimeoutError("timeout"),
                                    HTTPError("https://example.invalid", 503, "unavailable", {}, None)])
def test_download_retries_transport_errors(data, tmp_path, error):
    calls, sleeps = [], []

    def fetch(base_url: str, staging: Path) -> None:
        calls.append(staging)
        if len(calls) == 1:
            raise error
        write_test_masters(staging, data, "v2")

    output = tmp_path / "output"
    download_r2("https://example.invalid", output, attempts=2, fetch=fetch, sleep=sleeps.append, retry_delay=0)
    assert sleeps == [0]
    assert load_r2(output)["dataset_version"] == "v2"
