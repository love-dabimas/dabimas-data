import type { HorseRecord } from "@/features/horses/model/types";
import type { FilterHorseRecordsResult } from "@/features/search/lib/filterHorseRecords";
import type { TheoryMap } from "@/features/embed/model/messages";
import { horseKeyOf } from "@/features/embed/model/embedMode";

// 通常検索は条件なしなら空を返す。チップの母集団には全候補を使う。
export const pairTheoryResults = (
  base: FilterHorseRecordsResult, all: HorseRecord[], map: TheoryMap, selected: string | null
) => {
  const source = base.hasActivePrimaryFilters ? [...base.stallions, ...base.broodmares] : all;
  const bits = new Map(map.entries);
  const matches = (horse: HorseRecord, bit: number) => ((bits.get(horseKeyOf(horse)) ?? 0) & bit) !== 0;
  const counts = map.chips.map((chip) => chip.pending ? null : {
    "0": source.filter((horse) => horse.Gender === "0" && matches(horse, chip.bit)).length,
    "1": source.filter((horse) => horse.Gender === "1" && matches(horse, chip.bit)).length
  });
  const chip = map.chips.find((value) => value.key === selected && !value.pending);
  if (!chip) return { counts, results: base, chip: null };
  const stallions = source.filter((horse) => horse.Gender === "0" && matches(horse, chip.bit));
  const broodmares = source.filter((horse) => horse.Gender === "1" && matches(horse, chip.bit));
  return { counts, chip, results: {
    stallions, broodmares, total: stallions.length + broodmares.length, hasActivePrimaryFilters: true
  } };
};
