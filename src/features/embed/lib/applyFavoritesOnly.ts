// このファイルは、「お気に入りのみ」がオンのときの検索結果を作る。
// 検索条件が 1 つもなければお気に入り全部を、条件があれば条件に合う馬のうちお気に入りだけを返す。
// 普段の検索は「条件なし＝何も出さない」だが、お気に入りを見返せるよう、ここでは条件なしでも出す。

import type { HorseRecord } from "@/features/horses/model/types";
import type { FilterHorseRecordsResult } from "@/features/search/lib/filterHorseRecords";
import { horseKeyOf } from "@/features/embed/model/embedMode";

export const applyFavoritesOnly = (
  results: FilterHorseRecordsResult,
  allRecords: HorseRecord[],
  favoriteKeys: Set<string>
): FilterHorseRecordsResult => {
  const source = results.hasActivePrimaryFilters
    ? [...results.stallions, ...results.broodmares]
    : allRecords;
  const stallions: HorseRecord[] = [];
  const broodmares: HorseRecord[] = [];

  for (const horse of source) {
    if (!favoriteKeys.has(horseKeyOf(horse))) {
      continue;
    }
    if (horse.Gender === "0") {
      stallions.push(horse);
    } else {
      broodmares.push(horse);
    }
  }

  return {
    stallions,
    broodmares,
    total: stallions.length + broodmares.length,
    hasActivePrimaryFilters: true
  };
};
