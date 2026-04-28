import { create } from "zustand";
import {
  createDefaultCriteria,
  type SearchCriteria
} from "@/features/search/model/searchCriteria";

// モーダル側でまとめて更新する詳細条件だけを抜き出した入力型。
interface AdvancedFilters {
  theory: string[];
  runningStyle: string[];
  growth: string[];
  dirt: string[];
  achievement: string[];
  stable: string[];
  clemency: string[];
  potential: string[];
  health: string[];
  temperamentNames: string[];
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
  applyNonordinaryHorseIds: (horseIds: string[]) => void;
  resetCriteria: () => void;
}

// チップ式の複数選択条件は「含まれていれば外す / なければ追加する」で統一する。
const toggleArrayValue = (values: string[], nextValue: string) =>
  values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];

export const useSearchStore = create<SearchState>((set) => ({
  criteria: createDefaultCriteria(),
  // 自身の親系統チップをトグルする。
  toggleFatherLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        fatherLines: toggleArrayValue(state.criteria.fatherLines, value)
      }
    })),
  // 母父の親系統チップをトグルする。
  toggleDamSireLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        damSireLines: toggleArrayValue(state.criteria.damSireLines, value)
      }
    })),
  // 見事条件は複数コードの AND 条件になるので配列で保持する。
  toggleMigotoLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        migotoLines: toggleArrayValue(state.criteria.migotoLines, value)
      }
    })),
  // 1 薄め条件も同じトグル形式で管理する。
  toggleThinLine: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        thinLines: toggleArrayValue(state.criteria.thinLines, value)
      }
    })),
  // レア条件は性別ごとに有効コードが変わるが、選択自体はそのまま保持する。
  toggleRareCode: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        rareCodes: toggleArrayValue(state.criteria.rareCodes, value)
      }
    })),
  // キーワードは自由入力なので文字列を丸ごと置き換える。
  setKeyword: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        keyword: value
      }
    })),
  // モーダル内で編集した詳細条件を一括で反映する。
  applyAdvancedFilters: (value) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        theory: value.theory,
        runningStyle: value.runningStyle,
        growth: value.growth,
        dirt: value.dirt,
        achievement: value.achievement,
        stable: value.stable,
        clemency: value.clemency,
        potential: value.potential,
        health: value.health,
        temperamentNames: value.temperamentNames,
        ownChildLine: value.ownChildLine,
        damSireChildLine: value.damSireChildLine,
        ancestorName: value.ancestorName,
        ancestorPositions: value.ancestorPositions
      }
    })),
  applyNonordinaryHorseIds: (horseIds) =>
    set((state) => ({
      criteria: {
        ...state.criteria,
        nonordinaryHorseIds: [...horseIds]
      }
    })),
  // 全条件リセット時は新しい初期値オブジェクトを作り直す。
  resetCriteria: () =>
    set({
      criteria: createDefaultCriteria()
    })
}));
