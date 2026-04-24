import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import {
  ANCESTOR_POSITION_OPTIONS,
  PARENT_LINE_OPTIONS
} from "@/shared/constants/parentLines";

export interface FilterHorseRecordsResult {
  stallions: HorseRecord[];
  broodmares: HorseRecord[];
  total: number;
  hasActivePrimaryFilters: boolean;
}

export interface HorseSearchIndex {
  records: HorseRecord[];
  wordCount: number;
  allMask: Uint32Array;
  fatherLineIndexes: Map<string, Uint32Array>;
  damSireLineIndexes: Map<string, Uint32Array>;
  migotoLineIndexes: Map<string, Uint32Array>;
  thinLineIndexes: Map<string, Uint32Array>;
  rareIndexes: Map<string, Uint32Array>;
  theoryIndexes: Map<string, Uint32Array>;
  runningStyleIndexes: Map<string, Uint32Array>;
  growthIndexes: Map<string, Uint32Array>;
  dirtIndexes: Map<string, Uint32Array>;
  achievementIndexes: Map<string, Uint32Array>;
  stableIndexes: Map<string, Uint32Array>;
  clemencyIndexes: Map<string, Uint32Array>;
  potentialIndexes: Map<string, Uint32Array>;
  healthIndexes: Map<string, Uint32Array>;
}

interface CompiledCriteria {
  activePrimaryFilters: boolean;
  keywordMatcher: ((value: string) => boolean) | null;
  ownChildLineMatcher: ((value: string) => boolean) | null;
  damSireChildLineMatcher: ((value: string) => boolean) | null;
  ancestorMatcher: ((value: string) => boolean) | null;
}

const rareCodePattern = /^\d+$/;
const PARENT_LINE_VALUES = PARENT_LINE_OPTIONS.map((option) => option.value);

const RARE_RANK: Record<string, number> = {
  "8": 14,
  "7": 13,
  "6": 12,
  "5": 11,
  "4": 10,
  "3": 9,
  "2": 8,
  "1": 7,
  Z: 6,
  Y: 5,
  X: 4,
  W: 3,
  V: 2,
  U: 1
};

export const sortHorseRecords = (records: HorseRecord[]) =>
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

    return parseInt(left.SerialNumber, 10) - parseInt(right.SerialNumber, 10);
  });

const setBit = (mask: Uint32Array, index: number) => {
  mask[index >> 5] |= 1 << (index & 31);
};

const addIndexValue = (
  map: Map<string, Uint32Array>,
  value: string,
  index: number,
  wordCount: number
) => {
  if (!value) {
    return;
  }

  let mask = map.get(value);
  if (!mask) {
    mask = new Uint32Array(wordCount);
    map.set(value, mask);
  }

  setBit(mask, index);
};

const addParentLineCodes = (
  map: Map<string, Uint32Array>,
  value: string,
  index: number,
  wordCount: number
) => {
  if (!value) {
    return;
  }

  for (const code of PARENT_LINE_VALUES) {
    if (value.includes(code)) {
      addIndexValue(map, code, index, wordCount);
    }
  }
};

const rareIndexKey = (gender: HorseRecord["Gender"], rareCode: string) =>
  `${gender}:${rareCode}`;

export const createHorseSearchIndex = (records: HorseRecord[]): HorseSearchIndex => {
  const wordCount = Math.ceil(records.length / 32);
  const allMask = new Uint32Array(wordCount);
  records.forEach((_, itemIndex) => setBit(allMask, itemIndex));

  const index: HorseSearchIndex = {
    records,
    wordCount,
    allMask,
    fatherLineIndexes: new Map(),
    damSireLineIndexes: new Map(),
    migotoLineIndexes: new Map(),
    thinLineIndexes: new Map(),
    rareIndexes: new Map(),
    theoryIndexes: new Map(),
    runningStyleIndexes: new Map(),
    growthIndexes: new Map(),
    dirtIndexes: new Map(),
    achievementIndexes: new Map(),
    stableIndexes: new Map(),
    clemencyIndexes: new Map(),
    potentialIndexes: new Map(),
    healthIndexes: new Map()
  };

  records.forEach((horse, itemIndex) => {
    addIndexValue(index.fatherLineIndexes, horse.Paternal_t, itemIndex, wordCount);
    addIndexValue(index.damSireLineIndexes, horse.Paternal_ht, itemIndex, wordCount);
    addParentLineCodes(index.migotoLineIndexes, horse.Paternal_mig, itemIndex, wordCount);
    addParentLineCodes(index.thinLineIndexes, horse.Paternal_jik, itemIndex, wordCount);
    addIndexValue(
      index.rareIndexes,
      rareIndexKey(horse.Gender, horse.RareCd),
      itemIndex,
      wordCount
    );
    if (horse.card.theory?.canPerfect) {
      addIndexValue(index.theoryIndexes, "perfect", itemIndex, wordCount);
    }
    if (horse.card.theory?.canSuperPerfect) {
      addIndexValue(index.theoryIndexes, "superPerfect", itemIndex, wordCount);
    }
    if (horse.card.theory?.canMiracle) {
      addIndexValue(index.theoryIndexes, "miracle", itemIndex, wordCount);
    }
    if (horse.card.theory?.canShiho) {
      addIndexValue(index.theoryIndexes, "shiho", itemIndex, wordCount);
    }
    addIndexValue(index.runningStyleIndexes, horse.card.stats.runningStyle, itemIndex, wordCount);
    addIndexValue(index.growthIndexes, horse.card.stats.growth, itemIndex, wordCount);
    addIndexValue(index.dirtIndexes, horse.card.stats.dirt, itemIndex, wordCount);
    addIndexValue(index.achievementIndexes, horse.card.stats.achievement, itemIndex, wordCount);
    addIndexValue(index.stableIndexes, horse.card.stats.stable, itemIndex, wordCount);
    addIndexValue(index.clemencyIndexes, horse.card.stats.clemency, itemIndex, wordCount);
    addIndexValue(index.potentialIndexes, horse.card.stats.potential, itemIndex, wordCount);
    addIndexValue(index.healthIndexes, horse.card.stats.health, itemIndex, wordCount);
  });

  return index;
};

const hasPrimaryCondition = (criteria: SearchCriteria) =>
  criteria.fatherLines.length > 0 ||
  criteria.damSireLines.length > 0 ||
  criteria.migotoLines.length > 0 ||
  criteria.thinLines.length > 0 ||
  criteria.keyword.trim().length > 0 ||
  criteria.theory.length > 0 ||
  criteria.runningStyle.length > 0 ||
  criteria.growth.length > 0 ||
  criteria.dirt.length > 0 ||
  criteria.achievement.length > 0 ||
  criteria.stable.length > 0 ||
  criteria.clemency.length > 0 ||
  criteria.potential.length > 0 ||
  criteria.health.length > 0 ||
  criteria.ownChildLine.length > 0 ||
  criteria.damSireChildLine.length > 0 ||
  (criteria.ancestorName.trim().length > 0 &&
    criteria.ancestorPositions.length > 0);

const createLegacyRegexMatcher = (pattern: string | null) => {
  if (!pattern) {
    return null;
  }

  try {
    const regex = new RegExp(pattern);
    return (value: string) => regex.test(value);
  } catch {
    return () => false;
  }
};

const createLegacyLookaheadMatcher = (value: string) =>
  createLegacyRegexMatcher(value ? `^(?=.*${value}).*$` : null);

const compileCriteria = (criteria: SearchCriteria): CompiledCriteria => {
  const ancestorName = criteria.ancestorName.trim();
  const ancestorMatcher =
    ancestorName && criteria.ancestorPositions.length > 0
      ? criteria.ancestorPositions.length === ANCESTOR_POSITION_OPTIONS.length
        ? createLegacyLookaheadMatcher(ancestorName)
        : createLegacyRegexMatcher(
            criteria.ancestorPositions
              .map((position: string) => `[${position}${ancestorName}]`)
              .join("|")
          )
      : null;

  return {
    activePrimaryFilters: hasPrimaryCondition(criteria),
    keywordMatcher: createLegacyLookaheadMatcher(criteria.keyword.trim()),
    ownChildLineMatcher: createLegacyLookaheadMatcher(criteria.ownChildLine),
    damSireChildLineMatcher: createLegacyLookaheadMatcher(criteria.damSireChildLine),
    ancestorMatcher
  };
};

const hasAnyBit = (mask: Uint32Array) => {
  for (let wordIndex = 0; wordIndex < mask.length; wordIndex += 1) {
    if (mask[wordIndex] !== 0) {
      return true;
    }
  }

  return false;
};

const andInto = (target: Uint32Array, source: Uint32Array) => {
  for (let wordIndex = 0; wordIndex < target.length; wordIndex += 1) {
    target[wordIndex] &= source[wordIndex];
  }
};

const getUnionMask = (wordCount: number, map: Map<string, Uint32Array>, values: string[]) => {
  if (values.length === 0) {
    return null;
  }

  const result = new Uint32Array(wordCount);

  for (const value of values) {
    const mask = map.get(value);
    if (!mask) {
      continue;
    }

    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      result[wordIndex] |= mask[wordIndex];
    }
  }

  return result;
};

const applyOptionalMask = (
  candidateMask: Uint32Array,
  index: HorseSearchIndex,
  map: Map<string, Uint32Array>,
  values: string[]
) => {
  const mask = getUnionMask(index.wordCount, map, values);
  if (mask) {
    andInto(candidateMask, mask);
  }
};

const applyRequiredMasks = (
  candidateMask: Uint32Array,
  map: Map<string, Uint32Array>,
  values: string[]
) => {
  for (const value of values) {
    const mask = map.get(value);
    if (!mask) {
      candidateMask.fill(0);
      return;
    }

    andInto(candidateMask, mask);
  }
};

const getRareMask = (index: HorseSearchIndex, rareCodes: string[]) => {
  if (rareCodes.length === 0) {
    return null;
  }

  const result = new Uint32Array(index.wordCount);

  for (const code of rareCodes) {
    const gender = rareCodePattern.test(code) ? "0" : "1";
    const mask = index.rareIndexes.get(rareIndexKey(gender, code));
    if (!mask) {
      continue;
    }

    for (let wordIndex = 0; wordIndex < index.wordCount; wordIndex += 1) {
      result[wordIndex] |= mask[wordIndex];
    }
  }

  return result;
};

const getIndexedCandidateMask = (index: HorseSearchIndex, criteria: SearchCriteria) => {
  const candidateMask = index.allMask.slice();

  applyOptionalMask(candidateMask, index, index.fatherLineIndexes, criteria.fatherLines);
  applyOptionalMask(candidateMask, index, index.damSireLineIndexes, criteria.damSireLines);
  applyRequiredMasks(candidateMask, index.migotoLineIndexes, criteria.migotoLines);
  applyRequiredMasks(candidateMask, index.thinLineIndexes, criteria.thinLines);
  applyRequiredMasks(candidateMask, index.theoryIndexes, criteria.theory);
  applyOptionalMask(candidateMask, index, index.runningStyleIndexes, criteria.runningStyle);
  applyOptionalMask(candidateMask, index, index.growthIndexes, criteria.growth);
  applyOptionalMask(candidateMask, index, index.dirtIndexes, criteria.dirt);
  applyOptionalMask(candidateMask, index, index.achievementIndexes, criteria.achievement);
  applyOptionalMask(candidateMask, index, index.stableIndexes, criteria.stable);
  applyOptionalMask(candidateMask, index, index.clemencyIndexes, criteria.clemency);
  applyOptionalMask(candidateMask, index, index.potentialIndexes, criteria.potential);
  applyOptionalMask(candidateMask, index, index.healthIndexes, criteria.health);

  const rareMask = getRareMask(index, criteria.rareCodes);
  if (rareMask) {
    andInto(candidateMask, rareMask);
  }

  return candidateMask;
};

export const filterHorseRecords = (
  source: HorseRecord[] | HorseSearchIndex,
  criteria: SearchCriteria
): FilterHorseRecordsResult => {
  const index = Array.isArray(source) ? createHorseSearchIndex(sortHorseRecords(source)) : source;
  const compiled = compileCriteria(criteria);

  if (!compiled.activePrimaryFilters) {
    return {
      stallions: [],
      broodmares: [],
      total: 0,
      hasActivePrimaryFilters: false
    };
  }

  const stallions: HorseRecord[] = [];
  const broodmares: HorseRecord[] = [];
  const candidateMask = getIndexedCandidateMask(index, criteria);

  if (!hasAnyBit(candidateMask)) {
    return {
      stallions,
      broodmares,
      total: 0,
      hasActivePrimaryFilters: true
    };
  }

  for (let wordIndex = 0; wordIndex < candidateMask.length; wordIndex += 1) {
    let word = candidateMask[wordIndex] >>> 0;

    while (word !== 0) {
      const lowestBit = word & -word;
      const bitIndex = 31 - Math.clz32(lowestBit);
      const candidateIndex = wordIndex * 32 + bitIndex;
      word = (word ^ lowestBit) >>> 0;

      if (candidateIndex >= index.records.length) {
        continue;
      }

      const horse = index.records[candidateIndex];

      if (compiled.ownChildLineMatcher && !compiled.ownChildLineMatcher(horse.Category)) {
        continue;
      }

      if (
        compiled.damSireChildLineMatcher &&
        !compiled.damSireChildLineMatcher(horse.Category_ht)
      ) {
        continue;
      }

      if (compiled.keywordMatcher && !compiled.keywordMatcher(horse.Ped_All)) {
        continue;
      }

      if (compiled.ancestorMatcher && !compiled.ancestorMatcher(horse.Ped_All)) {
        continue;
      }

      if (horse.Gender === "0") {
        stallions.push(horse);
      } else {
        broodmares.push(horse);
      }
    }
  }

  return {
    stallions,
    broodmares,
    total: stallions.length + broodmares.length,
    hasActivePrimaryFilters: true
  };
};
