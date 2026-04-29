// このファイルは「非凡」ボタンを押したときに開くモーダル。
// 騎乗指示・レース・馬場状態・天候を選んで「検索する」を押すと、
// 条件に合う非凡な才能を持つ種牡馬の ID を検索画面へ渡す。

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HorseRecord } from "@/features/horses/model/types";
import { searchNonordinaryAbilities } from "@/features/nonordinary/lib/searchNonordinaryAbilities";
import type {
  MatchedNonordinaryAbility,
  NonordinaryBundle,
  NonordinarySearchInput,
  RaceFilterOption
} from "@/features/nonordinary/model/types";

interface NonordinaryModalProps {
  open: boolean;
  bundle: NonordinaryBundle;
  horses: HorseRecord[];
  onApplyHorseIds: (horseIds: string[]) => void;
  onClose: () => void;
}

interface ChoiceOption {
  value: string;
  label: string;
}

const DEFAULT_INPUT: NonordinarySearchInput = {
  race_id: null,
  tactics: [],
  going: [],
  weather: []
};

const RACE_DATE_ORDER_BY_ID: Record<string, number> = {
  "5854123610": 1,
  "8214958362": 2,
  "0264175318": 3,
  "3614530287": 4,
  "3452701876": 5,
  "8407065213": 6,
  "6587031462": 7,
  "1804725356": 8,
  "3452921386": 9,
  "2264185315": 10,
  "2214957369": 11,
  "1364823356": 12,
  "2315498266": 13,
  "5612364288": 14,
  "6558631422": 15,
  "6315458266": 16,
  "6315468265": 17,
  "2865141533": 18,
  "0614539227": 19,
  "4217621593": 20,
  "4218691513": 21,
  "6548831412": 22,
  "1384821356": 23,
  "4962561838": 24,
  "6315438268": 25,
  "7467539712": 26,
  "6547731432": 27,
  "7265243177": 28,
  "4217693503": 29,
  "6407265213": 30,
  "7765243190": 31,
  "6507931452": 32,
  "2614539207": 33,
  "5912364078": 34,
  "4217675503": 35,
  "7865243108": 36,
  "6557031492": 37,
  "5912364276": 38
};

// レース選択肢の表示順を決める。ゲーム内の日程順に並べるための優先度を返す。
// リストにない race_id は sort_order + 1000 という低優先度にする。
const getRaceDateOrder = (option: RaceFilterOption) => {
  if (option.is_all || option.race_id === null) {
    return -1;
  }

  return RACE_DATE_ORDER_BY_ID[option.race_id] ?? 1000 + option.sort_order;
};

const TACTIC_OPTIONS = [
  { value: "none", label: "条件指定なし" },
  { value: "nige", label: "逃げ" },
  { value: "senko", label: "先行" },
  { value: "sashi", label: "差し" },
  { value: "oikomi", label: "追込" }
] as const satisfies readonly ChoiceOption[];

const GOING_OPTIONS = [
  { value: "none", label: "条件指定なし" },
  { value: "良", label: "良" },
  { value: "稍重", label: "稍重" },
  { value: "重", label: "重" },
  { value: "不良", label: "不良" }
] as const satisfies readonly ChoiceOption[];

const WEATHER_OPTIONS = [
  { value: "none", label: "条件指定なし" },
  { value: "晴", label: "晴" },
  { value: "曇", label: "曇" },
  { value: "雨", label: "雨" },
  { value: "雪", label: "雪" }
] as const satisfies readonly ChoiceOption[];

const createDraft = (value: NonordinarySearchInput): NonordinarySearchInput => ({
  race_id: value.race_id,
  tactics: [...value.tactics],
  going: [...value.going],
  weather: [...value.weather]
});

const toggleArrayValue = (values: string[], nextValue: string) =>
  values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];

// 改行区切りの生テキストを行リストに分割して空行を除く。
const splitRawLines = (value: string | null) =>
  (value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

// 馬の適性距離を「1200〜1800m」のような文字列に整形する。
const formatHorseDistance = (horse: HorseRecord) => {
  const { distanceMin, distanceMax } = horse.card.stats;
  if (!distanceMin && !distanceMax) {
    return "";
  }
  return distanceMax ? `${distanceMin}〜${distanceMax}m` : `${distanceMin}m`;
};

interface MultiChoiceGridProps {
  className?: string;
  options: readonly ChoiceOption[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
}

const MultiChoiceGrid = ({
  className = "",
  options,
  selectedValues,
  onChange
}: MultiChoiceGridProps) => (
  <div className={`filter-modal__option-grid ${className}`.trim()}>
    {options.map((option) => {
      const active = selectedValues.includes(option.value);

      return (
        <Fragment key={option.value}>
          <button
            aria-pressed={active}
            className={[
              "chip-button",
              "filter-modal__choice",
              option.value === "none" ? "filter-modal__choice--none" : "",
              active ? "is-active" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            onClick={() => onChange(toggleArrayValue(selectedValues, option.value))}
          >
            {option.label}
          </button>
          {option.value === "none" ? (
            <span
              key={`${option.value}-break`}
              aria-hidden="true"
              className="filter-modal__choice-break"
            />
          ) : null}
        </Fragment>
      );
    })}
  </div>
);

interface RaceSelectProps {
  options: RaceFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

// カスタムドロップダウン部品。モバイルでも見やすいボタン式でレースを選べる。
// 外側をクリックしたら自動で閉じるよう pointerdown を監視している。
const RaceSelect = ({ options, value, onChange }: RaceSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption =
    options.find((option) => (option.race_id ?? "") === (value ?? "")) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className="race-select">
      <button
        aria-expanded={isOpen}
        className={`race-select__button ${isOpen ? "is-open" : ""}`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption?.race_name ?? "すべて"}</span>
        <span aria-hidden="true" className="race-select__chevron" />
      </button>
      {isOpen ? (
        <div className="race-select__menu" role="listbox">
          {options.map((option) => {
            const optionValue = option.race_id ?? "";
            const active = optionValue === (value ?? "");

            return (
              <button
                key={optionValue || "all"}
                aria-selected={active}
                className={`race-select__option ${active ? "is-selected" : ""}`}
                role="option"
                type="button"
                onClick={() => {
                  onChange(option.race_id);
                  setIsOpen(false);
                }}
              >
                {option.race_name}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

// 非凡な才能 1 件ぶんの結果カード。才能名・発揮条件・それを持つ種牡馬の一覧を表示する。
const ResultDetail = ({ result }: { result: MatchedNonordinaryAbility }) => (
  <article className="nonordinary-result">
    <div className="nonordinary-result__header">
      <div>
        <h4>{result.ability_name}</h4>
        {result.kana ? <p>{result.kana}</p> : null}
      </div>
      <a href={result.source_url} rel="noreferrer" target="_blank">
        {result.ability_id}
      </a>
    </div>

    {result.description ? (
      <p className="nonordinary-result__description">{result.description}</p>
    ) : null}

    <div className="nonordinary-result__details">
      {result.matched_details.map((detail) => {
        const conditionLines = splitRawLines(detail.condition_raw);
        const effectLines = splitRawLines(detail.effect_raw);

        return (
          <div key={detail.detail_id} className="nonordinary-result__detail">
            <span className="nonordinary-result__detail-label">{detail.detail_label}</span>
            {conditionLines.length > 0 ? (
              <div className="nonordinary-result__raw-lines">
                {conditionLines.map((line, index) => (
                  <span key={`${detail.detail_id}-condition-${index}-${line}`}>
                    {line}
                  </span>
                ))}
              </div>
            ) : null}
            {effectLines.length > 0 ? (
              <div className="nonordinary-result__effect-lines">
                {effectLines.map((line, index) => (
                  <span key={`${detail.detail_id}-effect-${index}-${line}`}>
                    {line}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>

    <div className="nonordinary-result__stallions">
      {result.source_stallions.map((stallion) => {
        const horse = stallion.horse;
        const distance = horse ? formatHorseDistance(horse) : "";

        return (
          <div key={stallion.stallion_id} className="nonordinary-stallion">
            <div className="nonordinary-stallion__main">
              <strong>{horse?.card.name ?? stallion.stallion_name}</strong>
              <span>{stallion.stallion_id}</span>
            </div>
            {horse ? (
              <div className="nonordinary-stallion__meta">
                <span>{horse.card.rareBadgeLabel || horse.RareCd}</span>
                <span>{horse.Category}</span>
                {distance ? <span>{distance}</span> : null}
                <span>{horse.card.stats.runningStyle}</span>
                <span>{horse.card.stats.dirt}</span>
              </div>
            ) : (
              <div className="nonordinary-stallion__meta">
                <span>horselist未登録</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  </article>
);

// 検索結果から「horselist に登録されている」種牡馬の ID だけを重複なしで取り出す。
const getDisplayableHorseIds = (results: MatchedNonordinaryAbility[]) =>
  [
    ...new Set(
      results.flatMap((result) =>
        result.source_stallions.flatMap((stallion) =>
          stallion.horse ? [stallion.horse.HorseId] : []
        )
      )
    )
  ];

export const NonordinaryModal = ({
  open,
  bundle,
  horses,
  onApplyHorseIds,
  onClose
}: NonordinaryModalProps) => {
  const [draft, setDraft] = useState<NonordinarySearchInput>(() =>
    createDraft(DEFAULT_INPUT)
  );
  const [committed, setCommitted] = useState<NonordinarySearchInput | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlOverflow = documentElement.style.overflow;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  const raceOptions = useMemo(
    () =>
      [...bundle.race_filter_options].sort(
        (left, right) => getRaceDateOrder(left) - getRaceDateOrder(right)
      ),
    [bundle.race_filter_options]
  );

  const results = useMemo(
    () =>
      committed
        ? searchNonordinaryAbilities(bundle, horses, committed)
        : [],
    [bundle, committed, horses]
  );

  const matchedStallionCount = useMemo(
    () =>
      new Set(
        results.flatMap((result) =>
          result.source_stallions
            .filter((stallion) => stallion.horse)
            .map((stallion) => stallion.stallion_id)
        )
      ).size,
    [results]
  );

  if (!open || typeof document === "undefined") {
    return null;
  }

  // 「条件を消す」ボタンを押したとき、下書きと検索結果を両方リセットする。
  const handleReset = () => {
    setDraft(createDraft(DEFAULT_INPUT));
    setCommitted(null);
  };

  const handleSearch = () => {
    const nextResults = searchNonordinaryAbilities(bundle, horses, draft);
    setCommitted(null);
    onApplyHorseIds(getDisplayableHorseIds(nextResults));
  };

  return createPortal(
    <div className="modal-backdrop nonordinary-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="modal-card filter-modal nonordinary-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header filter-modal__header">
          <div>
            <p className="eyebrow">Nonordinary</p>
            <h2>非凡</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="modal-card__body filter-modal__body">
          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>騎乗指示</h3>
            </div>
            <MultiChoiceGrid
              className="filter-modal__option-grid--running-style"
              options={TACTIC_OPTIONS}
              selectedValues={draft.tactics}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  tactics: nextValues as NonordinarySearchInput["tactics"]
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>レース</h3>
            </div>
            <select
              aria-label="レース"
              className="select-input"
              value={draft.race_id ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  race_id: event.target.value || null
                }))
              }
            >
              {raceOptions.map((option) => (
                <option key={option.race_id ?? "all"} value={option.race_id ?? ""}>
                  {option.race_name}
                </option>
              ))}
            </select>
            <RaceSelect
              options={raceOptions}
              value={draft.race_id}
              onChange={(raceId) =>
                setDraft((current) => ({
                  ...current,
                  race_id: raceId
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>馬場状態</h3>
            </div>
            <MultiChoiceGrid
              options={GOING_OPTIONS}
              selectedValues={draft.going}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  going: nextValues as NonordinarySearchInput["going"]
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>天候</h3>
            </div>
            <MultiChoiceGrid
              options={WEATHER_OPTIONS}
              selectedValues={draft.weather}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  weather: nextValues as NonordinarySearchInput["weather"]
                }))
              }
            />
          </section>

          {committed ? (
            <section className="filter-modal__section nonordinary-results">
              <div className="filter-modal__section-header nonordinary-results__header">
                <h3>検索結果</h3>
                <span>
                  {results.length} / {matchedStallionCount}
                </span>
              </div>
              {results.length > 0 ? (
                <div className="nonordinary-results__list">
                  {results.map((result) => (
                    <ResultDetail key={result.ability_id} result={result} />
                  ))}
                </div>
              ) : (
                <p className="nonordinary-results__empty">該当なし</p>
              )}
            </section>
          ) : null}
        </div>

        <div className="modal-card__footer filter-modal__footer">
          <button className="secondary-button" type="button" onClick={handleReset}>
            条件を消す
          </button>
          <button className="primary-button" type="button" onClick={handleSearch}>
            検索する
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};
