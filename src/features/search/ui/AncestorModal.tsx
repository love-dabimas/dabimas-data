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

// ストアへ反映する前に、モーダル内で安全に編集するための下書き状態を複製する。
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
  // モーダル内では store を直接書き換えず、最後に「反映する」でまとめて適用する。
  const criteria = useSearchStore((state) => state.criteria);
  const applyAdvancedFilters = useSearchStore((state) => state.applyAdvancedFilters);

  const [draft, setDraft] = useState<DraftState>({
    ownChildLine: criteria.ownChildLine,
    damSireChildLine: criteria.damSireChildLine,
    ancestorName: criteria.ancestorName,
    ancestorPositions: criteria.ancestorPositions
  });

  useEffect(() => {
    // 開いた瞬間に最新の検索条件を下書きへ写し、前回編集途中の残骸を持ち込まない。
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

  // 祖先入力は id と表示名のどちらでも入ってくるので、候補情報へ解決しておく。
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

  // 祖先位置は複数選択なので、チップのトグルで配列を組み替える。
  const togglePosition = (position: string) =>
    setDraft((current) => ({
      ...current,
      ancestorPositions: current.ancestorPositions.includes(position)
        ? current.ancestorPositions.filter((value) => value !== position)
        : [...current.ancestorPositions, position]
    }));

  // 因子候補へ一致した場合は id に正規化して保存し、検索式を安定させる。
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

  // モーダル内の条件だけを消す。画面全体の reset とは役割を分けている。
  const handleReset = () =>
    setDraft({
      ownChildLine: "",
      damSireChildLine: "",
      ancestorName: "",
      ancestorPositions: []
    });

  return (
    // backdrop クリックで閉じられるようにしつつ、カード内部クリックでは伝播を止める。
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
            {/* 自身の子系統候補は Category / Paternal_t 由来の一覧を使う。 */}
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
            {/* 母父の子系統候補は Category_ht / Paternal_ht 由来の一覧を使う。 */}
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
            {/* 祖先名は factor マスタから補完し、候補の因子バッジも見せる。 */}
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
