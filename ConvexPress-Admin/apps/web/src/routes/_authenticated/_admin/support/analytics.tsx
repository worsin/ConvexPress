/**
 * Support Bridge - Admin Deflection Analytics Dashboard
 *
 * Route: /admin/support/analytics
 *
 * Shows:
 *   - Key metrics: total queries, deflection rate, avg latency, total tokens
 *   - Outcome breakdown (helpful/notHelpful/escalated/abandoned)
 *   - Top deflecting KB articles
 *   - Common unanswered queries (content gaps)
 */

import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Zap,
  HelpCircle,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  ArrowUpRight,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/_admin/support/analytics",
)({
  component: SupportAnalyticsPage,
  errorComponent: ErrorComponent,
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function SupportAnalyticsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/support">
      <SupportAnalyticsDashboard />
    </RoutePermissionGuard>
  );
}

function SupportAnalyticsDashboard() {
  // Date range (default: last 30 days)
  const [days, setDays] = useState(30);
  const dateRange = useMemo(() => {
    const end = Date.now();
    const start = end - days * 24 * 60 * 60 * 1000;
    return {
      startDate: start,
      endDate: end,
    };
  }, [days]);

  const stats = useQuery(api.support.analytics.getDeflectionStats, dateRange);
  const topArticles = useQuery(
    api.support.analytics.getTopDeflectingArticles,
    dateRange,
  );
  type TopDeflectingArticle = {
    articleId: string;
    title: string;
    helpfulAppearances: number;
    deflectionRate: number;
  };
  type UnansweredQuery = { query: string; count: number };

  if (stats === undefined || topArticles === undefined) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <p className="text-muted-foreground">
          You don't have permission to view support analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={BarChart3}
          label="Total Queries"
          value={stats.totalQueries.toLocaleString()}
        />
        <MetricCard
          icon={TrendingUp}
          label="Deflection Rate"
          value={`${(stats.deflectionRate * 100).toFixed(1)}%`}
          sublabel="queries resolved by AI"
        />
        <MetricCard
          icon={Clock}
          label="Avg Response Time"
          value={`${(stats.avgResponseLatencyMs / 1000).toFixed(1)}s`}
        />
        <MetricCard
          icon={Zap}
          label="Tokens Used"
          value={stats.totalTokensUsed.toLocaleString()}
        />
      </div>

      {/* Outcome Breakdown */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Outcome Breakdown
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <OutcomeCard
            icon={ThumbsUp}
            label="Helpful"
            count={stats.outcomes.helpful}
            total={stats.totalQueries}
            className="text-success"
          />
          <OutcomeCard
            icon={ThumbsDown}
            label="Not Helpful"
            count={stats.outcomes.notHelpful}
            total={stats.totalQueries}
            className="text-destructive"
          />
          <OutcomeCard
            icon={ArrowUpRight}
            label="Escalated"
            count={stats.outcomes.escalated}
            total={stats.totalQueries}
            className="text-warning"
          />
          <OutcomeCard
            icon={Ban}
            label="Abandoned"
            count={stats.outcomes.abandoned}
            total={stats.totalQueries}
            className="text-muted-foreground"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Deflecting Articles */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <BookOpen className="h-5 w-5" />
            Top Deflecting Articles
          </h2>
          {topArticles && topArticles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {(topArticles as TopDeflectingArticle[]).slice(0, 10).map((article, index) => (
                <div
                  key={article.articleId}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5"
                >
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {article.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {article.helpfulAppearances} deflections &middot;{" "}
                      {(article.deflectionRate * 100).toFixed(0)}% success rate
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No deflection data yet.
            </p>
          )}
        </div>

        {/* Common Unanswered Queries */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <HelpCircle className="h-5 w-5" />
            Content Gaps
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Queries that were not resolved by AI -- consider adding KB articles
            for these topics.
          </p>
          {stats.commonUnansweredQueries.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {(stats.commonUnansweredQueries as UnansweredQuery[]).map((item) => (
                <div
                  key={item.query}
                  className="flex items-center justify-between rounded-md px-2 py-1.5"
                >
                  <span className="truncate text-sm text-foreground">
                    "{item.query}"
                  </span>
                  <span className="ml-2 shrink-0 text-xs font-medium text-muted-foreground">
                    {item.count}x
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No unanswered queries yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

function OutcomeCard({
  icon: Icon,
  label,
  count,
  total,
  className,
}: {
  icon: typeof ThumbsUp;
  label: string;
  count: number;
  total: number;
  className: string;
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Icon className={cn("h-5 w-5", className)} />
      <div>
        <p className="text-lg font-bold text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground">
          {label} ({pct}%)
        </p>
      </div>
    </div>
  );
}
