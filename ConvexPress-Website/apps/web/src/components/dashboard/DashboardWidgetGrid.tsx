import type * as React from "react";

import { cn } from "@/lib/utils";

interface DashboardWidgetGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Static 2-column grid layout for dashboard home widgets.
 * Collapses to single column on mobile (< md breakpoint).
 * No drag-and-drop in v1.
 */
export function DashboardWidgetGrid({
  children,
  className,
}: DashboardWidgetGridProps) {
  return (
    <div
      data-slot="dashboard-widget-grid"
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
