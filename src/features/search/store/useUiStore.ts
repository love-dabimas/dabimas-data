import { create } from "zustand";
import type { GenderTab } from "@/features/horses/model/types";
import {
  createVisibleCounts,
  DEFAULT_VISIBLE_COUNT
} from "@/features/search/model/searchCriteria";

interface UiState {
  activeTab: GenderTab;
  visibleCounts: Record<GenderTab, number>;
  setActiveTab: (tab: GenderTab) => void;
  resetVisibleCounts: () => void;
  increaseVisible: (tab: GenderTab) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: "0",
  visibleCounts: createVisibleCounts(),
  setActiveTab: (tab) => set({ activeTab: tab }),
  resetVisibleCounts: () =>
    set({
      visibleCounts: createVisibleCounts()
    }),
  increaseVisible: (tab) =>
    set((state) => ({
      visibleCounts: {
        ...state.visibleCounts,
        [tab]: state.visibleCounts[tab] + DEFAULT_VISIBLE_COUNT
      }
    }))
}));

