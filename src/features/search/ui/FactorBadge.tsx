interface FactorBadgeProps {
  label: string;
  compact?: boolean;
}

export const FactorBadge = ({ label, compact = false }: FactorBadgeProps) => (
  <span
    className={`factor-chip ${compact ? "factor-chip--compact" : ""}`}
    data-factor={label}
  >
    {label}
  </span>
);
