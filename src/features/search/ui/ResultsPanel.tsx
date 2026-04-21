import { memo, type RefObject } from "react";
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
const ResultsPanelBase = ({
  records,
  criteria,
  hasActivePrimaryFilters,
  visibleCount,
  sentinelRef
}: ResultsPanelProps) => {
  const visibleRecords = hasActivePrimaryFilters ? records.slice(0, visibleCount) : [];
  const isEmpty = !hasActivePrimaryFilters || records.length === 0;

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
          <div className="results-list">
            {visibleRecords.map((horse) => (
              <HorseResultCard
                key={`${horse.HorseId}-${horse.SerialNumber}`}
                horse={horse}
                criteria={criteria}
              />
            ))}
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
