/**
 * KB Analytics Route - /admin/kb/analytics
 *
 * Analytics dashboard: article counts, views, searches, feedback.
 * Wired to api.kb.analytics.getDashboardStats
 */

import { createFileRoute, ErrorComponent } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { BookOpen, Eye, Search, ThumbsUp, TrendingUp, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/kb/analytics")({
  component: KBAnalyticsPage,
  errorComponent: ErrorComponent,
});

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtext && <div className="text-xs text-foreground/40 mt-1">{subtext}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function KBAnalyticsPage() {
  return (
    <RoutePermissionGuard requiredAccess="/admin/kb">
      <KBAnalyticsContent />
    </RoutePermissionGuard>
  );
}

function KBAnalyticsContent() {
  const stats = useQuery(api.kb.analytics.getDashboardStats, {});

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">KB Analytics</h1>

      {stats ? (
        <>
          {/* Article Counts */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Articles"
              value={stats.totalArticles}
              icon={BookOpen}
              subtext={`${stats.articles.published} published`}
            />
            <StatCard
              label="Total Views (30d)"
              value={stats.views.total}
              icon={Eye}
              subtext={`${stats.views.uniqueSessions} unique sessions`}
            />
            <StatCard
              label="Searches (30d)"
              value={stats.searches.total}
              icon={Search}
              subtext={`Avg ${stats.searches.avgResultCount} results`}
            />
            <StatCard
              label="Helpful Rate"
              value={`${stats.feedback.helpfulPercent}%`}
              icon={ThumbsUp}
              subtext={`${stats.feedback.total} total feedback`}
            />
          </div>

          {/* Article Status Breakdown */}
          <div className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground/70 mb-3">Articles by Status</h2>
            <div className="grid grid-cols-4 gap-3">
              {(Object.entries(stats.articles) as [string, number][]).map(([status, count]) => (
                <div key={status} className="text-center">
                  <div className="text-lg font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground capitalize">{status}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback Summary */}
          {stats.feedback.total > 0 && (
            <div className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground/70 mb-3">Feedback Overview</h2>
              <div className="flex items-center gap-4">
                <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-success h-full transition-all"
                    style={{ width: `${stats.feedback.helpfulPercent}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-foreground/70 whitespace-nowrap">
                  {stats.feedback.helpfulPercent}% helpful
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-foreground/50">
                <span>{stats.feedback.total} total responses</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-muted rounded-lg" />
            ))}
          </div>
          <div className="h-32 bg-muted rounded-lg" />
        </div>
      )}
    </div>
  );
}
