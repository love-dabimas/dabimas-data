import assert from "node:assert/strict";
import { test } from "node:test";
import { searchNonordinaryAbilities } from "../src/features/nonordinary/lib/searchNonordinaryAbilities";
import type { HorseRecord } from "../src/features/horses/model/types";
import type { NonordinaryBundle } from "../src/features/nonordinary/model/types";

test("nonordinary search unions game and official routes and deduplicates aliases", () => {
  const horses = [
    { Gender: "0", HorseId: "r1", legacy_ids: ["official1"], card: { name: "Both", abilityGameId: "10" } },
    { Gender: "0", HorseId: "r2", card: { name: "Game only", abilityGameId: "10" } },
    { Gender: "0", HorseId: "official3", card: { name: "Official only" } },
    { Gender: "0", HorseId: "r4", card: { name: "Different ability", abilityGameId: "20" } }
  ] as HorseRecord[];
  const bundle = {
    races: [],
    abilities: [{ ability_id: "a", ability_name: "Ability", kana: null }],
    stallions: [],
    ability_details: [{ ability_id: "a", detail_id: "d" }],
    condition_rules: [],
    parse_warnings: [],
    ability_stallions: [
      { ability_id: "a", stallion_id: "official1" },
      { ability_id: "a", stallion_id: "r1" },
      { ability_id: "a", stallion_id: "official3" }
    ],
    ability_game_links: [{ ability_id: "a", game_ability_id: "10" }]
  } as unknown as NonordinaryBundle;
  const result = searchNonordinaryAbilities(bundle, horses, { race_id: null, tactics: [], going: [], weather: [] });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].source_stallions.map((row) => row.horse?.HorseId).sort(), ["official3", "r1", "r2"]);
  delete bundle.ability_game_links;
  const legacy = searchNonordinaryAbilities(bundle, horses, { race_id: null, tactics: [], going: [], weather: [] });
  assert.deepEqual(legacy[0].source_stallions.map((row) => row.horse?.HorseId).sort(), ["official3", "r1"]);
});

test("official ability routes resolve shared IDs and aliases to stallions only", () => {
  const male = { Gender: "0", HorseId: "shared", legacy_ids: ["legacy"], card: { name: "Stallion" } } as HorseRecord;
  const female = { Gender: "1", HorseId: "shared", legacy_ids: ["legacy"], card: { name: "Broodmare" } } as HorseRecord;
  const bundle = {
    races: [],
    abilities: [{ ability_id: "a", ability_name: "Ability", kana: null }],
    stallions: [],
    ability_details: [{ ability_id: "a", detail_id: "d" }],
    condition_rules: [], parse_warnings: [],
    ability_stallions: [{ ability_id: "a", stallion_id: "shared" }, { ability_id: "a", stallion_id: "legacy" }]
  } as unknown as NonordinaryBundle;
  const input = { race_id: null, tactics: [], going: [], weather: [] };
  for (const horses of [[male, female], [female, male]]) {
    const results = searchNonordinaryAbilities(bundle, horses, input);
    assert.equal(results.length, 1);
    assert.equal(results[0].source_stallions.length, 1);
    assert.equal(results[0].source_stallions[0].horse, male);
    assert.ok(results.flatMap((row) => row.source_stallions).every((row) => row.horse?.Gender === "0"));
  }
});
