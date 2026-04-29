// このファイルは「絞り込み」ボタンを押したときに開くモーダル。
// 配合理論・能力値・脚質・成長型・天性・子系統・祖先指定など、
// 詳細な検索条件をここで設定して「反映する」ボタンで検索に適用する。

import { useEffect, useMemo, useState } from "react";
import type { FactorOption } from "@/features/horses/model/types";
import type { ChildLineOption } from "@/features/search/model/childLineOption";
import { useSearchStore } from "@/features/search/store/useSearchStore";
import { ChildLineAutocomplete } from "@/features/search/ui/ChildLineAutocomplete";
import { FactorAutocomplete } from "@/features/search/ui/FactorAutocomplete";
import { FactorBadge } from "@/features/search/ui/FactorBadge";
import { ANCESTOR_POSITION_OPTIONS } from "@/shared/constants/parentLines";

interface AncestorModalProps {
  open: boolean;
  factors: FactorOption[];
  lineOptions: ChildLineOption[];
  lineHtOptions: ChildLineOption[];
  temperamentOptions: ChoiceOption[];
  onApplyStart?: () => void;
  onClose: () => void;
}

interface DraftState {
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
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}

interface ChoiceOption {
  value: string;
  label: string;
}

const RANK_OPTIONS = [
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" }
] as const satisfies readonly ChoiceOption[];
const APTITUDE_OPTIONS = [
  { value: "◎", label: "◎" },
  { value: "〇", label: "〇" },
  { value: "△", label: "△" }
] as const satisfies readonly ChoiceOption[];
const THEORY_OPTIONS = [
  { value: "perfect", label: "完璧" },
  { value: "superPerfect", label: "超完璧" },
  { value: "miracle", label: "奇跡" },
  { value: "shiho", label: "至高" }
] as const satisfies readonly ChoiceOption[];
const RUNNING_STYLE_OPTIONS = [
  { value: "逃", label: "逃げ" },
  { value: "先", label: "先行" },
  { value: "差", label: "差し" },
  { value: "追", label: "追込" },
  { value: "自", label: "自在" }
] as const satisfies readonly ChoiceOption[];
const GROWTH_OPTIONS = [
  { value: "早", label: "早熟" },
  { value: "普", label: "普通" },
  { value: "晩", label: "晩成" }
] as const satisfies readonly ChoiceOption[];
const ABILITY_FILTERS = [
  { key: "dirt", label: "適応力", options: APTITUDE_OPTIONS },
  { key: "achievement", label: "実績", options: RANK_OPTIONS },
  { key: "stable", label: "安定", options: RANK_OPTIONS },
  { key: "clemency", label: "気性", options: RANK_OPTIONS },
  { key: "potential", label: "底力", options: RANK_OPTIONS },
  { key: "health", label: "体質", options: RANK_OPTIONS }
] as const;

// モーダル内で編集中の「下書き」状態を現在値からコピーして作る。
// 「反映する」を押すまでは実際の検索条件には影響しない。
const createDraft = (value: DraftState): DraftState => ({
  theory: [...value.theory],
  runningStyle: [...value.runningStyle],
  growth: [...value.growth],
  dirt: [...value.dirt],
  achievement: [...value.achievement],
  stable: [...value.stable],
  clemency: [...value.clemency],
  potential: [...value.potential],
  health: [...value.health],
  temperamentNames: [...value.temperamentNames],
  ownChildLine: value.ownChildLine,
  damSireChildLine: value.damSireChildLine,
  ancestorName: value.ancestorName,
  ancestorPositions: [...value.ancestorPositions]
});

const toggleArrayValue = (values: string[], nextValue: string) =>
  values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];

interface MultiChoiceGridProps {
  className?: string;
  options: readonly ChoiceOption[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
}

// 複数の選択肢をボタングリッドで表示する部品。
// 押すたびに選択状態がトグルされ、親へ変更が伝わる。
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
        <button
          key={option.value}
          aria-pressed={active}
          className={`chip-button filter-modal__choice ${active ? "is-active" : ""}`}
          type="button"
          onClick={() => onChange(toggleArrayValue(selectedValues, option.value))}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

export const AncestorModal = ({
  open,
  factors,
  lineOptions,
  lineHtOptions,
  temperamentOptions,
  onApplyStart,
  onClose
}: AncestorModalProps) => {
  const criteria = useSearchStore((state) => state.criteria);
  const applyAdvancedFilters = useSearchStore((state) => state.applyAdvancedFilters);

  const [draft, setDraft] = useState<DraftState>({
    theory: [...criteria.theory],
    runningStyle: [...criteria.runningStyle],
    growth: [...criteria.growth],
    dirt: [...criteria.dirt],
    achievement: [...criteria.achievement],
    stable: [...criteria.stable],
    clemency: [...criteria.clemency],
    potential: [...criteria.potential],
    health: [...criteria.health],
    temperamentNames: [...criteria.temperamentNames],
    ownChildLine: criteria.ownChildLine,
    damSireChildLine: criteria.damSireChildLine,
    ancestorName: criteria.ancestorName,
    ancestorPositions: criteria.ancestorPositions
  });

  // モーダルが開くたびに現在の検索条件から下書きを作り直す。
  // これにより「キャンセルして再度開く」と前回の編集内容がリセットされる。
  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(
      createDraft({
        theory: criteria.theory,
        runningStyle: criteria.runningStyle,
        growth: criteria.growth,
        dirt: criteria.dirt,
        achievement: criteria.achievement,
        stable: criteria.stable,
        clemency: criteria.clemency,
        potential: criteria.potential,
        health: criteria.health,
        temperamentNames: criteria.temperamentNames,
        ownChildLine: criteria.ownChildLine,
        damSireChildLine: criteria.damSireChildLine,
        ancestorName: criteria.ancestorName,
        ancestorPositions: criteria.ancestorPositions
      })
    );
  }, [
    open,
    criteria.ancestorName,
    criteria.ancestorPositions,
    criteria.clemency,
    criteria.damSireChildLine,
    criteria.dirt,
    criteria.growth,
    criteria.health,
    criteria.achievement,
    criteria.ownChildLine,
    criteria.potential,
    criteria.runningStyle,
    criteria.stable,
    criteria.temperamentNames,
    criteria.theory
  ]);

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

  // 入力中の祖先名がすでに登録済みの因子と一致するか確認して、バッジ表示に使う。
  const resolvedFactor = useMemo(
    () =>
      factors.find(
        (factor) =>
          factor.id === draft.ancestorName.trim() ||
          factor.name === draft.ancestorName.trim()
      ),
    [draft.ancestorName, factors]
  );

  if (!open) {
    return null;
  }

  const togglePosition = (position: string) =>
    setDraft((current) => ({
      ...current,
      ancestorPositions: current.ancestorPositions.includes(position)
        ? current.ancestorPositions.filter((value) => value !== position)
        : [...current.ancestorPositions, position]
    }));

  // 「反映する」ボタンを押したとき、下書きの条件を確定して検索ストアへ送る。
  // 祖先名が因子マスタに一致する場合は ID で正規化してから適用する。
  const handleApply = () => {
    const resolvedName = draft.ancestorName.trim();
    const nextFilters = {
      theory: [...draft.theory],
      runningStyle: [...draft.runningStyle],
      growth: [...draft.growth],
      dirt: [...draft.dirt],
      achievement: [...draft.achievement],
      stable: [...draft.stable],
      clemency: [...draft.clemency],
      potential: [...draft.potential],
      health: [...draft.health],
      temperamentNames: [...draft.temperamentNames],
      ownChildLine: draft.ownChildLine,
      damSireChildLine: draft.damSireChildLine,
      ancestorName: resolvedFactor?.id ?? resolvedName,
      ancestorPositions: draft.ancestorPositions
    };

    onApplyStart?.();
    onClose();

    const apply = () => applyAdvancedFilters(nextFilters);

    if (typeof window === "undefined") {
      apply();
      return;
    }

    window.requestAnimationFrame(() => {
      window.setTimeout(apply, 0);
    });
  };

  // 「条件を消す」ボタンを押したとき、下書きの全条件を空にリセットする。
  const handleReset = () =>
    setDraft({
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
      ownChildLine: "",
      damSireChildLine: "",
      ancestorName: "",
      ancestorPositions: []
    });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="modal-card filter-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header filter-modal__header">
          <div>
            <p className="eyebrow">Search Filter</p>
            <h2>絞り込み</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="modal-card__body filter-modal__body">
          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>配合理論</h3>
            </div>
            <MultiChoiceGrid
              className="filter-modal__option-grid--theory"
              options={THEORY_OPTIONS}
              selectedValues={draft.theory}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  theory: nextValues
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>能力</h3>
            </div>
            <div className="filter-modal__ability-list">
              {ABILITY_FILTERS.map((filter) => (
                <div key={filter.key} className="filter-modal__ability-row">
                  <span className="filter-modal__ability-label">{filter.label}</span>
                  <MultiChoiceGrid
                    className="filter-modal__option-grid--ability"
                    options={filter.options}
                    selectedValues={draft[filter.key]}
                    onChange={(nextValues) =>
                      setDraft((current) => ({
                        ...current,
                        [filter.key]: nextValues
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>脚質</h3>
            </div>
            <MultiChoiceGrid
              className="filter-modal__option-grid--running-style"
              options={RUNNING_STYLE_OPTIONS}
              selectedValues={draft.runningStyle}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  runningStyle: nextValues
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>成長型</h3>
            </div>
            <MultiChoiceGrid
              className="filter-modal__option-grid--growth"
              options={GROWTH_OPTIONS}
              selectedValues={draft.growth}
              onChange={(nextValues) =>
                setDraft((current) => ({
                  ...current,
                  growth: nextValues
                }))
              }
            />
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>天性</h3>
            </div>
            <select
              aria-label="天性"
              className="select-input"
              value={draft.temperamentNames[0] ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  temperamentNames: event.target.value ? [event.target.value] : []
                }))
              }
            >
              <option value="">条件指定なし</option>
              {temperamentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </section>

          <section className="filter-modal__section">
            <div className="filter-modal__section-header">
              <h3>血統</h3>
            </div>

            <div className="modal-card__group">
              <label className="field-label" htmlFor="own-child-line">
                自身の子系統
              </label>
              <ChildLineAutocomplete
                id="own-child-line"
                options={lineOptions}
                placeholder="子系統名や親系統コードで絞り込み"
                value={draft.ownChildLine}
                onChange={(nextValue) =>
                  setDraft((current) => ({
                    ...current,
                    ownChildLine: nextValue
                  }))
                }
              />
            </div>

            <div className="modal-card__group">
              <label className="field-label" htmlFor="dam-sire-child-line">
                母父の子系統
              </label>
              <ChildLineAutocomplete
                id="dam-sire-child-line"
                options={lineHtOptions}
                placeholder="子系統名や親系統コードで絞り込み"
                value={draft.damSireChildLine}
                onChange={(nextValue) =>
                  setDraft((current) => ({
                    ...current,
                    damSireChildLine: nextValue
                  }))
                }
              />
            </div>

            <div className="modal-card__group">
              <label className="field-label" htmlFor="ancestor-name">
                祖先指定
              </label>
              <FactorAutocomplete
                id="ancestor-name"
                options={factors}
                placeholder="祖先名で絞り込み"
                value={draft.ancestorName}
                onChange={(nextValue) =>
                  setDraft((current) => ({
                    ...current,
                    ancestorName: nextValue
                  }))
                }
              />
              <p className="help-text">
                祖先名だけでは条件になりません。位置も一緒に指定します。
              </p>
              {resolvedFactor ? (
                <div className="factor-meta">
                  <p className="help-text">候補: {resolvedFactor.name}</p>
                  {resolvedFactor.badges && resolvedFactor.badges.length > 0 ? (
                    <div className="factor-badge-row" aria-label="因子バッジ">
                      {resolvedFactor.badges.map((badge, index) => (
                        <FactorBadge
                          key={`${resolvedFactor.id}-${index}-${badge}`}
                          label={badge}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="modal-card__group">
              <span className="field-label">祖先位置</span>
              <div className="chip-row">
                {ANCESTOR_POSITION_OPTIONS.map((option) => {
                  const active = draft.ancestorPositions.includes(option.value);

                  return (
                    <button
                      key={option.value}
                      className={`chip-button ${active ? "is-active" : ""}`}
                      type="button"
                      onClick={() => togglePosition(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="modal-card__footer filter-modal__footer">
          <button className="secondary-button" type="button" onClick={handleReset}>
            条件を消す
          </button>
          <button className="primary-button" type="button" onClick={handleApply}>
            反映する
          </button>
        </div>
      </section>
    </div>
  );
};
