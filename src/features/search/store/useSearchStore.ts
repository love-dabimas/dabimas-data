import { create } from "zustand";
import {
  createDefaultCriteria,
  type SearchCriteria
} from "@/features/search/model/searchCriteria";

interface AdvancedFilters {
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}

interface SearchState {
  criteria: SearchCriteria;
  toggleFatherLine: (value: string) => void;
  toggleDamSireLine: (value: string) => void;
  toggleMigotoLine: (value: string) => void;
  toggleThinLine: (value: string) => void;
  toggleRareCode: (value: string) => void;
  setKeyword: (value: string) => void;
  applyAdvancedFilters: (value: AdvancedFilters) => void;
  resetCriteria: () => void;
}

const toggleArrayValue = (values: string[], nextValue: string) =>
  values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];

export const useSearchStore = create<SearchState>((set) => ({
  criteria: createDefaultCriteria(),
  toggleFatherLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        fatherLines: toggleArrayValue(state.criteria.fatherLines, value)
      }
    })),
  toggleDamSireLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        damSireLines: toggleArrayValue(state.criteria.damSireLines, value)
      }
    })),
  toggleMigotoLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        migotoLines: toggleArrayValue(state.criteria.migotoLines, value)
      }
    })),
  toggleThinLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        thinLines: toggleArrayValue(state.criteria.thinLines, value)
      }
    })),
  toggleRareCode: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        rareCodes: toggleArrayValue(state.criteria.rareCodes, value)
      }
    })),
  setKeyword: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        keyword: value
      }
    })),
  applyAdvancedFilters: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        ownChildLine: value.ownChildLine,
        damSireChildLine: value.damSireChildLine,
        ancestorName: value.ancestorName,
        ancestorPositions: value.ancestorPositions
      }
    })),
  resetCriteria: () =>
    set({
      criteria: createDefaultCriteria()
    })
}));

