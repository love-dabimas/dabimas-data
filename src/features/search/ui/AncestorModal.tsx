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
  onClose: () => void;
}

interface DraftState {
  ownChildLine: string;
  damSireChildLine: string;
  ancestorName: string;
  ancestorPositions: string[];
}

const createDraft = (value: DraftState): DraftState => ({
  ownChildLine: value.ownChildLine,
  damSireChildLine: value.damSireChildLine,
  ancestorName: value.ancestorName,
  ancestorPositions: [...value.ancestorPositions]
});

export const AncestorModal = ({
  open,
  factors,
  lineOptions,
  lineHtOptions,
  onClose
}: AncestorModalProps) => {
  const criteria = useSearchStore((state) => state.criteria);
  const applyAdvancedFilters = useSearchStore((state) => state.applyAdvancedFilters);

  const [draft, setDraft] = useState<DraftState>({
    ownChildLine: criteria.ownChildLine,
    damSireChildLine: criteria.damSireChildLine,
    ancestorName: criteria.ancestorName,
    ancestorPositions: criteria.ancestorPositions
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(
      createDraft({
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
    criteria.damSireChildLine,
    criteria.ownChildLine
  ]);

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

  const handleApply = () => {
    const resolvedName = draft.ancestorName.trim();

    applyAdvancedFilters({
      ownChildLine: draft.ownChildLine,
      damSireChildLine: draft.damSireChildLine,
      ancestorName: resolvedFactor?.id ?? resolvedName,
      ancestorPositions: draft.ancestorPositions
    });
    onClose();
  };

  const handleReset = () =>
    setDraft({
      ownChildLine: "",
      damSireChildLine: "",
      ancestorName: "",
      ancestorPositions: []
    });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="modal-card"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <p className="eyebrow">Advanced Filter</p>
            <h2>祖先絞込</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="modal-card__body">
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
        </div>

        <div className="modal-card__footer">
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
