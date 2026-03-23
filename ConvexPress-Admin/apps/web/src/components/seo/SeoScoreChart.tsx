/**
 * SeoScoreChart - Donut-style score distribution display.
 *
 * Shows Good (70-100), OK (40-69), Poor (0-39), No Data counts.
 * Uses colored bars instead of actual chart library to keep dependencies light.
 */

import { cn } from "@/lib/utils";

interface SeoScoreChartProps {
  good: number;
  ok: number;
  poor: number;
  noData: number;
}

export function SeoScoreChart({ good, ok, poor, noData }: SeoScoreChartProps) {
  const total = good + ok + poor + noData;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
        No published content to analyze.
      </div>
    );
  }

  const segments = [
    { label: "Good (70-100)", count: good, color: "bg-seo-good", textColor: "text-seo-good" },
    { label: "OK (40-69)", count: ok, color: "bg-seo-ok", textColor: "text-seo-ok" },
    { label: "Poor (0-39)", count: poor, color: "bg-seo-poor", textColor: "text-seo-poor" },
    { label: "No Data", count: noData, color: "bg-muted-foreground/30", textColor: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-3">
      {/* Bar visualization */}
      <div className="flex h-4 rounded-none overflow-hidden">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.label}
              className={cn("transition-all", seg.color)}
              style={{ width: `${(seg.count / total) * 100}%` }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null,
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div className={cn("size-2.5 rounded-full", seg.color)} />
            <span className="text-xs text-muted-foreground">{seg.label}</span>
            <span className={cn("text-xs font-semibold ml-auto tabular-nums", seg.textColor)}>
              {seg.count}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <p className="text-xs text-muted-foreground text-center">
        {total} total published items
      </p>
    </div>
  );
}
