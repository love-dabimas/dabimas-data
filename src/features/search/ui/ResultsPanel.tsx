import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import type { HorseRecord, HorseSkillData } from "@/features/horses/model/types";
import type { HorseCardHighlightCriteria } from "@/features/search/lib/createHorseCardHighlighter";
import { HorseResultCard } from "@/features/search/ui/HorseResultCard";
import { HorseSkillModal } from "@/features/search/ui/HorseSkillModal";

interface ResultsPanelProps {
  records: HorseRecord[];
  criteria: HorseCardHighlightCriteria;
  hasActivePrimaryFilters: boolean;
  visibleCount: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

interface VirtualRange {
  start: number;
  end: number;
  top: number;
  bottom: number;
}

interface VirtualRowProps {
  children: ReactNode;
  index: number;
  onMeasure: (index: number, height: number) => void;
}

interface ActiveSkillModalState {
  title: string;
  skill: HorseSkillData;
}

type ResultCardSkillKind = "ability" | "temperament";

const EMPTY_IDLE_HEADING = "検索条件を選択してください";
const EMPTY_IDLE_BODY =
  "キーワード、系統、能力、レア度、非凡・天性などから条件を指定すると、該当する馬を表示します。";
const EMPTY_RESULTS_HEADING = "該当する馬が見つかりませんでした";
const EMPTY_RESULTS_BODY =
  "条件を広げるか、レア条件の絞り込みを見直してください。";
const SUMMARY_SUFFIX = "件を表示";
const SUMMARY_MIDDLE = "件中";
const ESTIMATED_CARD_HEIGHT = 620;
const VIRTUAL_OVERSCAN_PX = 900;

const canOpenSkillModal = (skill?: HorseSkillData | null) =>
  Boolean(
    skill &&
      ((skill.detailTabs?.length ?? 0) > 0 ||
        (skill.description?.length ?? 0) > 0 ||
        skill.detailUrl)
  );

const createFallbackSkill = (name: string): HorseSkillData => ({
  name,
  description: ["詳細情報はまだ取得されていません。"],
  detailUrl: "",
  detailTabs: []
});

const skillKindFromValue = (value: string | undefined): ResultCardSkillKind | null =>
  value === "ability" || value === "temperament" ? value : null;

const skillModalStateForHorse = (
  horse: HorseRecord | undefined,
  kind: ResultCardSkillKind
): ActiveSkillModalState | null => {
  if (!horse) {
    return null;
  }

  const skill =
    kind === "ability"
      ? horse.card.abilityData ?? null
      : horse.card.temperamentData ?? null;
  const fallbackName =
    kind === "ability"
      ? horse.card.ability
      : horse.card.temperamentData?.name;
  const value = skill?.name || fallbackName || "なし";
  const fallbackSkill = value !== "なし" ? createFallbackSkill(value) : null;
  const modalSkill = skill ?? fallbackSkill;

  if (!modalSkill || (!canOpenSkillModal(modalSkill) && value === "なし")) {
    return null;
  }

  return {
    title: kind === "ability" ? "非凡" : "天性",
    skill: modalSkill
  };
};

const findOffsetIndex = (offsets: number[], value: number) => {
  let low = 0;
  let high = offsets.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] < value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.max(0, low - 1);
};

const VirtualRow = memo(({ children, index, onMeasure }: VirtualRowProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const measure = () => {
      onMeasure(index, Math.ceil(node.getBoundingClientRect().height));
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [index, onMeasure]);

  return (
    <div ref={ref} className="results-list__virtual-row">
      {children}
    </div>
  );
});

const ResultsPanelBase = ({
  records,
  criteria,
  hasActivePrimaryFilters,
  visibleCount: _visibleCount,
  sentinelRef: _sentinelRef
}: ResultsPanelProps) => {
  const isEmpty = !hasActivePrimaryFilters || records.length === 0;
  const listRef = useRef<HTMLDivElement>(null);
  const measuredHeightsRef = useRef<Map<number, number>>(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);
  const [activeSkillModal, setActiveSkillModal] = useState<ActiveSkillModalState | null>(null);
  const [viewport, setViewport] = useState(() => ({
    height: typeof window === "undefined" ? 900 : window.innerHeight,
    scrollY: typeof window === "undefined" ? 0 : window.scrollY
  }));

  useEffect(() => {
    measuredHeightsRef.current.clear();
    setMeasureVersion((version) => version + 1);
  }, [records, criteria]);

  useEffect(() => {
    let frameId = 0;

    const updateViewport = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        setViewport({
          height: window.innerHeight,
          scrollY: window.scrollY
        });
      });
    };

    updateViewport();
    window.addEventListener("scroll", updateViewport, { passive: true });
    window.addEventListener("resize", updateViewport);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  const offsets = useMemo(() => {
    const nextOffsets = new Array(records.length + 1);
    nextOffsets[0] = 0;

    for (let index = 0; index < records.length; index += 1) {
      nextOffsets[index + 1] =
        nextOffsets[index] +
        (measuredHeightsRef.current.get(index) ?? ESTIMATED_CARD_HEIGHT);
    }

    return nextOffsets;
  }, [records.length, measureVersion]);

  const virtualRange: VirtualRange = useMemo(() => {
    if (!hasActivePrimaryFilters || records.length === 0) {
      return { start: 0, end: 0, top: 0, bottom: 0 };
    }

    const listTop =
      (listRef.current?.getBoundingClientRect().top ?? 0) + viewport.scrollY;
    const visibleTop = Math.max(0, viewport.scrollY - listTop - VIRTUAL_OVERSCAN_PX);
    const visibleBottom = Math.max(
      visibleTop,
      viewport.scrollY + viewport.height - listTop + VIRTUAL_OVERSCAN_PX
    );
    const start = findOffsetIndex(offsets, visibleTop);
    const end = Math.min(records.length, findOffsetIndex(offsets, visibleBottom) + 2);
    const totalHeight = offsets[records.length] ?? 0;

    return {
      start,
      end,
      top: offsets[start] ?? 0,
      bottom: Math.max(0, totalHeight - (offsets[end] ?? totalHeight))
    };
  }, [
    hasActivePrimaryFilters,
    offsets,
    records.length,
    viewport.height,
    viewport.scrollY
  ]);

  const visibleRecords = hasActivePrimaryFilters
    ? records.slice(virtualRange.start, virtualRange.end)
    : [];
  const horseByKey = useMemo(
    () =>
      new Map(
        records.map((horse) => [
          `${horse.HorseId}-${horse.SerialNumber}`,
          horse
        ])
      ),
    [records]
  );

  const handleMeasure = useCallback((index: number, height: number) => {
    const current = measuredHeightsRef.current.get(index);
    if (current === height) {
      return;
    }

    measuredHeightsRef.current.set(index, height);
    setMeasureVersion((version) => version + 1);
  }, []);

  const handleOpenSkillModal = useCallback((title: string, skill: HorseSkillData) => {
    setActiveSkillModal({ title, skill });
  }, []);

  useEffect(() => {
    const root = listRef.current;
    if (!root) {
      return;
    }

    const handleNativeSkillActivation = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const skillElement = target.closest<HTMLElement>("[data-result-card-skill]");
      if (!skillElement || !root.contains(skillElement)) {
        return;
      }

      const kind = skillKindFromValue(skillElement.dataset.resultCardSkill);
      const horseId = skillElement.dataset.resultCardHorseId;
      const serial = skillElement.dataset.resultCardSerial;

      if (!kind || !horseId || !serial) {
        return;
      }

      const modalState = skillModalStateForHorse(horseByKey.get(`${horseId}-${serial}`), kind);
      if (!modalState) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveSkillModal(modalState);
    };

    root.addEventListener("click", handleNativeSkillActivation, true);
    root.addEventListener("touchend", handleNativeSkillActivation, {
      capture: true,
      passive: false
    });

    return () => {
      root.removeEventListener("click", handleNativeSkillActivation, true);
      root.removeEventListener("touchend", handleNativeSkillActivation, true);
    };
  }, [horseByKey]);

  return (
    <>
    <section className={`results-panel ${isEmpty ? "results-panel--empty" : ""}`}>
      {hasActivePrimaryFilters ? (
        <div className="results-panel__summary">
          <p>
            {records.length} {SUMMARY_MIDDLE} {records.length} {SUMMARY_SUFFIX}
          </p>
        </div>
      ) : null}

      {records.length > 0 ? (
        <div ref={listRef} className="results-list results-list--virtual">
          <div
            className="results-list__spacer"
            style={{ height: `${virtualRange.top}px` }}
          />
          {visibleRecords.map((horse, offset) => {
            const index = virtualRange.start + offset;
            return (
              <VirtualRow
                key={`${horse.HorseId}-${horse.SerialNumber}`}
                index={index}
                onMeasure={handleMeasure}
              >
                <HorseResultCard
                  horse={horse}
                  criteria={criteria}
                  onOpenSkillModal={handleOpenSkillModal}
                />
              </VirtualRow>
            );
          })}
          <div
            className="results-list__spacer"
            style={{ height: `${virtualRange.bottom}px` }}
          />
        </div>
      ) : (
        <div className="empty-state">
          <h2>{hasActivePrimaryFilters ? EMPTY_RESULTS_HEADING : EMPTY_IDLE_HEADING}</h2>
          <p>{hasActivePrimaryFilters ? EMPTY_RESULTS_BODY : EMPTY_IDLE_BODY}</p>
        </div>
      )}
    </section>
    {activeSkillModal ? (
      <HorseSkillModal
        open
        title={activeSkillModal.title}
        skill={activeSkillModal.skill}
        onClose={() => setActiveSkillModal(null)}
      />
    ) : null}
    </>
  );
};

export const ResultsPanel = memo(ResultsPanelBase);
