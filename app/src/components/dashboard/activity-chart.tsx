"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import type { DashboardOverview } from "@/lib/types";
import { userLocale } from "@/lib/utils";

type Point = DashboardOverview["activity"][number];

/** Fixed colour per series, from the validated chart palette. */
const SERIES = [
  { key: "created", label: "Created", color: "var(--series-1)", area: true },
  { key: "published", label: "Published", color: "var(--series-3)", area: false },
] as const;

const HEIGHT = 300;
const PAD = { top: 12, right: 16, bottom: 28, left: 36 };

function niceMax(value: number) {
  if (value <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(userLocale() === "en" ? "en-GB" : userLocale(), { day: "numeric", month: "short" });
}

/** Daily line chart with a hover crosshair, a legend and a table view. */
export function ActivityChart({ data }: { data: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.flatMap((point) => [point.created, point.published])));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((part) => Math.round(max * part));
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 90)));
  const totals = { created: data.reduce((sum, p) => sum + p.created, 0), published: data.reduce((sum, p) => sum + p.published, 0) };

  function path(key: "created" | "published") {
    return data.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  }

  function onMove(event: MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = ((event.clientX - rect.left) / rect.width) * plotW;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round((position / plotW) * (data.length - 1)))));
  }

  const point = hover !== null ? data[hover] : null;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {SERIES.map((series) => (
            <li key={series.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: series.color }} aria-hidden />
              {series.label} <span className="tabular-nums text-foreground">{totals[series.key]}</span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsTable((value) => !value)}>
          {asTable ? "Show chart" : "Show as table"}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 font-medium">Day</th>
                <th scope="col" className="py-1.5 text-right font-medium">Created</th>
                <th scope="col" className="py-1.5 text-right font-medium">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...data].reverse().map((row) => (
                <tr key={row.date}>
                  <td className="py-1.5">{dayLabel(row.date)}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.created}</td>
                  <td className="py-1.5 text-right tabular-nums">{row.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative w-full overflow-hidden">
          {/* The viewBox scales the drawing to the card, so it can never spill over. */}
          <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none" role="img" aria-label="Entries created and published per day over the last 30 days. Use Show as table for the numbers." className="block">
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeDasharray={tick === 0 ? undefined : "3 3"} />
                <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {tick}
                </text>
              </g>
            ))}
            {data.map((row, index) =>
              index % labelEvery === 0 || index === data.length - 1 ? (
                <text key={row.date} x={x(index)} y={HEIGHT - 8} textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                  {dayLabel(row.date)}
                </text>
              ) : null,
            )}
            <path d={`${path("created")} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="var(--series-1)" opacity={0.08} />
            {SERIES.map((series) => (
              <path key={series.key} d={path(series.key)} fill="none" stroke={series.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* End markers, as in the V3 design. */}
            {SERIES.map((series) => (
              <circle key={series.key} cx={x(data.length - 1)} cy={y(data[data.length - 1]?.[series.key] ?? 0)} r={4} fill={series.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
            {point && hover !== null ? (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
                {SERIES.map((series) => (
                  <circle key={series.key} cx={x(hover)} cy={y(point[series.key])} r={4.5} fill={series.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            ) : null}
            <rect
              x={PAD.left}
              y={PAD.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            />
          </svg>
          {point && hover !== null ? (
            <div
              className="pointer-events-none absolute z-10 w-40 rounded-lg border border-border bg-surface p-2.5 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(x(hover) - 80, 0), width - 160), top: 0 }}
            >
              <p className="mb-1 font-medium">{dayLabel(point.date)}</p>
              {SERIES.map((series) => (
                <p key={series.key} className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: series.color }} aria-hidden />
                    {series.label}
                  </span>
                  <span className="tabular-nums text-foreground">{point[series.key]}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
