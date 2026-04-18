import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { collectHighlightTerms } from "@/features/search/lib/renderHighlightedText";
import { ANCESTOR_POSITION_OPTIONS } from "@/shared/constants/parentLines";

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

export const createHorseCardHighlighter = (
  criteria: SearchCriteria,
  horse: HorseRecord
): HorseCardHighlighter => {
  const keywordTerms = collectHighlightTerms(criteria.keyword);
  const ancestorTerm = criteria.ancestorName.trim();
  const selectedPositions = new Set(criteria.ancestorPositions);

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

  const getLineCodeTermsForSlot = (slot: PedigreeSlot) =>
    collectHighlightTerms(
      keywordTerms,
      slot === DAM_SIRE_SLOT ? criteria.damSireLines : [],
      THIN_SLOTS.has(slot) ? criteria.thinLines : [],
      MIGOTO_SLOTS.has(slot) ? criteria.migotoLines : []
    );

  const getChildLineTermsForSlot = (slot: PedigreeSlot) =>
    collectHighlightTerms(
      keywordTerms,
      slot === FATHER_SLOT ? criteria.ownChildLine : "",
      slot === DAM_SIRE_SLOT ? criteria.damSireChildLine : ""
    );

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
