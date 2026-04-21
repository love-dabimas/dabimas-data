import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { ANCESTOR_POSITION_OPTIONS } from "@/shared/constants/parentLines";

// UI で使う実際の検索結果配列。
export interface FilterHorseRecordsResult {
  stallions: HorseRecord[];
  broodmares: HorseRecord[];
  total: number;
  hasActivePrimaryFilters: boolean;
}

const rareCodePattern = /^\d+$/;

// 表示順は既存サイトに合わせて「因子あり > レア高い > 通し番号小さい」にそろえる。
const RARE_RANK: Record<string, number> = {
  "8": 14, "7": 13, "6": 12, "5": 11, "4": 10,
  "3": 9,  "2": 8,  "1": 7,
  Z: 6, Y: 5, X: 4, W: 3, V: 2, U: 1
};

// 結果一覧の見た目を安定させるため、毎回同じ優先順位でソートする。
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

    // SerialNumber は文字列なので、数値比較へ直して自然順にする。
    return parseInt(left.SerialNumber, 10) - parseInt(right.SerialNumber, 10);
  });

// 何も条件がない場合は「全件を出す」のではなく、検索待ちの空画面にしたい。
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

// 旧仕様の lookahead 検索を再現するため、正規表現エラーは false 扱いで握りつぶす。
const legacyRegexTest = (pattern: string, value: string) => {
  try {
    return new RegExp(pattern).test(value);
  } catch {
    return false;
  }
};

// 元サイトの「含む」判定が lookahead ベースだったので、その動きを残している。
const legacyLookaheadMatch = (target: string, value: string) =>
  legacyRegexTest(`^(?=.*${value}).*$`, target);

// レアコードは牡馬用と牝馬用が混在するため、性別に合うコードだけで判定する。
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

// 祖先指定は「全位置指定」と「個別位置指定」で検索式の組み立て方が異なる。
const matchesAncestor = (horse: HorseRecord, criteria: SearchCriteria) => {
  const ancestorName = criteria.ancestorName.trim();

  if (!ancestorName || criteria.ancestorPositions.length === 0) {
    return true;
  }

  if (criteria.ancestorPositions.length === ANCESTOR_POSITION_OPTIONS.length) {
    return legacyLookaheadMatch(horse.Ped_All, ancestorName);
  }

  const pattern = criteria.ancestorPositions
    .map((position: string) => `[${position}${ancestorName}]`)
    .join("|");

  return legacyRegexTest(pattern, horse.Ped_All);
};

// 見事 / 1 薄は選択されたコードをすべて含むかで判定する。
const includesAllCodes = (target: string, codes: string[]) =>
  codes.every((code) => target.includes(code));

export const filterHorseRecords = (
  horses: HorseRecord[],
  criteria: SearchCriteria
): FilterHorseRecordsResult => {
  const activePrimaryFilters = hasPrimaryCondition(criteria);

  // 条件未指定時は空配列を返し、結果欄では案内文だけを出す。
  if (!activePrimaryFilters) {
    return {
      stallions: [],
      broodmares: [],
      total: 0,
      hasActivePrimaryFilters: false
    };
  }

  const keyword = criteria.keyword.trim();

  // 旧データ仕様に合わせた文字列条件を上から順に適用して候補を絞る。
  const filtered = horses.filter((horse) => {
    // Paternal_t は自身の親系統コード。
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

  // 最後に性別ごとへ分けて、表示順をそろえて返す。
  const stallions = sortHorseRecords(filtered.filter((horse) => horse.Gender === "0"));
  const broodmares = sortHorseRecords(filtered.filter((horse) => horse.Gender === "1"));

  return {
    stallions,
    broodmares,
    total: stallions.length + broodmares.length,
    hasActivePrimaryFilters: true
  };
};
