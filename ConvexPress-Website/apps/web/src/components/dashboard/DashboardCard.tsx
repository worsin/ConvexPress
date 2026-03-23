import type * as React from "react";

import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Reusable card wrapper for dashboard widgets and form sections.
 * Uses CSS variables only -- no hardcoded colors.
 */
export function DashboardCard({
  title,
  description,
  action,
  children,
  className,
}: DashboardCardProps) {
  return (
    <div
      data-slot="dashboard-card"
      className={cn("border border-border bg-card p-4", className)}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3
            data-slot="dashboard-card-title"
            className="text-sm font-medium text-foreground"
          >
            {title}
          </h3>
          {description && (
            <p
              data-slot="dashboard-card-description"
              className="mt-0.5 text-xs text-muted-foreground"
            >
              {description}
            </p>
          )}
        </div>
        {action && (
          <div data-slot="dashboard-card-action" className="shrink-0">
            {action}
          </div>
        )}
      </div>
      <div data-slot="dashboard-card-content">{children}</div>
    </div>
  );
}
