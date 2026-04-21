import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { FactorOption, HorseRecord } from "@/features/horses/model/types";
import type { ChildLineOption } from "@/features/search/model/childLineOption";
import { filterHorseRecords } from "@/features/search/lib/filterHorseRecords";
import { useSearchStore } from "@/features/search/store/useSearchStore";
import { useUiStore } from "@/features/search/store/useUiStore";
import { AncestorModal } from "@/features/search/ui/AncestorModal";
import { FilterSection } from "@/features/search/ui/FilterSection";
import { ResultsPanel } from "@/features/search/ui/ResultsPanel";
import { PARENT_LINE_OPTIONS } from "@/shared/constants/parentLines";
import { RARE_OPTIONS } from "@/shared/constants/rareCodes";

// 検索画面は、元データと補助マスタをすべて受け取って自己完結で描画する。
interface SearchPageProps {
  horses: HorseRecord[];
  factors: FactorOption[];
  lineOptions: ChildLineOption[];
  lineHtOptions: ChildLineOption[];
}

type QuickFilterTab = "father" | "damSire" | "migoto" | "thin" | "rare";

const SCROLL_TOP_BUTTON_THRESHOLD = 180;
const RARE_LABEL_BY_VALUE = new Map<string, string>(
  RARE_OPTIONS.map(({ value, label }) => [value, label])
);

// レアコードは画面で見慣れたラベルへ変換して表示する。
const formatRareCodes = (rareCodes: string[]) =>
  rareCodes.map((code) => RARE_LABEL_BY_VALUE.get(code) ?? code).join(", ");

// 開いている検索条件を「確認」欄へ自然文で並べる。
const buildActiveSummaries = (
  criteria: ReturnType<typeof useSearchStore.getState>["criteria"]
) => {
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
  lineOptions,
  lineHtOptions
}: SearchPageProps) => {
  // 検索条件と UI 状態は zustand ストアから個別に取り出して再描画を最小化する。
  const criteria = useSearchStore((state) => state.criteria);
  const toggleFatherLine = useSearchStore((state) => state.toggleFatherLine);
  const toggleDamSireLine = useSearchStore((state) => state.toggleDamSireLine);
  const toggleMigotoLine = useSearchStore((state) => state.toggleMigotoLine);
  const toggleThinLine = useSearchStore((state) => state.toggleThinLine);
  const toggleRareCode = useSearchStore((state) => state.toggleRareCode);
  const setKeyword = useSearchStore((state) => state.setKeyword);
  const resetCriteria = useSearchStore((state) => state.resetCriteria);

  const activeTab = useUiStore((state) => state.activeTab);
  const visibleCounts = useUiStore((state) => state.visibleCounts);
  const setActiveTab = useUiStore((state) => state.setActiveTab);
  const resetVisibleCounts = useUiStore((state) => state.resetVisibleCounts);
  const increaseVisible = useUiStore((state) => state.increaseVisible);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isScrollTopVisible, setIsScrollTopVisible] = useState(false);
  const [activeQuickTab, setActiveQuickTab] = useState<QuickFilterTab>("father");
  const stallionSentinelRef = useRef<HTMLDivElement>(null);
  const broodmareSentinelRef = useRef<HTMLDivElement>(null);

  // 入力直後の state と、実際に検索へ使う state を少しずらして重さを和らげる。
  const deferredCriteria = useDeferredValue(criteria);
  const isSearchUpdating = deferredCriteria !== criteria;
  const criteriaKey = useMemo(() => JSON.stringify(criteria), [criteria]);
  const results = useMemo(
    () => filterHorseRecords(horses, deferredCriteria),
    [horses, deferredCriteria]
  );
  const activeSummaries = useMemo(() => buildActiveSummaries(criteria), [criteria]);
  const activeRecords = activeTab === "0" ? results.stallions : results.broodmares;
  const activeSentinelRef =
    activeTab === "0" ? stallionSentinelRef : broodmareSentinelRef;
  const activeVisibleCount = visibleCounts[activeTab];

  // 上段のクイック条件タブは、ラベル・件数・本体パネルをセットで持つ。
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

  useEffect(() => {
    // 一定量スクロールしたらページ先頭へ戻るボタンを出す。
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
    // 条件が変わったら、無限読み込み件数も最初からに戻す。
    resetVisibleCounts();
  }, [criteriaKey, resetVisibleCounts]);

  useEffect(() => {
    // 現在タブの末尾 sentinel を監視し、見えたら表示件数を追加する。
    const node = activeSentinelRef.current;

    if (!node || !results.hasActivePrimaryFilters) {
      return;
    }

    if (visibleCounts[activeTab] >= activeRecords.length) {
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
    increaseVisible,
    results.hasActivePrimaryFilters,
    visibleCounts
  ]);

  return (
    <main className="screen">
      <div className="shell app-shell">
        {/* 上段は検索条件操作エリア。 */}
        <section className="control-panel control-panel--compact">
          <div className="control-panel__header control-panel__header--compact">
            <h2>基本条件</h2>
            <div className="control-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsModalOpen(true)}
              >
                祖先絞込
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
                // 入力値はそのままストアへ流し、下の検索結果が追随する。
                const v = event.target.value;
                setKeyword(v);
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
              {/* 現在の条件をタグ状に見せて、何を掛けているかをすぐ確認できるようにする。 */}
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
                  自身・母父・見事・1薄・キーワード・子系統・祖先条件のいずれかを指定すると検索できます。
                </p>
              )}
            </div>
          </details>
        </section>

        <div className="results-stack">
          {/* ここから下は検索結果表示エリア。 */}
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
              <div
                className="results-shell__panel is-active"
              >
                <ResultsPanel
                  key={activeTab}
                  criteria={deferredCriteria}
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

      {isSearchUpdating ? (
        // useDeferredValue により計算が追いついていない間だけ薄いオーバーレイを出す。
        <div className="search-overlay" aria-live="polite" aria-label="検索中">
          <div className="search-overlay__card" aria-hidden="true">
            <span className="search-overlay__spinner" />
            <span className="search-overlay__label">検索中…</span>
          </div>
        </div>
      ) : null}

      {isScrollTopVisible ? (
        // 長い結果一覧でも上へ戻りやすいよう、右下固定ボタンを出す。
        <button
          aria-label="ページ先頭へ戻る"
          className="scroll-top-button"
          type="button"
          onClick={scrollToTop}
        >
          {"\u2191"}
        </button>
      ) : null}

      {/* 詳細条件は常に描画しておき、open の切り替えだけで表示制御する。 */}
      <AncestorModal
        open={isModalOpen}
        factors={factors}
        lineOptions={lineOptions}
        lineHtOptions={lineHtOptions}
        onClose={() => setIsModalOpen(false)}
      />
    </main>
  );
};
