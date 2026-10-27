import Link from "next/link";
import { RANGES } from "@/lib/analytics";

/** Date-range presets; sits in one row above everything it scopes. */
export function RangeFilter({
  days,
  basePath,
  extra = {},
  maxDays = 90,
}: {
  days: number;
  basePath: string;
  extra?: Record<string, string>;
  /** Longest range the plan includes; longer ones show as locked. */
  maxDays?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Date range">
      {RANGES.map((d) =>
        d > maxDays ? (
          <Link key={d} href="/billing" className="rounded-md px-3 py-1.5 text-muted/60" title="Available on paid plans">
            Last {d} days 🔒
          </Link>
        ) : (
        <Link
          key={d}
          href={`${basePath}?${new URLSearchParams({ ...extra, days: String(d) })}`}
          aria-current={d === days ? "true" : undefined}
          className={`rounded-md px-3 py-1.5 ${d === days ? "bg-card font-medium shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}
        >
          Last {d} days
        </Link>
        ),
      )}
    </div>
  );
}
