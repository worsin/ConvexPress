/**
 * Search Analytics Dashboard
 *
 * Admin-only analytics view for search performance metrics:
 *   - Summary cards: Total Searches, Unique Queries, Click-Through %, Zero Results %
 *   - Top Searches table: Query, Count, Avg Results, Click Rate
 *   - Zero-Result Queries table: Query, Search Count
 *   - Daily volume display
 *   - Source breakdown: Website / Admin / API
 *   - Date range selector (7d / 30d / 90d)
 */

import * as React from "react";
import { useQuery } from "convex/react";
import {
  Search,
  MousePointerClick,
  AlertTriangle,
  BarChart3,
  Globe,
  Monitor,
  Zap,
} from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SearchAnalyticsDashboardProps {
  className?: string;
}

type DateRange = "7d" | "30d" | "90d";

const DATE_RANGES: Record<DateRange, { label: string; ms: number }> = {
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  "30d": { label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  "90d": { label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
};

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: string | number;
  icon: typeof Search;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-border bg-background p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">
          {value}
          {suffix && (
            <span className="text-sm font-normal text-muted-foreground">
              {suffix}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SearchAnalyticsDashboard({ className }: SearchAnalyticsDashboardProps) {
  const [range, setRange] = React.useState<DateRange>("30d");

  const now = Date.now();
  const dateFrom = now - DATE_RANGES[range].ms;

  const analytics = useQuery(api.search.queries.getAnalytics, {
    dateFrom,
    dateTo: now,
    limit: 50,
  });

  if (analytics === undefined) {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-sm border border-border bg-muted/50"
            />
          ))}
        </div>
      </div>
    );
  }

  const { summary, topQueries, zeroResultQueries, volumeByDay, sourceBreakdown } =
    analytics;

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* Date Range Selector */}
      <div className="flex items-center gap-2">
        {(Object.keys(DATE_RANGES) as DateRange[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setRange(key)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
              range === key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {DATE_RANGES[key].label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Searches"
          value={summary.totalSearches.toLocaleString()}
          icon={Search}
        />
        <SummaryCard
          label="Unique Queries"
          value={summary.uniqueQueries.toLocaleString()}
          icon={BarChart3}
        />
        <SummaryCard
          label="Click-Through Rate"
          value={summary.clickThroughRate}
          icon={MousePointerClick}
          suffix="%"
        />
        <SummaryCard
          label="Zero Results Rate"
          value={summary.zeroResultRate}
          icon={AlertTriangle}
          suffix="%"
        />
      </div>

      {/* Source Breakdown */}
      <div className="rounded-sm border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-medium">Search Sources</h3>
        <div className="flex gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Globe className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Website:</span>
            <span className="font-medium">{sourceBreakdown.website}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Monitor className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Admin:</span>
            <span className="font-medium">{sourceBreakdown.admin}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Zap className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">API:</span>
            <span className="font-medium">{sourceBreakdown.api}</span>
          </div>
        </div>
      </div>

      {/* Top Searches Table */}
      <div className="rounded-sm border border-border bg-background">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-medium">Top Searches</h3>
        </div>
        {topQueries.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No search queries recorded in this period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Query
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Count
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Avg Results
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Click Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {topQueries.map((row, i) => (
                  <tr
                    key={row.query}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      i % 2 === 0 ? "" : "bg-muted/30",
                    )}
                  >
                    <td className="px-4 py-2 font-medium">{row.query}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.count}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.avgResults}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.clickRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zero-Result Queries */}
      {zeroResultQueries.length > 0 && (
        <div className="rounded-sm border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Zero-Result Queries</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Users searched for these terms but found nothing. Consider creating content.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Query
                  </th>
                  <th className="px-4 py-2 text-xs font-medium text-muted-foreground">
                    Search Count
                  </th>
                </tr>
              </thead>
              <tbody>
                {zeroResultQueries.map((row, i) => (
                  <tr
                    key={row.query}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      i % 2 === 0 ? "" : "bg-muted/30",
                    )}
                  >
                    <td className="px-4 py-2 font-medium">{row.query}</td>
                    <td className="px-4 py-2 text-muted-foreground">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Volume */}
      {volumeByDay.length > 0 && (
        <div className="rounded-sm border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-medium">Daily Search Volume</h3>
          </div>
          <div className="flex flex-wrap gap-1 p-4">
            {volumeByDay.map((day) => (
              <div
                key={day.date}
                className="flex flex-col items-center gap-0.5"
                title={`${day.date}: ${day.count} searches`}
              >
                <div
                  className="w-5 rounded-sm bg-primary/20"
                  style={{
                    height: `${Math.max(4, Math.min(48, day.count * 2))}px`,
                  }}
                />
                <span className="text-[8px] text-muted-foreground">
                  {day.date.split("-").slice(1).join("/")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
