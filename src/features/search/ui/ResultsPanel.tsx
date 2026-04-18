import { memo, useEffect, useRef, useState, type RefObject } from "react";
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

const EMPTY_IDLE_HEADING = "\u691c\u7d22\u6761\u4ef6\u3092\u6307\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044";
const EMPTY_IDLE_BODY =
  "\u7236\u7cfb\u3001\u6bcd\u7236\u7cfb\u3001\u898b\u4e8b\u30011\u8584\u3081\u3001\u30ad\u30fc\u30ef\u30fc\u30c9\u3001\u5b50\u7cfb\u7d71\u3001\u7956\u5148\u691c\u7d22\u306e\u3044\u305a\u308c\u304b\u3092\u6307\u5b9a\u3059\u308b\u3068\u691c\u7d22\u3067\u304d\u307e\u3059\u3002";
const EMPTY_RESULTS_HEADING =
  "\u8a72\u5f53\u3059\u308b\u99ac\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f";
const EMPTY_RESULTS_BODY =
  "\u6761\u4ef6\u3092\u5e83\u3052\u308b\u304b\u3001\u30ec\u30a2\u6761\u4ef6\u306e\u7d5e\u308a\u8fbc\u307f\u3092\u898b\u76f4\u3057\u3066\u304f\u3060\u3055\u3044\u3002";
const APPLYING_LABEL = "\u6761\u4ef6\u3092\u53cd\u6620\u4e2d\u2026";
const SENTINEL_LABEL = "\u3055\u3089\u306b\u8aad\u307f\u8fbc\u307f\u4e2d\u2026";
const SUMMARY_SUFFIX = "\u4ef6\u3092\u8868\u793a";
const SUMMARY_MIDDLE = "\u4ef6\u4e2d";
const DEFAULT_ESTIMATED_CARD_HEIGHT = 674;
const MIN_RENDERED_CARDS = 6;
const VIRTUAL_OVERSCAN = 3;

const useVirtualRange = (itemCount: number) => {
  const listRef = useRef<HTMLDivElement>(null);
  const itemHeightRef = useRef(DEFAULT_ESTIMATED_CARD_HEIGHT);
  const [itemHeight, setItemHeightState] = useState(DEFAULT_ESTIMATED_CARD_HEIGHT);
  const [range, setRange] = useState({
    start: 0,
    end: Math.min(itemCount, MIN_RENDERED_CARDS)
  });

  useEffect(() => {
    let frameId = 0;

    const setItemHeight = (nextHeight: number) => {
      if (Math.abs(itemHeightRef.current - nextHeight) < 1) {
        return;
      }

      itemHeightRef.current = nextHeight;
      setItemHeightState(nextHeight);
    };

    const measureItemHeight = (list: HTMLDivElement) => {
      const card = list.querySelector<HTMLElement>(".result-card");

      if (!card) {
        return itemHeightRef.current;
      }

      const listStyle = getComputedStyle(list);
      const gap = Number.parseFloat(listStyle.rowGap || listStyle.gap || "0") || 0;
      const nextHeight = Math.max(1, card.getBoundingClientRect().height + gap);
      setItemHeight(nextHeight);
      return nextHeight;
    };

    const updateRange = () => {
      const list = listRef.current;

      if (!list || itemCount === 0) {
        setRange({ start: 0, end: 0 });
        return;
      }

      const measuredItemHeight = measureItemHeight(list);
      const listTop = list.getBoundingClientRect().top + window.scrollY;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const rawStart = Math.floor((viewportTop - listTop) / measuredItemHeight);
      const rawEnd = Math.ceil((viewportBottom - listTop) / measuredItemHeight);
      const start = Math.max(0, Math.min(itemCount, rawStart - VIRTUAL_OVERSCAN));
      const end = Math.max(
        Math.min(itemCount, start + MIN_RENDERED_CARDS),
        Math.min(itemCount, rawEnd + VIRTUAL_OVERSCAN)
      );

      setRange((current) =>
        current.start === start && current.end === end ? current : { start, end }
      );
    };

    const scheduleUpdate = () => {
      if (frameId !== 0) {
        return;
      }

      frameId = requestAnimationFrame(() => {
        frameId = 0;
        updateRange();
      });
    };

    updateRange();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const list = listRef.current;

    if (list) {
      resizeObserver.observe(list);
    }

    return () => {
      if (frameId !== 0) {
        cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      resizeObserver.disconnect();
    };
  }, [itemCount]);

  return { itemHeight, listRef, range };
};

const ResultsPanelBase = ({
  records,
  criteria,
  hasActivePrimaryFilters,
  visibleCount,
  sentinelRef
}: ResultsPanelProps) => {
  const visibleRecords = hasActivePrimaryFilters ? records.slice(0, visibleCount) : [];
  const isEmpty = !hasActivePrimaryFilters || records.length === 0;
  const { itemHeight, listRef, range } = useVirtualRange(visibleRecords.length);
  const virtualStart = Math.min(range.start, visibleRecords.length);
  const virtualEnd = Math.min(Math.max(range.end, virtualStart), visibleRecords.length);
  const virtualRecords = visibleRecords.slice(virtualStart, virtualEnd);
  const topSpacerHeight = virtualStart * itemHeight;
  const bottomSpacerHeight = (visibleRecords.length - virtualEnd) * itemHeight;

  return (
    <section className={`results-panel ${isEmpty ? "results-panel--empty" : ""}`}>
      {hasActivePrimaryFilters ? (
        <div className="results-panel__summary">
          <p>
            {records.length} {SUMMARY_MIDDLE} {visibleRecords.length} {SUMMARY_SUFFIX}
          </p>
        </div>
      ) : null}

      {records.length > 0 ? (
        <>
          <div ref={listRef} className="results-list">
            {topSpacerHeight > 0 ? (
              <div
                aria-hidden="true"
                className="results-list__spacer"
                style={{ height: `${topSpacerHeight}px` }}
              />
            ) : null}

            {virtualRecords.map((horse) => (
              <HorseResultCard
                key={`${horse.HorseId}-${horse.SerialNumber}`}
                horse={horse}
                criteria={criteria}
              />
            ))}

            {bottomSpacerHeight > 0 ? (
              <div
                aria-hidden="true"
                className="results-list__spacer"
                style={{ height: `${bottomSpacerHeight}px` }}
              />
            ) : null}
          </div>

          {visibleRecords.length < records.length ? (
            <div ref={sentinelRef} className="result-sentinel">
              {SENTINEL_LABEL}
            </div>
          ) : null}
        </>
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
