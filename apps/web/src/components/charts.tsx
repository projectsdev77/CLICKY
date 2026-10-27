"use client";

import { useState } from "react";

/**
 * Small, dependency-free charts for the dashboard. Single-series, so no legend
 * (the card title names the series); hover and keyboard focus show a tooltip,
 * and a visually hidden table carries every value for screen readers.
 */

function compact(n: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** A clean axis: a 1/2/2.5/5 × 10^n step with at most 5 intervals, topped just above the data. */
function niceScale(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10]
    .map((m) => m * pow)
    .find((s) => s >= 1 && Math.ceil(max / s) <= 5)!;
  const top = step * Math.ceil(max / step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DailyColumns({ data, unit }: { data: { day: string; count: number }[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  const { top: max, ticks } = niceScale(Math.max(0, ...data.map((d) => d.count)));
  const hovered = active !== null ? data[active] : null;

  return (
    <figure className="m-0">
      <div className="relative flex h-48 gap-2">
        {/* y-axis */}
        <div className="flex w-8 flex-col-reverse justify-between text-right text-[11px] tabular-nums text-muted">
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {compact(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1" onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-grid" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                className="group flex h-full flex-1 items-end justify-center outline-none"
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${dayLabel(d.day)}: ${d.count} ${unit}`}
              >
                <span
                  className="block w-full max-w-6 rounded-t bg-chart-1 transition-opacity group-hover:opacity-80 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-chart-1"
                  style={{ height: d.count ? `${(d.count / max) * 100}%` : 0 }}
                />
              </button>
            ))}
          </div>
          {hovered && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-sm"
              style={{ left: `${((active! + 0.5) / data.length) * 100}%` }}
            >
              <span className="font-semibold tabular-nums">{hovered.count}</span>{" "}
              <span className="text-muted">
                {unit} · {dayLabel(hovered.day)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="ml-10 mt-1 flex justify-between text-[11px] text-muted">
        <span>{data[0] && dayLabel(data[0].day)}</span>
        <span>{data.at(-1) && dayLabel(data.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>{unit} per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranked horizontal bars with the value at the tip. Labels and values are always visible. */
export function RankedBars({
  rows,
}: {
  rows: { key: string; label: React.ReactNode; value: number; note?: React.ReactNode }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 text-sm">
          <div className="min-w-0">
            <div className="truncate">{r.label}</div>
            {r.note && <div className="truncate text-xs text-muted">{r.note}</div>}
          </div>
          <div className="flex items-center gap-2">
            <span className="block h-2.5 rounded-r bg-chart-1" style={{ width: `${(r.value / max) * 85}%` }} />
            <span className="text-xs tabular-nums text-muted">{r.value}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
