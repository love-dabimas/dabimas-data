import type { GenderTab } from "@/features/horses/model/types";
import { DEFAULT_RARE_CODES } from "@/shared/constants/rareCodes";

export interface SearchCriteria {
  fatherLines: string[];
  damSireLines: string[];
  migotoLines: string[];
  thinLines: string[];
  rareCodes: string[];
  keyword: string;
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}

export interface FilteredHorseGroups {
  stallions: number;
  broodmares: number;
  total: number;
  hasActivePrimaryFilters: boolean;
}

export const DEFAULT_VISIBLE_COUNT = 15;

export const createDefaultCriteria = (): SearchCriteria => ({
  fatherLines: [],
  damSireLines: [],
  migotoLines: [],
  thinLines: [],
  rareCodes: [...DEFAULT_RARE_CODES],
  keyword: "",
  ownChildLine: "",
  damSireChildLine: "",
  ancestorName: "",
  ancestorPositions: []
});

export const createVisibleCounts = (): Record<GenderTab, number> => ({
  "0": DEFAULT_VISIBLE_COUNT,
  "1": DEFAULT_VISIBLE_COUNT
});
