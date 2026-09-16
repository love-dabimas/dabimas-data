import type { GenderTab } from "@/features/horses/model/types";
import { DEFAULT_RARE_CODES } from "@/shared/constants/rareCodes";

// 検索画面で保持する全条件を 1 つのオブジェクトに集約する。
export interface SearchCriteria {
  fatherLines: string[];
  damSireLines: string[];
  migotoLines: string[];
  thinLines: string[];
  rareCodes: string[];
  keyword: string;
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
  // 自身が持つ因子の数（"0"〜"3"）。複数選ぶと「どれか」になる。
  selfFactorCounts: string[];
  // 非凡を持っているか（"has" / "none"）。非凡モーダルの条件検索とは別で、
  // 「非凡を持っていない馬だけ」を出すために使う。
  nonordinaryPresence: string[];
  nonordinaryHorseIds: string[] | null;
  nonordinarySearchSummary: string[];
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}

// 集計用の件数情報。表示タブとは別に検索結果全体の状況を伝える。
export interface FilteredHorseGroups {
  stallions: number;
  broodmares: number;
  total: number;
  hasActivePrimaryFilters: boolean;
}

export const DEFAULT_VISIBLE_COUNT = 15;

// 新規表示時やリセット時に使う検索条件の初期値。
export const createDefaultCriteria = (): SearchCriteria => ({
  fatherLines: [],
  damSireLines: [],
  migotoLines: [],
  thinLines: [],
  rareCodes: [...DEFAULT_RARE_CODES],
  keyword: "",
  theory: [],
  runningStyle: [],
  growth: [],
  dirt: [],
  achievement: [],
  stable: [],
  clemency: [],
  potential: [],
  health: [],
  temperamentNames: [],
  selfFactorCounts: [],
  nonordinaryPresence: [],
  nonordinaryHorseIds: null,
  nonordinarySearchSummary: [],
  ownChildLine: "",
  damSireChildLine: "",
  ancestorName: "",
  ancestorPositions: []
});

// 無限読み込みの初期表示件数を、タブごとに同じ値で持たせる。
export const createVisibleCounts = (): Record<GenderTab, number> => ({
  "0": DEFAULT_VISIBLE_COUNT,
  "1": DEFAULT_VISIBLE_COUNT
});
