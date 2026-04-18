import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { ANCESTOR_POSITION_OPTIONS } from "@/shared/constants/parentLines";

export interface FilterHorseRecordsResult {
  stallions: HorseRecord[];
  broodmares: HorseRecord[];
  total: number;
  hasActivePrimaryFilters: boolean;
}

const rareCodePattern = /^\d+$/;

// Pre-built rarity rank: higher index = higher rarity (descending sort wants high first)
const RARE_RANK: Record<string, number> = {
  "8": 14, "7": 13, "6": 12, "5": 11, "4": 10,
  "3": 9,  "2": 8,  "1": 7,
  Z: 6, Y: 5, X: 4, W: 3, V: 2, U: 1
};

const sortHorseRecords = (records: HorseRecord[]) =>
  [...records].sort((left, right) => {
    const factorDiff = Number(right.FactorFlg) - Number(left.FactorFlg);
    if (factorDiff !== 0) {
      return factorDiff;
    }

    const rareDiff =
      (RARE_RANK[right.RareCd] ?? 0) - (RARE_RANK[left.RareCd] ?? 0);
    if (rareDiff !== 0) {
      return rareDiff;
    }

    // Numeric serial comparison without localeCompare
    return parseInt(left.SerialNumber, 10) - parseInt(right.SerialNumber, 10);
  });

const hasPrimaryCondition = (criteria: SearchCriteria) =>
  criteria.fatherLines.length > 0 ||
  criteria.damSireLines.length > 0 ||
  criteria.migotoLines.length > 0 ||
  criteria.thinLines.length > 0 ||
  criteria.keyword.trim().length > 0 ||
  criteria.ownChildLine.length > 0 ||
  criteria.damSireChildLine.length > 0 ||
  (criteria.ancestorName.trim().length > 0 &&
    criteria.ancestorPositions.length > 0);

const legacyRegexTest = (pattern: string, value: string) => {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
};

const legacyLookaheadMatch = (target: string, value: string) =>
  legacyRegexTest(`^(?=.*${value}).*$`, target);

const matchesRare = (horse: HorseRecord, rareCodes: string[]) => {
  if (rareCodes.length === 0) {
    return true;
  }

  const genderSpecificCodes = rareCodes.filter((code) =>
    horse.Gender === "0" ? rareCodePattern.test(code) : !rareCodePattern.test(code)
  );

  if (genderSpecificCodes.length === 0) {
    return false;
  }

  return genderSpecificCodes.includes(horse.RareCd);
};

const matchesAncestor = (horse: HorseRecord, criteria: SearchCriteria) => {
  const ancestorName = criteria.ancestorName.trim();

  if (!ancestorName || criteria.ancestorPositions.length === 0) {
    return true;
  }

  if (criteria.ancestorPositions.length === ANCESTOR_POSITION_OPTIONS.length) {
    return legacyLookaheadMatch(horse.Ped_All, ancestorName);
  }

  const pattern = criteria.ancestorPositions
    .map((position) => `[${position}${ancestorName}]`)
    .join("|");

  return legacyRegexTest(pattern, horse.Ped_All);
};

const includesAllCodes = (target: string, codes: string[]) =>
  codes.every((code) => target.includes(code));

export const filterHorseRecords = (
  horses: HorseRecord[],
  criteria: SearchCriteria
): FilterHorseRecordsResult => {
  const activePrimaryFilters = hasPrimaryCondition(criteria);

  if (!activePrimaryFilters) {
    return {
      stallions: [],
      broodmares: [],
      total: 0,
      hasActivePrimaryFilters: false
    };
  }

  const keyword = criteria.keyword.trim();

  const filtered = horses.filter((horse) => {
    // Paternal_t is generated from the horse's own parent-line source.
    if (criteria.fatherLines.length > 0 && !criteria.fatherLines.includes(horse.Paternal_t)) {
      return false;
    }

    if (
      criteria.damSireLines.length > 0 &&
      !criteria.damSireLines.includes(horse.Paternal_ht)
    ) {
      return false;
    }

    if (!includesAllCodes(horse.Paternal_mig, criteria.migotoLines)) {
      return false;
    }

    if (!includesAllCodes(horse.Paternal_jik, criteria.thinLines)) {
      return false;
    }

    if (
      criteria.ownChildLine &&
      !legacyLookaheadMatch(horse.Category, criteria.ownChildLine)
    ) {
      return false;
    }

    if (
      criteria.damSireChildLine &&
      !legacyLookaheadMatch(horse.Category_ht, criteria.damSireChildLine)
    ) {
      return false;
    }

    if (keyword && !legacyLookaheadMatch(horse.Ped_All, keyword)) {
      return false;
    }

    if (!matchesAncestor(horse, criteria)) {
      return false;
    }

    if (!matchesRare(horse, criteria.rareCodes)) {
      return false;
    }

    return true;
  });

  const stallions = sortHorseRecords(filtered.filter((horse) => horse.Gender === "0"));
  const broodmares = sortHorseRecords(filtered.filter((horse) => horse.Gender === "1"));

  return {
    stallions,
    broodmares,
    total: stallions.length + broodmares.length,
    hasActivePrimaryFilters: true
  };
};
