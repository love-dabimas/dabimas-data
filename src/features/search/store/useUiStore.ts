import { create } from "zustand";
import type { GenderTab } from "@/features/horses/model/types";
import {
  createVisibleCounts,
  DEFAULT_VISIBLE_COUNT
} from "@/features/search/model/searchCriteria";

// 検索条件そのものではなく、表示中タブや件数などの UI 状態だけをここで管理する。
interface UiState {
  activeTab: GenderTab;
  visibleCounts: Record<GenderTab, number>;
  setActiveTab: (tab: GenderTab) => void;
  resetVisibleCounts: () => void;
  increaseVisible: (tab: GenderTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  // 初期表示は種牡馬タブから始める。
  activeTab: "0",
  visibleCounts: createVisibleCounts(),
  // タブ切り替えは現在タブだけを差し替える。
  setActiveTab: (tab) => set({ activeTab: tab }),
  // 条件が変わったら表示件数も初期値に戻すために使う。
  resetVisibleCounts: () =>
    set({
      visibleCounts: createVisibleCounts()
    }),
  // 無限読み込み時は現在件数へ一定数ずつ加算する。
  increaseVisible: (tab) =>
    set((state) => ({
      visibleCounts: {
        ...state.visibleCounts,
        [tab]: state.visibleCounts[tab] + DEFAULT_VISIBLE_COUNT
      }
    }))
}));
