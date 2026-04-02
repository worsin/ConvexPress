/**
 * Page Engagement Tab - Lazy-loaded component
 *
 * Placeholder until the Analytics System is built.
 * Shows grayed-out metric cards and a scroll depth visualization placeholder.
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { MousePointerClick, ArrowDownToLine, Target, LogOut, Activity } from "lucide-react";

export const Route = createLazyFileRoute(
  "/_authenticated/_admin/pages/$pageId/engagement",
)({
  component: EngagementTab,
});

const metrics = [
  { label: "Avg Time on Page", icon: Activity },
  { label: "Scroll Depth", icon: ArrowDownToLine },
  { label: "CTA Click Rate", icon: MousePointerClick },
  { label: "Exit Rate", icon: LogOut },
];

function EngagementTab() {
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Engagement tracking coming soon — see scroll depth, click patterns,
          and conversion events for this page.
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

      {/* Scroll depth visualization placeholder */}
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 opacity-50">
        <div className="mb-3 flex items-center gap-2">
          <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Scroll Depth
          </span>
        </div>
        <div className="flex h-32 items-end gap-2">
          {[100, 75, 55, 40].map((pct, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-muted-foreground/30"
                style={{ height: `${pct}%` }}
              />
              <span className="text-xs text-muted-foreground">{pct}%</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
