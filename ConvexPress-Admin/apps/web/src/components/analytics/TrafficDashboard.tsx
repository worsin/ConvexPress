/**
 * TrafficDashboard - Shared traffic analytics dashboard component.
 *
 * Used by both the post and page traffic tabs. Receives a postId and
 * renders pageview metrics, a daily trend chart, referrer breakdown,
 * device breakdown, and country breakdown.
 *
 * Supports date range selection: 7d, 30d, 90d, all time.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Users,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  ExternalLink,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataSourceIndicator } from "./DataSourceIndicator";

// ─── Date Range Helpers ─────────────────────────────────────────────────────

type DateRange = "7d" | "30d" | "90d" | "all";

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = now.toISOString().slice(0, 10);

  if (range === "all") {
    return { startDate: "2020-01-01", endDate };
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

/** Map the dashboard date range key to the GA4 date range key */
function toGA4DateRange(
  range: DateRange,
): "last7days" | "last28days" | "last90days" | null {
  switch (range) {
    case "7d":
      return "last7days";
    case "30d":
      return "last28days";
    case "90d":
      return "last90days";
    case "all":
      // GA4 has no "all time" — skip GA4 for this range
      return null;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface DailyBreakdownEntry {
  date: string;
  pageviews: number;
  uniqueVisitors: number;
}

interface ReferrerEntry {
  domain: string;
  pageviews: number;
}

interface CountryEntry {
  country: string;
  pageviews: number;
}

// ─── GA4 Data Types ────────────────────────────────────────────────────────

/** Shape of data stored in gaCache for traffic queries (from buildTrafficData) */
interface GA4TrafficData {
  totalPageviews: number;
  totalSessions: number;
  totalUsers: number;
  newUsers: number;
  sources: Array<{ channel: string; sessions: number }>;
  referrers: Array<{ domain: string; sessions: number }>;
  countries: Array<{ country: string; users: number }>;
  devices: Array<{ category: string; sessions: number }>;
  daily: Array<{
    date: string;
    pageviews: number;
    sessions: number;
    users: number;
  }>;
}

/** Normalized GA4 traffic shaped to match built-in traffic rendering */
interface NormalizedGA4Traffic {
  totalPageviews: number;
  totalUniqueVisitors: number;
  avgBounceRate: number;
  totalSessions: number;
  pagesPerSession: number;
  dailyBreakdown: DailyBreakdownEntry[];
  topReferrers: ReferrerEntry[];
  topCountries: CountryEntry[];
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
}

/**
 * Normalize GA4 cached traffic data into the same shape the dashboard renders.
 * GA4 provides richer data -- we map it to the existing rendering format.
 */
function normalizeGA4Traffic(data: GA4TrafficData): NormalizedGA4Traffic {
  // Map device categories to breakdown
  const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
  for (const d of data.devices) {
    const cat = d.category.toLowerCase();
    if (cat === "desktop") deviceBreakdown.desktop += d.sessions;
    else if (cat === "mobile") deviceBreakdown.mobile += d.sessions;
    else if (cat === "tablet") deviceBreakdown.tablet += d.sessions;
  }

  return {
    totalPageviews: data.totalPageviews,
    totalUniqueVisitors: data.totalUsers,
    avgBounceRate: 0, // GA4 bounce rate comes from engagement data, not traffic
    totalSessions: data.totalSessions,
    pagesPerSession:
      data.totalSessions > 0
        ? data.totalPageviews / data.totalSessions
        : 0,
    dailyBreakdown: data.daily.map((d) => ({
      date: formatGA4Date(d.date),
      pageviews: d.pageviews,
      uniqueVisitors: d.users,
    })),
    topReferrers: data.referrers
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10)
      .map((r) => ({ domain: r.domain, pageviews: r.sessions })),
    topCountries: data.countries
      .sort((a, b) => b.users - a.users)
      .slice(0, 10)
      .map((c) => ({ country: c.country, pageviews: c.users })),
    deviceBreakdown,
  };
}

/** Convert GA4 date format (YYYYMMDD) to ISO (YYYY-MM-DD) */
function formatGA4Date(date: string): string {
  if (date.length === 8 && !date.includes("-")) {
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  }
  return date;
}

// ─── Component ──────────────────────────────────────────────────────────────

interface TrafficDashboardProps {
  postId: Id<"posts">;
}

export function TrafficDashboard({ postId }: TrafficDashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const { startDate, endDate } = useMemo(() => getDateRange(range), [range]);

  // ── GA4 connection check ──────────────────────────────────────────────
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);
  const ga4DateRange = toGA4DateRange(range);

  // GA4 cached data (reactive — re-renders when cache is written)
  const ga4Data = useQuery(
    api.ga4.queries.getCachedTrafficData,
    isGA4Connected && ga4DateRange
      ? { dateRange: ga4DateRange }
      : "skip",
  );

  // Trigger GA4 fetch on cache miss
  const fetchTraffic = useAction(api.ga4.actions.fetchTrafficData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (
      isGA4Connected &&
      ga4DateRange &&
      ga4Data === null &&
      !fetchInFlightRef.current
    ) {
      fetchInFlightRef.current = true;
      fetchTraffic({ dateRange: ga4DateRange })
        .catch(() => {
          // Error handled by action (stored in settings)
        })
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, ga4DateRange, fetchTraffic]);

  // ── Built-in analytics data (always loaded as fallback) ───────────────
  const builtinTraffic = useQuery(api.analytics.queries.getTrafficSummary, {
    postId,
    startDate,
    endDate,
  });

  // Determine active data source
  const useGA4 = isGA4Connected && ga4DateRange && ga4Data?.data;
  const dataSource: "ga4" | "builtin" =
    useGA4 ? "ga4" : "builtin";

  // The traffic object used for rendering
  const traffic = useGA4
    ? normalizeGA4Traffic(ga4Data!.data as GA4TrafficData)
    : builtinTraffic;

  // Loading state
  const isLoading =
    isGA4Connected === undefined ||
    (isGA4Connected && ga4DateRange && ga4Data === undefined) ||
    builtinTraffic === undefined;

  if (isLoading) {
    return <TrafficSkeleton />;
  }

  // No data / no permission
  if (traffic === null || traffic === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          No analytics data available yet, or you do not have permission to view
          analytics.
        </p>
      </div>
    );
  }

  const hasData = traffic.totalPageviews > 0;

  return (
    <div className="space-y-6">
      {/* Date Range Selector + Data Source Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["7d", "30d", "90d", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {r === "7d"
                ? "7 Days"
                : r === "30d"
                  ? "30 Days"
                  : r === "90d"
                    ? "90 Days"
                    : "All Time"}
            </button>
          ))}
        </div>
        <DataSourceIndicator source={dataSource} />
      </div>

      {/* GA4 fetching indicator */}
      {isGA4Connected && ga4DateRange && ga4Data === null && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-4 py-2">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs text-muted-foreground">
            Fetching data from Google Analytics 4...
          </p>
        </div>
      )}

      {/* Metric Cards */}
      <div className={cn(
        "grid grid-cols-2 gap-3",
        dataSource === "ga4" ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}>
        <MetricCard
          icon={BarChart3}
          label="Pageviews"
          value={hasData ? formatNumber(traffic.totalPageviews) : "--"}
        />
        <MetricCard
          icon={Users}
          label="Unique Visitors"
          value={hasData ? formatNumber(traffic.totalUniqueVisitors) : "--"}
        />
        <MetricCard
          icon={TrendingUp}
          label="Bounce Rate"
          value={hasData ? formatPercent(traffic.avgBounceRate) : "--"}
        />
        <MetricCard
          icon={Clock}
          label="Sessions"
          value={hasData ? formatNumber(traffic.totalSessions) : "--"}
        />
        {/* GA4-only metric: pages per session */}
        {dataSource === "ga4" && (
          <MetricCard
            icon={Layers}
            label="Pages / Session"
            value={
              hasData && "pagesPerSession" in traffic
                ? (traffic as NormalizedGA4Traffic).pagesPerSession.toFixed(1)
                : "--"
            }
          />
        )}
      </div>

      {!hasData && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
          <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No traffic data recorded yet for this{" "}
            {range === "7d"
              ? "7-day"
              : range === "30d"
                ? "30-day"
                : range === "90d"
                  ? "90-day"
                  : ""}{" "}
            period. Data will appear once the tracking script captures pageviews.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Daily Trend Chart (bar chart using CSS) */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">
              Daily Pageviews
            </h3>
            <div className="flex h-40 items-end gap-1">
              {traffic.dailyBreakdown.map((day: DailyBreakdownEntry) => {
                const maxPv = Math.max(
                  ...traffic.dailyBreakdown.map((d: DailyBreakdownEntry) => d.pageviews),
                  1,
                );
                const heightPct = (day.pageviews / maxPv) * 100;
                return (
                  <div
                    key={day.date}
                    className="group relative flex flex-1 flex-col items-center"
                  >
                    <div
                      className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                    />
                    {/* Tooltip on hover */}
                    <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-popover px-2 py-1 text-[10px] text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                      {day.date}: {day.pageviews}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{traffic.dailyBreakdown[0]?.date ?? ""}</span>
              <span>
                {traffic.dailyBreakdown[traffic.dailyBreakdown.length - 1]
                  ?.date ?? ""}
              </span>
            </div>
          </div>

          {/* Referrers + Devices + Countries */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Top Referrers */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                Top Referrers
              </h3>
              <div className="space-y-2">
                {traffic.topReferrers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No referrer data
                  </p>
                ) : (
                  traffic.topReferrers.map((ref: ReferrerEntry) => (
                    <div
                      key={ref.domain}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate text-foreground">
                        {ref.domain}
                      </span>
                      <span className="text-muted-foreground">
                        {formatNumber(ref.pageviews)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Device Breakdown */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Monitor className="h-3.5 w-3.5" />
                Devices
              </h3>
              <div className="space-y-2">
                <DeviceRow
                  icon={Monitor}
                  label="Desktop"
                  count={traffic.deviceBreakdown.desktop}
                  total={traffic.totalPageviews}
                />
                <DeviceRow
                  icon={Smartphone}
                  label="Mobile"
                  count={traffic.deviceBreakdown.mobile}
                  total={traffic.totalPageviews}
                />
                <DeviceRow
                  icon={Tablet}
                  label="Tablet"
                  count={traffic.deviceBreakdown.tablet}
                  total={traffic.totalPageviews}
                />
              </div>
            </div>

            {/* Top Countries */}
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <Globe className="h-3.5 w-3.5" />
                Top Countries
              </h3>
              <div className="space-y-2">
                {traffic.topCountries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No country data
                  </p>
                ) : (
                  traffic.topCountries.map((c: CountryEntry) => (
                    <div
                      key={c.country}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-foreground">{c.country}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(c.pageviews)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function DeviceRow({
  icon: Icon,
  label,
  count,
  total,
}: {
  icon: typeof Monitor;
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-muted-foreground" />
          <span className="text-foreground">{label}</span>
        </div>
        <span className="text-muted-foreground">
          {formatNumber(count)} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

function TrafficSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
