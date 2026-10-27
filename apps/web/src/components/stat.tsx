/** Stat tile: label, value, optional change vs. the previous period. */
export function Stat({
  label,
  value,
  hint,
  delta,
  hero,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Change vs previous period, as a fraction (0.12 = +12%). Up is good. */
  delta?: number | null;
  hero?: boolean;
}) {
  return (
    <div className="h-full rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={hero ? "mt-1 text-5xl font-semibold tracking-tight" : "mt-1 text-2xl font-semibold"}>{value}</p>
      {delta !== undefined && delta !== null && Number.isFinite(delta) && (
        <p className="mt-1 text-xs text-muted">
          <span className={delta >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
          </span>{" "}
          vs previous period
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
