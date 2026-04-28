import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { FactorOption, HorseRecord } from "@/features/horses/model/types";
import type { NonordinaryBundle } from "@/features/nonordinary/model/types";
import type { ChildLineOption } from "@/features/search/model/childLineOption";
import { pickHorseCardHighlightCriteria } from "@/features/search/lib/createHorseCardHighlighter";
import {
  createHorseSearchIndex,
  filterHorseRecords,
  sortHorseRecords
} from "@/features/search/lib/filterHorseRecords";
import {
  DEFAULT_VISIBLE_COUNT,
  type SearchCriteria
} from "@/features/search/model/searchCriteria";
import { useSearchStore } from "@/features/search/store/useSearchStore";
import { useUiStore } from "@/features/search/store/useUiStore";
import { AncestorModal } from "@/features/search/ui/AncestorModal";
import { FilterSection } from "@/features/search/ui/FilterSection";
import { NonordinaryModal } from "@/features/search/ui/NonordinaryModal";
import { ResultsPanel } from "@/features/search/ui/ResultsPanel";
import { PARENT_LINE_OPTIONS } from "@/shared/constants/parentLines";
import { RARE_OPTIONS } from "@/shared/constants/rareCodes";

interface SearchPageProps {
  horses: HorseRecord[];
  factors: FactorOption[];
  nonordinaryBundle: NonordinaryBundle;
  lineOptions: ChildLineOption[];
  lineHtOptions: ChildLineOption[];
}

type QuickFilterTab = "father" | "damSire" | "migoto" | "thin" | "rare";

const SCROLL_TOP_BUTTON_THRESHOLD = 180;
const SEARCH_FEEDBACK_MIN_MS = 260;
const RARE_LABEL_BY_VALUE = new Map<string, string>(
  RARE_OPTIONS.map(({ value, label }) => [value, label])
);
const RUNNING_STYLE_LABEL_BY_VALUE: Record<string, string> = {
  逃: "逃げ",
  先: "先行",
  差: "差し",
  追: "追込",
  自: "自在"
};
const GROWTH_LABEL_BY_VALUE: Record<string, string> = {
  早: "早熟",
  普: "普通",
  晩: "晩成"
};
const THEORY_LABEL_BY_VALUE: Record<string, string> = {
  perfect: "完璧",
  superPerfect: "超完璧",
  miracle: "奇跡",
  shiho: "至高"
};
const ABILITY_LABEL_BY_KEY: Partial<Record<keyof SearchCriteria, string>> = {
  dirt: "適応力",
  achievement: "実績",
  stable: "安定",
  clemency: "気性",
  potential: "底力",
  health: "体質"
};

const formatRareCodes = (rareCodes: string[]) =>
  rareCodes.map((code) => RARE_LABEL_BY_VALUE.get(code) ?? code).join(", ");

const buildActiveSummaries = (criteria: SearchCriteria) => {
  const items: string[] = [];

  if (criteria.fatherLines.length > 0) {
    items.push(`自身: ${criteria.fatherLines.join(", ")}`);
  }
  if (criteria.damSireLines.length > 0) {
    items.push(`母父: ${criteria.damSireLines.join(", ")}`);
  }
  if (criteria.migotoLines.length > 0) {
    items.push(`見事: ${criteria.migotoLines.join(", ")}`);
  }
  if (criteria.thinLines.length > 0) {
    items.push(`1薄: ${criteria.thinLines.join(", ")}`);
  }
  if (criteria.rareCodes.length > 0) {
    items.push(`レア: ${formatRareCodes(criteria.rareCodes)}`);
  }
  if (criteria.keyword.trim()) {
    items.push(`キーワード: ${criteria.keyword.trim()}`);
  }
  if (criteria.temperamentNames.length > 0) {
    items.push(`天性: ${criteria.temperamentNames.join(", ")}`);
  }
  if (criteria.nonordinaryHorseIds !== null) {
    items.push(`非凡検索: ${criteria.nonordinaryHorseIds.length}頭`);
  }
  if (criteria.theory.length > 0) {
    items.push(
      `配合理論: ${criteria.theory
        .map((value) => THEORY_LABEL_BY_VALUE[value] ?? value)
        .join(", ")}`
    );
  }
  if (criteria.runningStyle.length > 0) {
    items.push(
      `脚質: ${criteria.runningStyle
        .map((value) => RUNNING_STYLE_LABEL_BY_VALUE[value] ?? value)
        .join(", ")}`
    );
  }
  if (criteria.growth.length > 0) {
    items.push(
      `成長型: ${criteria.growth
        .map((value) => GROWTH_LABEL_BY_VALUE[value] ?? value)
        .join(", ")}`
    );
  }
  (["dirt", "achievement", "stable", "clemency", "potential", "health"] as const).forEach(
    (key) => {
      const value = criteria[key];
      if (value.length > 0) {
        items.push(`${ABILITY_LABEL_BY_KEY[key]}: ${value.join(", ")}`);
      }
    }
  );
  if (criteria.ownChildLine) {
    items.push(`自身の子系統: ${criteria.ownChildLine}`);
  }
  if (criteria.damSireChildLine) {
    items.push(`母父の子系統: ${criteria.damSireChildLine}`);
  }
  if (criteria.ancestorName.trim() && criteria.ancestorPositions.length > 0) {
    items.push(
      `祖先: ${criteria.ancestorName.trim()} (${criteria.ancestorPositions.join(", ")})`
    );
  }

  return items;
};

export const SearchPage = ({
  horses,
  factors,
  nonordinaryBundle,
  lineOptions,
  lineHtOptions
}: SearchPageProps) => {
  const criteria = useSearchStore((state) => state.criteria);
  const toggleFatherLine = useSearchStore((state) => state.toggleFatherLine);
  const toggleDamSireLine = useSearchStore((state) => state.toggleDamSireLine);
  const toggleMigotoLine = useSearchStore((state) => state.toggleMigotoLine);
  const toggleThinLine = useSearchStore((state) => state.toggleThinLine);
  const toggleRareCode = useSearchStore((state) => state.toggleRareCode);
  const setKeyword = useSearchStore((state) => state.setKeyword);
  const applyNonordinaryHorseIds = useSearchStore(
    (state) => state.applyNonordinaryHorseIds
  );
  const resetCriteria = useSearchStore((state) => state.resetCriteria);

  const activeTab = useUiStore((state) => state.activeTab);
  const visibleCounts = useUiStore((state) => state.visibleCounts);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const resetVisibleCounts = useUiStore((state) => state.resetVisibleCounts);
  const increaseVisible = useUiStore((state) => state.increaseVisible);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNonordinaryModalOpen, setIsNonordinaryModalOpen] = useState(false);
  const [isSearchFeedbackVisible, setIsSearchFeedbackVisible] = useState(false);
  const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
  const [activeQuickTab, setActiveQuickTab] = useState<QuickFilterTab>("father");
  const stallionSentinelRef = useRef<HTMLDivElement>(null);
  const broodmareSentinelRef = useRef<HTMLDivElement>(null);
  const searchFeedbackStartedAtRef = useRef(0);
  const searchFeedbackTimerRef = useRef<number | null>(null);
  const sortedHorses = useMemo(() => sortHorseRecords(horses), [horses]);
  const temperamentOptions = useMemo(
    () =>
      [...new Set(sortedHorses
        .map((horse) => horse.card.temperamentData?.name)
        .filter((name): name is string => Boolean(name)))]
        .sort((left, right) => left.localeCompare(right, "ja"))
        .map((name) => ({ value: name, label: name })),
    [sortedHorses]
  );
  const horseSearchIndex = useMemo(() => createHorseSearchIndex(sortedHorses), [sortedHorses]);

  const deferredCriteria = useDeferredValue(criteria);
  const isSearchUpdating = deferredCriteria !== criteria;
  const criteriaKey = useMemo(() => JSON.stringify(criteria), [criteria]);
  const previousCriteriaKeyRef = useRef(criteriaKey);
  const results = useMemo(
    () => filterHorseRecords(horseSearchIndex, deferredCriteria),
    [horseSearchIndex, deferredCriteria]
  );
  const highlightCriteria = useMemo(
    () => pickHorseCardHighlightCriteria(deferredCriteria),
    [
      deferredCriteria.keyword,
      deferredCriteria.ancestorName,
      deferredCriteria.ancestorPositions,
      deferredCriteria.damSireLines,
      deferredCriteria.thinLines,
      deferredCriteria.migotoLines,
      deferredCriteria.ownChildLine,
      deferredCriteria.damSireChildLine
    ]
  );
  const activeSummaries = useMemo(() => buildActiveSummaries(criteria), [criteria]);
  const activeRecords = activeTab === "0" ? results.stallions : results.broodmares;
  const activeSentinelRef =
    activeTab === "0" ? stallionSentinelRef : broodmareSentinelRef;
  const criteriaJustChanged = previousCriteriaKeyRef.current !== criteriaKey;
  const activeVisibleCount = criteriaJustChanged
    ? DEFAULT_VISIBLE_COUNT
    : visibleCounts[activeTab];

  const quickTabItems = [
    {
      id: "father" as const,
      label: "自身",
      count: criteria.fatherLines.length,
      panel: (
        <FilterSection
          title="自身"
          subtitle="自身の親系統で検索"
          options={PARENT_LINE_OPTIONS}
          selectedValues={criteria.fatherLines}
          onToggle={toggleFatherLine}
        />
      )
    },
    {
      id: "damSire" as const,
      label: "母父",
      count: criteria.damSireLines.length,
      panel: (
        <FilterSection
          title="母父"
          subtitle="Paternal_ht の完全一致"
          options={PARENT_LINE_OPTIONS}
          selectedValues={criteria.damSireLines}
          onToggle={toggleDamSireLine}
        />
      )
    },
    {
      id: "migoto" as const,
      label: "見事",
      count: criteria.migotoLines.length,
      panel: (
        <FilterSection
          title="見事"
          subtitle="Paternal_mig の AND 条件"
          options={PARENT_LINE_OPTIONS}
          selectedValues={criteria.migotoLines}
          onToggle={toggleMigotoLine}
        />
      )
    },
    {
      id: "thin" as const,
      label: "1薄",
      count: criteria.thinLines.length,
      panel: (
        <FilterSection
          title="1薄"
          subtitle="Paternal_jik の AND 条件"
          options={PARENT_LINE_OPTIONS}
          selectedValues={criteria.thinLines}
          onToggle={toggleThinLine}
        />
      )
    },
    {
      id: "rare" as const,
      label: "レア",
      count: criteria.rareCodes.length,
      panel: (
        <FilterSection
          title="レア"
          subtitle="性別ごとのレア / 名牝コード指定"
          options={RARE_OPTIONS}
          selectedValues={criteria.rareCodes}
          onToggle={toggleRareCode}
        />
      )
    }
  ];

  const activeQuickPanel =
    quickTabItems.find((item) => item.id === activeQuickTab)?.panel ?? quickTabItems[0].panel;
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showSearchFeedback = () => {
    if (searchFeedbackTimerRef.current !== null) {
      window.clearTimeout(searchFeedbackTimerRef.current);
      searchFeedbackTimerRef.current = null;
    }

    searchFeedbackStartedAtRef.current = Date.now();
    setIsSearchFeedbackVisible(true);
  };

  const handleApplyNonordinaryHorseIds = useCallback(
    (horseIds: string[]) => {
      showSearchFeedback();
      setIsNonordinaryModalOpen(false);
      setActiveTab("0");

      const apply = () => applyNonordinaryHorseIds(horseIds);

      if (typeof window === "undefined") {
        apply();
        return;
      }

      window.requestAnimationFrame(() => {
        window.setTimeout(apply, 0);
      });
    },
    [applyNonordinaryHorseIds, setActiveTab]
  );

  useEffect(() => {
    const updateScrollTopVisibility = () => {
      const shouldShow = window.scrollY > SCROLL_TOP_BUTTON_THRESHOLD;
      setIsScrollTopVisible((current) => (current === shouldShow ? current : shouldShow));
    };

    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollTopVisibility);
    };
  }, []);

  useEffect(() => {
    previousCriteriaKeyRef.current = criteriaKey;
    resetVisibleCounts();
  }, [criteriaKey, resetVisibleCounts]);

  useEffect(() => {
    if (!isSearchFeedbackVisible) {
      return;
    }

    const elapsed = Date.now() - searchFeedbackStartedAtRef.current;
    const delay = Math.max(0, SEARCH_FEEDBACK_MIN_MS - elapsed);
    const timerId = window.setTimeout(() => {
      searchFeedbackTimerRef.current = null;
      setIsSearchFeedbackVisible(false);
    }, delay);

    searchFeedbackTimerRef.current = timerId;

    return () => {
      window.clearTimeout(timerId);
      if (searchFeedbackTimerRef.current === timerId) {
        searchFeedbackTimerRef.current = null;
      }
    };
  }, [criteriaKey, isSearchFeedbackVisible]);

  useEffect(() => {
    const node = activeSentinelRef.current;

    if (!node || !results.hasActivePrimaryFilters) {
      return;
    }

    if (activeVisibleCount >= activeRecords.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          increaseVisible(activeTab);
        }
      },
      { rootMargin: "420px 0px" }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [
    activeRecords.length,
    activeSentinelRef,
    activeTab,
    activeVisibleCount,
    increaseVisible,
    results.hasActivePrimaryFilters
  ]);

  return (
    <main className="screen">
      <div className="shell app-shell">
        <section className="control-panel control-panel--compact">
          <div className="control-panel__header control-panel__header--compact">
            <h2>基本条件</h2>
            <div className="control-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsModalOpen(true)}
              >
                絞り込み
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsNonordinaryModalOpen(true)}
              >
                非凡
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={resetCriteria}
              >
                全条件リセット
              </button>
            </div>
          </div>

          <div className="keyword-block keyword-block--compact">
            <input
              id="keyword"
              aria-label="キーワード検索"
              className="text-input"
              placeholder="キーワード検索"
              value={criteria.keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
            />
          </div>

          <div className="quick-tabs" role="tablist" aria-label="基本条件タブ">
            {quickTabItems.map((item) => (
              <button
                key={item.id}
                aria-selected={activeQuickTab === item.id}
                className={`quick-tab-button ${activeQuickTab === item.id ? "is-active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setActiveQuickTab(item.id)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>

          <div className="quick-panel">{activeQuickPanel}</div>

          <details className="condition-accordion">
            <summary>検索条件の確認</summary>
            <div className="condition-accordion__body">
              {activeSummaries.length > 0 ? (
                <div className="chip-row">
                  {activeSummaries.map((summary) => (
                    <span key={summary} className="chip">
                      {summary}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="support-copy">
                  キーワード、系統、能力、レア度、非凡・天性などから条件を指定すると検索できます。
                </p>
              )}
            </div>
          </details>
        </section>

        <div className="results-stack">
          <section className="results-tabs-shell">
            <div className="tab-strip" role="tablist" aria-label="検索対象タブ">
              <button
                aria-selected={activeTab === "0"}
                className={`tab-button ${activeTab === "0" ? "is-active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setActiveTab("0")}
              >
                種牡馬
                <span>{results.stallions.length}</span>
              </button>
              <button
                aria-selected={activeTab === "1"}
                className={`tab-button ${activeTab === "1" ? "is-active" : ""}`}
                role="tab"
                type="button"
                onClick={() => setActiveTab("1")}
              >
                牝馬
                <span>{results.broodmares.length}</span>
              </button>
            </div>
          </section>

          <section className="results-shell">
            <div className="results-shell__panels">
              <div className="results-shell__panel is-active">
                <ResultsPanel
                  key={activeTab}
                  criteria={highlightCriteria}
                  hasActivePrimaryFilters={results.hasActivePrimaryFilters}
                  records={activeRecords}
                  sentinelRef={activeSentinelRef}
                  visibleCount={activeVisibleCount}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      {isSearchUpdating || isSearchFeedbackVisible ? (
        <div className="search-overlay" aria-live="polite" aria-label="検索中">
          <div className="search-overlay__card" aria-hidden="true">
            <span className="search-overlay__spinner" />
            <span className="search-overlay__label">検索中…</span>
          </div>
        </div>
      ) : null}

      {isScrollTopVisible ? (
        <button
          aria-label="ページ先頭へ戻る"
          className="scroll-top-button"
          type="button"
          onClick={scrollToTop}
        >
          {"\u2191"}
        </button>
      ) : null}

      <AncestorModal
        open={isModalOpen}
        factors={factors}
        lineOptions={lineOptions}
        lineHtOptions={lineHtOptions}
        temperamentOptions={temperamentOptions}
        onApplyStart={showSearchFeedback}
        onClose={() => setIsModalOpen(false)}
      />
      <NonordinaryModal
        bundle={nonordinaryBundle}
        horses={horses}
        open={isNonordinaryModalOpen}
        onApplyHorseIds={handleApplyNonordinaryHorseIds}
        onClose={() => setIsNonordinaryModalOpen(false)}
      />
    </main>
  );
};
