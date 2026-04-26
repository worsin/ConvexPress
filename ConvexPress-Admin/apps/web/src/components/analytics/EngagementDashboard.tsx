/**
 * EngagementDashboard - Shared engagement analytics dashboard component.
 *
 * Used by both the post and page engagement tabs. Receives a postId and
 * renders scroll depth funnel, time on page, and internal link click metrics.
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import {
  Activity,
  ArrowDownToLine,
  MousePointerClick,
  Target,
  Link as LinkIcon,
  Timer,
  Zap,
  BarChart3,
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

function formatDuration(ms: number): string {
  if (ms === 0) return "--";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPercent(n: number): string {
  return (n * 100).toFixed(0) + "%";
}

function formatSeconds(sec: number): string {
  if (sec === 0) return "--";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
      return null;
  }
}

// ─── GA4 Engagement Data Types ─────────────────────────────────────────────

/** Shape of data stored in gaCache for engagement queries */
interface GA4EngagementData {
  bounceRate: number;
  avgSessionDuration: number;
  pagesPerSession: number;
  engagementRate: number;
  totalEvents: number;
  daily: Array<{
    date: string;
    bounceRate: number;
    avgSessionDuration: number;
    pagesPerSession: number;
    engagementRate: number;
    eventCount: number;
  }>;
}

interface EngagementSummary {
  avgTimeOnPage: number;
  avgEngagedTime: number;
  totalInternalClicks: number;
  scrollDepthDistribution: ReturnType<typeof getDefaultScrollDepth>;
  topInternalLinks: Array<{
    targetPath: string;
    clicks: number;
  }>;
}

// Section labels for display
const SECTION_CONFIG: Array<{
  key: keyof ReturnType<typeof getDefaultScrollDepth>;
  label: string;
  shortLabel: string;
}> = [
  { key: "hero", label: "Hero / Title", shortLabel: "Hero" },
  { key: "topic1", label: "Topic 1", shortLabel: "T1" },
  { key: "topic2", label: "Topic 2", shortLabel: "T2" },
  { key: "topic3", label: "Topic 3", shortLabel: "T3" },
  { key: "topic4", label: "Topic 4", shortLabel: "T4" },
  { key: "topic5", label: "Topic 5", shortLabel: "T5" },
  { key: "summary", label: "Summary", shortLabel: "Sum" },
  { key: "sources", label: "Sources", shortLabel: "Src" },
  { key: "comments", label: "Comments", shortLabel: "Cmt" },
];

function getDefaultScrollDepth() {
  return {
    hero: 0,
    topic1: 0,
    topic2: 0,
    topic3: 0,
    topic4: 0,
    topic5: 0,
    summary: 0,
    sources: 0,
    comments: 0,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

interface EngagementDashboardProps {
  postId: Id<"posts">;
}

export function EngagementDashboard({ postId }: EngagementDashboardProps) {
  const [range, setRange] = useState<DateRange>("30d");
  const { startDate, endDate } = useMemo(() => getDateRange(range), [range]);

  // ── GA4 connection check ──────────────────────────────────────────────
  const isGA4Connected = useQuery(api.ga4.queries.isConnected);
  const ga4DateRange = toGA4DateRange(range);

  // GA4 cached engagement data (reactive)
  const ga4Data = useQuery(
    api.ga4.queries.getCachedEngagementData,
    isGA4Connected && ga4DateRange
      ? { dateRange: ga4DateRange }
      : "skip",
  );

  // Trigger GA4 fetch on cache miss
  const fetchEngagement = useAction(api.ga4.actions.fetchEngagementData);
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (
      isGA4Connected &&
      ga4DateRange &&
      ga4Data === null &&
      !fetchInFlightRef.current
    ) {
      fetchInFlightRef.current = true;
      fetchEngagement({ dateRange: ga4DateRange })
        .catch(() => {})
        .finally(() => {
          fetchInFlightRef.current = false;
        });
    }
  }, [isGA4Connected, ga4Data, ga4DateRange, fetchEngagement]);

  // ── Built-in engagement data (ALWAYS loaded — scroll depth is unique) ─
  const engagement = useQuery(api.analytics.queries.getEngagementSummary, {
    postId,
    startDate,
    endDate,
  }) as EngagementSummary | null | undefined;

  // Determine data source for aggregate metrics
  const ga4Engagement = isGA4Connected && ga4DateRange && ga4Data?.data
    ? (ga4Data.data as GA4EngagementData)
    : null;
  const dataSource: "ga4" | "builtin" = ga4Engagement ? "ga4" : "builtin";

  // Loading state
  const isLoading =
    isGA4Connected === undefined ||
    engagement === undefined ||
    (isGA4Connected && ga4DateRange && ga4Data === undefined);

  if (isLoading) {
    return <EngagementSkeleton />;
  }

  // No data / no permission
  if (engagement === null) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          No engagement data available yet, or you do not have permission to view analytics.
        </p>
      </div>
    );
  }

  const hasBuiltinData = engagement.avgTimeOnPage > 0 || engagement.totalInternalClicks > 0;
  const hasGA4Data = ga4Engagement !== null;
  const hasData = hasBuiltinData || hasGA4Data;

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
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : r === "90d" ? "90 Days" : "All Time"}
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
            Fetching engagement data from Google Analytics 4...
          </p>
        </div>
      )}

      {/* Metric Cards -- built-in metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Avg Time on Page"
          value={hasBuiltinData ? formatDuration(engagement.avgTimeOnPage) : "--"}
        />
        <MetricCard
          icon={Target}
          label="Avg Engaged Time"
          value={hasBuiltinData ? formatDuration(engagement.avgEngagedTime) : "--"}
        />
        <MetricCard
          icon={MousePointerClick}
          label="Internal Clicks"
          value={hasBuiltinData ? String(engagement.totalInternalClicks) : "--"}
        />
        <MetricCard
          icon={ArrowDownToLine}
          label="Deepest Section"
          value={
            hasBuiltinData
              ? getDeepestSection(engagement.scrollDepthDistribution)
              : "--"
          }
        />
      </div>

      {/* GA4-only engagement metrics */}
      {hasGA4Data && ga4Engagement && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            icon={Timer}
            label="Avg Session Duration"
            value={formatSeconds(ga4Engagement.avgSessionDuration)}
          />
          <MetricCard
            icon={Zap}
            label="Engagement Rate"
            value={formatPercent(ga4Engagement.engagementRate)}
          />
          <MetricCard
            icon={BarChart3}
            label="Bounce Rate"
            value={formatPercent(ga4Engagement.bounceRate)}
          />
          <MetricCard
            icon={MousePointerClick}
            label="Total Events"
            value={ga4Engagement.totalEvents.toLocaleString()}
          />
        </div>
      )}

      {!hasData && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No engagement data recorded yet for this period. Data will appear
            once the tracking script captures scroll depth and click events.
          </p>
        </div>
      )}

      {hasData && (
        <>
          {/* Scroll Depth Funnel */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-medium text-foreground">
              <ArrowDownToLine className="h-3.5 w-3.5" />
              Section Scroll Depth
            </h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Percentage of visitors who scrolled to each content section.
            </p>
            <div className="space-y-2">
              {SECTION_CONFIG.map(({ key, label }) => {
                const pct = engagement.scrollDepthDistribution[key] ?? 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-foreground">{label}</span>
                      <span className="text-muted-foreground">{formatPercent(pct)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${Math.max(pct * 100, 1)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Internal Link Clicks */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              Top Internal Link Clicks
            </h3>
            <div className="space-y-2">
              {engagement.topInternalLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No internal link clicks recorded</p>
              ) : (
                engagement.topInternalLinks.map((link) => (
                  <div key={link.targetPath} className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{link.targetPath}</span>
                    <span className="text-muted-foreground">{link.clicks} clicks</span>
                  </div>
                ))
              )}
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
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-semibold text-foreground">{value}</span>
    </div>
  );
}

function getDeepestSection(
  distribution: Record<string, number>,
): string {
  // Find the deepest section where >=50% of visitors reach
  const orderedKeys = [
    "hero",
    "topic1",
    "topic2",
    "topic3",
    "topic4",
    "topic5",
    "summary",
    "sources",
    "comments",
  ];
  const labels = [
    "Hero",
    "Topic 1",
    "Topic 2",
    "Topic 3",
    "Topic 4",
    "Topic 5",
    "Summary",
    "Sources",
    "Comments",
  ];

  let deepest = "Hero";
  for (let i = 0; i < orderedKeys.length; i++) {
    if ((distribution[orderedKeys[i]] ?? 0) >= 0.5) {
      deepest = labels[i];
    }
  }
  return deepest;
}

function EngagementSkeleton() {
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
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
