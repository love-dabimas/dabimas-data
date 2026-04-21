interface FactorBadgeProps {
  label: string;
  compact?: boolean;
}

// 祖先候補に付く短い因子ラベルは、小さな共通コンポーネントにして見た目をそろえる。
export const FactorBadge = ({ label, compact = false }: FactorBadgeProps) => (
  <span
    className={`factor-chip ${compact ? "factor-chip--compact" : ""}`}
    data-factor={label}
  >
    {label}
  </span>
);
