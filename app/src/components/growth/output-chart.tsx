"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { GrowthReport } from "@/lib/types";

/** Fixed colour per content type: colour follows the type, never its position in this chart. */
const SERIES: Record<string, { label: string; color: string }> = {
  article: { label: "Articles", color: "var(--series-1)" },
  event: { label: "Events", color: "var(--series-2)" },
  publication: { label: "Publications", color: "var(--series-3)" },
  page: { label: "Pages", color: "var(--series-4)" },
};
const ORDER = ["article", "event", "publication", "page"];

function weekLabel(iso: string) {
  // Short enough to fit under each bar, even in a narrow card: "14/9".
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "numeric" });
}

/** Stacked weekly bars of entries first published, with hover details and a table view. */
export function OutputChart({ output, height: PLOT_HEIGHT = 180 }: { output: GrowthReport["output"]; height?: number }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const types = ORDER.filter((key) => output.types.includes(key)).concat(output.types.filter((key) => !ORDER.includes(key)));
  const totals = output.weeks.map((week) => types.reduce((sum, key) => sum + Number(week[key] ?? 0), 0));
  const max = Math.max(1, ...totals);
  // A few round gridlines.
  const step = Math.max(1, Math.ceil(max / 4));
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, index) => index * step);
  const top = Math.max(max, ticks[ticks.length - 1]);
  const empty = totals.every((total) => total === 0);

  return (
    <div className="grid min-w-0 gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {types.map((key) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SERIES[key]?.color ?? "var(--muted-foreground)" }} aria-hidden />
              {SERIES[key]?.label ?? key}
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsTable((value) => !value)}>
          {asTable ? "Show chart" : "Show as table"}
        </Button>
      </div>

      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nothing published in the last 8 weeks.</p>
      ) : asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 pr-4 font-medium">Week of</th>
                {types.map((key) => (
                  <th key={key} scope="col" className="py-1.5 pr-4 text-right font-medium">
                    {SERIES[key]?.label ?? key}
                  </th>
                ))}
                <th scope="col" className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {output.weeks.map((week, index) => (
                <tr key={week.week}>
                  <td className="py-1.5 pr-4">{weekLabel(week.week)}</td>
                  {types.map((key) => (
                    <td key={key} className="py-1.5 pr-4 text-right tabular-nums">
                      {Number(week[key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right font-medium tabular-nums">{totals[index]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
          <div className="relative text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: PLOT_HEIGHT }} aria-hidden>
            {ticks.map((tick) => (
              <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ bottom: `${(tick / top) * 100}%` }}>
                {tick}
              </span>
            ))}
          </div>
          <div>
            <div className="relative" style={{ height: PLOT_HEIGHT }} role="img" aria-label="Entries published per week. Use Show as table for the numbers.">
              {ticks.map((tick) => (
                <span key={tick} className="absolute inset-x-0 border-t border-border/70" style={{ bottom: `${(tick / top) * 100}%` }} aria-hidden />
              ))}
              <div className="absolute inset-0 flex items-end gap-[6%] px-[2%]">
                {output.weeks.map((week, index) => (
                  <div
                    key={week.week}
                    className="relative flex h-full flex-1 flex-col justify-end"
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* Segments stack from the baseline with a 2px surface gap; only the top end is rounded. */}
                    <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(totals[index] / top) * 100}%` }}>
                      {types.map((key, typeIndex) => {
                        const value = Number(week[key] ?? 0);
                        if (!value) return null;
                        const isTop = types.slice(typeIndex + 1).every((later) => !Number(week[later] ?? 0));
                        return (
                          <div
                            key={key}
                            style={{ flexGrow: value, background: SERIES[key]?.color ?? "var(--muted-foreground)", opacity: hover === null || hover === index ? 1 : 0.45 }}
                            className={isTop ? "min-h-[2px] rounded-t-[4px]" : "min-h-[2px]"}
                          />
                        );
                      })}
                    </div>
                    {hover === index ? (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-40 -translate-x-1/2 rounded-md border border-border bg-surface p-2.5 text-xs shadow-lg">
                        <p className="mb-1 font-medium">Week of {weekLabel(week.week)}</p>
                        {types.map((key) => (
                          <p key={key} className="flex items-center justify-between gap-2 text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <span className="size-2 rounded-sm" style={{ background: SERIES[key]?.color }} aria-hidden />
                              {SERIES[key]?.label ?? key}
                            </span>
                            <span className="tabular-nums text-foreground">{Number(week[key] ?? 0)}</span>
                          </p>
                        ))}
                        <p className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
                          <span>Total</span>
                          <span className="tabular-nums">{totals[index]}</span>
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-1.5 flex gap-[6%] px-[2%] text-center text-[10px] tracking-tight text-muted-foreground" aria-hidden>
              {output.weeks.map((week) => (
                <span key={week.week} className="flex-1 whitespace-nowrap">
                  {weekLabel(week.week)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
