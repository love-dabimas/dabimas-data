interface FilterOption {
  value: string;
  label: string;
  fullLabel?: string;
  shortLabel?: string;
}

interface FilterSectionProps {
  title: string;
  subtitle: string;
  options: readonly FilterOption[];
  selectedValues: string[];
  onToggle: (value: string) => void;
}

// 親系統・レア条件など、同じ UI パターンのチップ群をまとめて描画する。
export const FilterSection = ({
  title,
  subtitle,
  options,
  selectedValues,
  onToggle
}: FilterSectionProps) => (
  <section className="filter-section">
    <div className="filter-section__header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
    <div className="chip-row">
      {options.map((option) => {
        // 選択状態は受け取った selectedValues だけで判定し、表示側は極力 stateless に保つ。
        const active = selectedValues.includes(option.value);

        return (
          <button
            key={option.value}
            aria-label={option.fullLabel ? `${option.label} (${option.fullLabel})` : option.label}
            aria-pressed={active}
            className={`chip-button ${active ? "is-active" : ""}`}
            title={option.fullLabel ?? option.label}
            type="button"
            onClick={() => onToggle(option.value)}
          >
            <span>{option.label}</span>
            {option.shortLabel && option.shortLabel !== option.label ? (
              <small>{option.shortLabel}</small>
            ) : null}
          </button>
        );
      })}
    </div>
  </section>
);
