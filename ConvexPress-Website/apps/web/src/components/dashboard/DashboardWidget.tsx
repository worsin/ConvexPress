import type * as React from "react";

import { cn } from "@/lib/utils";

interface DashboardWidgetProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Base widget card component used in the dashboard home grid.
 */
export function DashboardWidget({
  title,
  icon: Icon,
  action,
  children,
  className,
}: DashboardWidgetProps) {
  return (
    <div
      data-slot="dashboard-widget"
      className={cn("border border-border bg-card p-4", className)}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
