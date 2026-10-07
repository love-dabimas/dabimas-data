import assert from "node:assert/strict";
import { test } from "node:test";
import type { HorseRecord } from "../src/features/horses/model/types";
import { createHorseSearchIndex, filterHorseRecords } from "../src/features/search/lib/filterHorseRecords";
import { createDefaultCriteria } from "../src/features/search/model/searchCriteria";

const horse = (gender: HorseRecord["Gender"]): HorseRecord => ({
  Gender: gender, HorseId: "shared", SerialNumber: "00001", FactorFlg: "0",
  RareCd: gender === "0" ? "5" : "Z", Category: "", Category_ht: "",
  Paternal_t: "", Paternal_ht: "", Paternal_jik: "", Paternal_mig: "", Ped_All: "",
  card: {
    name: gender === "0" ? "Stallion" : "Broodmare", ability: "",
    rareBadgeClass: "", rareBadgeLabel: "", selfFactorCodes: [], pedigree: [],
    factorCounts: [[], [], []],
    stats: { runningStyle: "", growth: "", achievement: "", clemency: "", stable: "",
      potential: "", health: "", dirt: "", distanceMin: "", distanceMax: "" }
  }
});

test("nonordinary filtering excludes broodmares that share stallion IDs", () => {
  const male = horse("0"), female = horse("1");
  const records = [male, female];
  const criteria = { ...createDefaultCriteria(), rareCodes: [], nonordinaryHorseIds: ["shared"] };
  for (const source of [records, createHorseSearchIndex(records)]) {
    const filtered = filterHorseRecords(source, criteria);
    assert.deepEqual(filtered.stallions, [male]);
    assert.deepEqual(filtered.broodmares, []);
    assert.equal(filtered.total, 1);

    const unfiltered = filterHorseRecords(source, { ...criteria, nonordinaryHorseIds: null }, true);
    assert.deepEqual(unfiltered.stallions, [male]);
    assert.deepEqual(unfiltered.broodmares, [female]);
    assert.equal(unfiltered.total, 2);

    assert.equal(filterHorseRecords(source, { ...criteria, nonordinaryHorseIds: [] }).total, 0);
  }
});
