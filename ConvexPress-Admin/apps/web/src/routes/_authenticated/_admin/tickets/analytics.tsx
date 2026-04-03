/**
 * Ticket Analytics Route - /admin/tickets/analytics
 *
 * Analytics dashboard: ticket volume, avg response time, CSAT score,
 * status breakdown, priority breakdown, rate limit stats.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@backend/convex/_generated/api";
import { RoutePermissionGuard } from "@/lib/route-permission-guard";
import { BarChart3, Clock, Star, TrendingUp } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/_admin/tickets/analytics",
)({
  component: TicketAnalyticsPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "N/A";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

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
        <span className="text-xs font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {subtext && (
        <div className="text-xs text-foreground/40 mt-1">{subtext}</div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function TicketAnalyticsPage() {
  const stats = useQuery(api.tickets.queries.getStats);
  const rateLimitStats = useQuery(api.tickets.rateLimit.getGlobalStats);

  return (
    <RoutePermissionGuard requiredAccess="/admin/tickets">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Ticket Analytics</h1>

        {stats ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard
                label="Active Tickets"
                value={stats.totalActive}
                icon={BarChart3}
                subtext={`${(stats.counts as any)?.open ?? 0} open, ${(stats.counts as any)?.inProgress ?? 0} in progress`}
              />
              <StatCard
                label="Avg First Response"
                value={formatDuration(stats.avgFirstResponseMs)}
                icon={Clock}
                subtext="All time"
              />
              <StatCard
                label="Avg Resolution"
                value={formatDuration(stats.avgResolutionMs)}
                icon={TrendingUp}
                subtext="All time"
              />
              <StatCard
                label="CSAT Score"
                value={
                  stats.avgRating > 0
                    ? `${stats.avgRating.toFixed(1)}/5`
                    : "N/A"
                }
                icon={Star}
                subtext={`${stats.ratedCount} rating${stats.ratedCount !== 1 ? "s" : ""}`}
              />
            </div>

            {/* Status Breakdown */}
            <div className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground/70 mb-3">
                Tickets by Status
              </h2>
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(stats.counts as Record<string, number>).map(
                  ([status, count]) => (
                    <div key={status} className="text-center">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {status.replace(/([A-Z])/g, " $1").trim()}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Priority Breakdown */}
            <div className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground/70 mb-3">
                Active Tickets by Priority
              </h2>
              <div className="grid grid-cols-4 gap-3">
                {Object.entries(
                  stats.priorityCounts as Record<string, number>,
                ).map(([priority, count]) => (
                  <div key={priority} className="text-center">
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {priority}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Awaiting First Response */}
            {stats.awaitingFirstResponseCount > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium text-warning">
                    {stats.awaitingFirstResponseCount} ticket
                    {stats.awaitingFirstResponseCount !== 1 ? "s" : ""} awaiting
                    first response
                  </span>
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
            <div className="h-24 bg-muted rounded-lg" />
          </div>
        )}

        {/* Rate Limit Stats */}
        {rateLimitStats && (
          <div className="rounded-lg border border-border p-4">
            <h2 className="text-sm font-semibold text-foreground/70 mb-3">
              Rate Limiting (All Time)
            </h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">AI Queries:</span>{" "}
                <span className="font-medium">
                  {(rateLimitStats as any)?.aiQueryCount ?? 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Ticket Creations:</span>{" "}
                <span className="font-medium">
                  {(rateLimitStats as any)?.ticketCreateCount ?? 0}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Searches:</span>{" "}
                <span className="font-medium">
                  {(rateLimitStats as any)?.searchCount ?? 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </RoutePermissionGuard>
  );
}
