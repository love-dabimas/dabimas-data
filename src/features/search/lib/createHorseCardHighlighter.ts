import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { collectHighlightTerms } from "@/features/search/lib/renderHighlightedText";
import { ANCESTOR_POSITION_OPTIONS } from "@/shared/constants/parentLines";

// 結果カード内で使う血統スロット名。既存テーブル構造の位置関係をそのまま表している。
type PedigreeSlot =
  | "t"
  | "tt"
  | "ttt"
  | "tttt"
  | "ttht"
  | "tht"
  | "thtt"
  | "thht"
  | "ht"
  | "htt"
  | "httt"
  | "htht"
  | "hht"
  | "hhtt"
  | "hhht";

export interface HorseCardHighlighter {
  defaultTerms: string[];
  horseCategoryTerms: string[];
  horseNameTerms: string[];
  pedigreeChildLineTerms: (slot: PedigreeSlot) => string[];
  pedigreeLineCodeTerms: (slot: PedigreeSlot) => string[];
  pedigreeNameTerms: (slot: PedigreeSlot) => string[];
}

export interface HorseCardHighlightCriteria {
  keyword: SearchCriteria["keyword"];
  ancestorName: SearchCriteria["ancestorName"];
  ancestorPositions: SearchCriteria["ancestorPositions"];
  damSireLines: SearchCriteria["damSireLines"];
  thinLines: SearchCriteria["thinLines"];
  migotoLines: SearchCriteria["migotoLines"];
  ownChildLine: SearchCriteria["ownChildLine"];
  damSireChildLine: SearchCriteria["damSireChildLine"];
}

// 祖先位置の指定と血統表の行番号を結びつけるための定数。
const FATHER_SLOT: PedigreeSlot = "t";
const FATHER_FATHER_SLOT: PedigreeSlot = "tt";
const DAM_SIRE_SLOT: PedigreeSlot = "ht";
const THIN_SLOTS = new Set<PedigreeSlot>(["tht", "hht"]);
const MIGOTO_SLOTS = new Set<PedigreeSlot>(["ttht", "thht", "htht", "hhht"]);
const OTHER_SLOTS = new Set<PedigreeSlot>(["ttt", "tttt", "thtt", "htt", "httt", "hhtt"]);

const [
  selfPosition,
  fatherPosition,
  fatherFatherPosition,
  damSirePosition,
  thinPosition,
  migotoPosition,
  otherPosition
] = ANCESTOR_POSITION_OPTIONS.map((option) => option.value);

export const pickHorseCardHighlightCriteria = (
  criteria: SearchCriteria
): HorseCardHighlightCriteria => ({
  keyword: criteria.keyword,
  ancestorName: criteria.ancestorName,
  ancestorPositions: criteria.ancestorPositions,
  damSireLines: criteria.damSireLines,
  thinLines: criteria.thinLines,
  migotoLines: criteria.migotoLines,
  ownChildLine: criteria.ownChildLine,
  damSireChildLine: criteria.damSireChildLine
});

export const createHorseCardHighlighter = (
  criteria: HorseCardHighlightCriteria,
  horse: HorseRecord
): HorseCardHighlighter => {
  // 通常のキーワードは名前・系統・能力など広く使い回す。
  const keywordTerms = collectHighlightTerms(criteria.keyword);
  const ancestorTerm = criteria.ancestorName.trim();
  const selectedPositions = new Set(criteria.ancestorPositions);

  // 祖先検索は選ばれた位置だけ赤字になるよう、スロット単位で用語を返す。
  const getAncestorTermsForSlot = (slot: PedigreeSlot) => {
    if (!ancestorTerm) {
      return [];
    }

    const terms: string[] = [];

    if (slot === FATHER_SLOT && selectedPositions.has(fatherPosition)) {
      terms.push(ancestorTerm);
    }

    if (slot === FATHER_FATHER_SLOT && selectedPositions.has(fatherFatherPosition)) {
      terms.push(ancestorTerm);
    }

    if (slot === DAM_SIRE_SLOT && selectedPositions.has(damSirePosition)) {
      terms.push(ancestorTerm);
    }

    if (THIN_SLOTS.has(slot) && selectedPositions.has(thinPosition)) {
      terms.push(ancestorTerm);
    }

    if (horse.Gender === "0" && MIGOTO_SLOTS.has(slot) && selectedPositions.has(migotoPosition)) {
      terms.push(ancestorTerm);
    }

    if (
      selectedPositions.has(otherPosition) &&
      (OTHER_SLOTS.has(slot) || (horse.Gender === "1" && MIGOTO_SLOTS.has(slot)))
    ) {
      terms.push(ancestorTerm);
    }

    return collectHighlightTerms(terms);
  };

  // 行コード欄は親系統条件・見事条件・1 薄条件の一致を見せる用途。
  const getLineCodeTermsForSlot = (slot: PedigreeSlot) =>
    collectHighlightTerms(
      keywordTerms,
      slot === DAM_SIRE_SLOT ? criteria.damSireLines : [],
      THIN_SLOTS.has(slot) ? criteria.thinLines : [],
      MIGOTO_SLOTS.has(slot) ? criteria.migotoLines : []
    );

  // 子系統欄は自身と母父の補助条件だけをハイライト対象にする。
  const getChildLineTermsForSlot = (slot: PedigreeSlot) =>
    collectHighlightTerms(
      keywordTerms,
      slot === FATHER_SLOT ? criteria.ownChildLine : "",
      slot === DAM_SIRE_SLOT ? criteria.damSireChildLine : ""
    );

  // UI 側は「どこを光らせるか」だけ知ればよいので、スロット別関数として返す。
  return {
    defaultTerms: keywordTerms,
    horseNameTerms: collectHighlightTerms(
      keywordTerms,
      selectedPositions.has(selfPosition) ? ancestorTerm : ""
    ),
    horseCategoryTerms: collectHighlightTerms(keywordTerms, criteria.ownChildLine),
    pedigreeNameTerms: (slot) => collectHighlightTerms(keywordTerms, getAncestorTermsForSlot(slot)),
    pedigreeChildLineTerms: (slot) => getChildLineTermsForSlot(slot),
    pedigreeLineCodeTerms: (slot) => getLineCodeTermsForSlot(slot)
  };
};
