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
import type { HorseRecord } from "@/features/horses/model/types";
import type { SearchCriteria } from "@/features/search/model/searchCriteria";
import { HorseResultCard } from "@/features/search/ui/HorseResultCard";

interface ResultsPanelProps {
  records: HorseRecord[];
  criteria: SearchCriteria;
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

const EMPTY_IDLE_HEADING = "検索条件を指定してください";
const EMPTY_IDLE_BODY =
  "父系、母父系、見事、1薄め、キーワード、子系統、祖先検索のいずれかを指定すると検索できます。";
const EMPTY_RESULTS_HEADING = "該当する馬が見つかりませんでした";
const EMPTY_RESULTS_BODY =
  "条件を広げるか、レア条件の絞り込みを見直してください。";
const SUMMARY_SUFFIX = "件を表示";
const SUMMARY_MIDDLE = "件中";
const ESTIMATED_CARD_HEIGHT = 620;
const VIRTUAL_OVERSCAN_PX = 900;

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

  const handleMeasure = useCallback((index: number, height: number) => {
    const current = measuredHeightsRef.current.get(index);
    if (current === height) {
      return;
    }

    measuredHeightsRef.current.set(index, height);
    setMeasureVersion((version) => version + 1);
  }, []);

  return (
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
                <HorseResultCard horse={horse} criteria={criteria} />
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
  );
};

export const ResultsPanel = memo(ResultsPanelBase);
