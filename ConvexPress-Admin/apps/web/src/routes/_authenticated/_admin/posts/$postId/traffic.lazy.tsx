/**
 * Post Traffic Tab - Lazy-loaded component
 *
 * Placeholder dashboard until the Analytics System is built.
 * Shows grayed-out metric cards and a chart area placeholder.
 */

import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, TrendingUp, Clock, Users, Settings } from "lucide-react";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/posts/$postId/traffic",
)({
  component: TrafficTab,
});

const metrics = [
  { label: "Pageviews", icon: BarChart3 },
  { label: "Unique Visitors", icon: Users },
  { label: "Bounce Rate", icon: TrendingUp },
  { label: "Avg Time", icon: Clock },
];

function TrafficTab() {
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Analytics coming soon — connect Google Analytics or enable built-in
          tracking to see traffic data for this page.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/20 p-4 opacity-50"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                {label}
              </span>
            </div>
            <span className="text-2xl font-semibold text-muted-foreground">
              --
            </span>
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed bg-muted/20 opacity-50">
        <div className="flex flex-col items-center gap-2 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Traffic chart will appear here
          </span>
        </div>
      </div>

      {/* Configure link */}
      <div className="flex justify-start">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-3.5 w-3.5" />
          Configure Analytics
        </Link>
      </div>
    </div>
  );
}
