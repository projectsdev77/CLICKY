import Link from "next/link";
import { RANGES } from "@/lib/analytics";

/** Date-range presets; sits in one row above everything it scopes. */
export function RangeFilter({ days, basePath, extra = {} }: { days: number; basePath: string; extra?: Record<string, string> }) {
  return (
    <div className="flex gap-1 text-sm" role="group" aria-label="Date range">
      {RANGES.map((d) => (
        <Link
          key={d}
          href={`${basePath}?${new URLSearchParams({ ...extra, days: String(d) })}`}
          aria-current={d === days ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 ${d === days ? "bg-card font-medium shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}
        >
          Last {d} days
        </Link>
      ))}
    </div>
  );
}
