/**
 * DataSourceIndicator - Shows which analytics data source is active.
 *
 * Displays a small badge: "GA4" (primary) or "Built-in" (muted).
 * When not connected, includes a link to the analytics settings page.
 */

import { Link } from "@tanstack/react-router";
import { BarChart3, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface DataSourceIndicatorProps {
  source: "ga4" | "builtin";
  className?: string;
}

export function DataSourceIndicator({
  source,
  className,
}: DataSourceIndicatorProps) {
  if (source === "ga4") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium",
          "rounded-full px-2 py-0.5",
          "bg-primary/10 text-primary",
          className,
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        GA4
      </span>
    );
  }

  return (
    <Link
      to="/settings/analytics"
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium transition-colors",
        "rounded-full px-2 py-0.5",
        "bg-muted text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <BarChart3 className="h-3 w-3" />
      Built-in
      <ExternalLink className="h-2.5 w-2.5 opacity-50" />
    </Link>
  );
}
