/**
 * SeverityBadge Component
 *
 * Reusable severity indicator with color dot and/or label.
 * Uses CSS variables only - no hardcoded colors.
 */

import { cn } from "@/lib/utils";
import type { AuditSeverity } from "@/lib/audit/types";
import { SEVERITY_MAP } from "@/lib/audit/constants";

interface SeverityBadgeProps {
  severity: AuditSeverity;
  /** Display mode: "dot" (dot only), "label" (text only), "badge" (dot + text), "full" (colored badge) */
  variant?: "dot" | "label" | "badge" | "full";
  className?: string;
}

export function SeverityBadge({
  severity,
  variant = "badge",
  className,
}: SeverityBadgeProps) {
  const config = SEVERITY_MAP[severity];
  if (!config) return null;

  if (variant === "dot") {
    return (
      <span
        className={cn("inline-block size-2 rounded-full", config.dotClass, className)}
        title={config.label}
      />
    );
  }

  if (variant === "label") {
    return (
      <span className={cn("text-xs capitalize", config.textClass, className)}>
        {config.label}
      </span>
    );
  }

  if (variant === "full") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-none px-2 py-0.5 text-xs font-medium",
          config.badgeClass,
          className,
        )}
      >
        <span className={cn("size-1.5 rounded-full", config.dotClass)} />
        {config.label}
      </span>
    );
  }

  // Default: "badge" - dot + label inline
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("size-2 rounded-full", config.dotClass)} />
      <span className={cn("text-xs capitalize", config.textClass)}>
        {config.label}
      </span>
    </span>
  );
}
