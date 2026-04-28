import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { HorseSkillData, HorseSkillDetailTab } from "@/features/horses/model/types";

interface HorseSkillModalProps {
  open: boolean;
  title: string;
  skill: HorseSkillData;
  onClose: () => void;
}

const SECTION_LABELS = {
  effects: "発揮効果",
  conditions: "発揮条件",
  targets: "発揮対象",
  probability: "発揮確率"
} as const;

const renderLines = (lines: string[]) => {
  if (lines.length === 0) {
    return <p className="skill-modal__empty">なし</p>;
  }

  return (
    <div className="skill-modal__lines">
      {lines.map((line, index) => {
        const isContinuation = index > 0 && !line.trimStart().startsWith("・");

        return (
          <p
            key={`${index}-${line}`}
            className={isContinuation ? "skill-modal__line--continuation" : undefined}
          >
            {line}
          </p>
        );
      })}
    </div>
  );
};

const SkillSection = ({
  label,
  lines,
  compact = false
}: {
  label: string;
  lines: string[];
  compact?: boolean;
}) => (
  <section className={`skill-modal__section ${compact ? "skill-modal__section--compact" : ""}`}>
    <h3>{label}</h3>
    {renderLines(lines)}
  </section>
);

export const HorseSkillModal = ({ open, title, skill, onClose }: HorseSkillModalProps) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const detailTabs = skill.detailTabs ?? [];
  const description = skill.description ?? [];
  const tabs =
    detailTabs.length > 0
      ? detailTabs
      : [
          {
            label: "詳細",
            effects:
              description.length > 0
                ? description
                : ["詳細情報はまだ取得されていません。"],
            conditions: [],
            targets: [],
            probability: []
          }
        ];
  const activeTab: HorseSkillDetailTab | undefined = tabs[activeTabIndex] ?? tabs[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveTabIndex(0);
  }, [open, skill]);

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

  if (!open || !activeTab || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop skill-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-modal="true"
        className="modal-card skill-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header skill-modal__header">
          <div>
            <p className="eyebrow">{title}</p>
            <h2>{skill.name}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="skill-modal__body">
          {tabs.length > 1 ? (
            <div className="skill-modal__tabs" role="tablist" aria-label="才能詳細">
              {tabs.map((tab, index) => (
                <button
                  key={`${tab.label}-${index}`}
                  aria-selected={activeTabIndex === index}
                  className={`skill-modal__tab ${activeTabIndex === index ? "is-active" : ""}`}
                  role="tab"
                  type="button"
                  onClick={() => setActiveTabIndex(index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="skill-modal__grid">
            <SkillSection label={SECTION_LABELS.effects} lines={activeTab.effects} />
            <SkillSection label={SECTION_LABELS.conditions} lines={activeTab.conditions} />
            <SkillSection
              compact
              label={SECTION_LABELS.targets}
              lines={activeTab.targets}
            />
            <SkillSection
              compact
              label={SECTION_LABELS.probability}
              lines={activeTab.probability}
            />
          </div>
        </div>

        <div className="modal-card__footer skill-modal__footer">
          <button className="primary-button" type="button" onClick={onClose}>
            OK
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};
