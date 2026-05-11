/**
 * AuditStatsBar Component
 *
 * Summary counts by severity with clickable badges to filter.
 * Period selector (today/week/month).
 * Wired to useQuery(api.auditLogs.queries.getStats).
 */

import { cn } from "@/lib/utils";
import type { AuditSeverity, AuditStatsPeriod } from "@/lib/audit/types";
import { SEVERITY_LEVELS, STATS_PERIODS } from "@/lib/audit/constants";
import { useAuditStats } from "@/hooks/audit/useAuditStats";
import { SeverityBadge } from "./SeverityBadge";

interface AuditStatsBarProps {
  /** Called when a severity badge is clicked. Passes undefined to clear filter. */
  onSeverityFilter?: (severity: AuditSeverity | undefined) => void;
  /** Currently active severity filter (to highlight it) */
  activeSeverity?: AuditSeverity;
}

export function AuditStatsBar({
  onSeverityFilter,
  activeSeverity,
}: AuditStatsBarProps) {
  const { stats, period, setPeriod, isLoading } = useAuditStats("today");

  return (
    <div className="border border-border rounded-none bg-card p-3 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-foreground">
            Activity Summary
          </h3>
          {stats && (
            <span className="text-xs text-muted-foreground">
              {stats.total} total events
            </span>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1">
          {STATS_PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={cn(
                "px-2 py-1 text-[11px] font-medium rounded-none transition-colors",
                period === p.value
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Severity badges */}
      {isLoading ? (
        <div className="flex items-center gap-3">
          {SEVERITY_LEVELS.map((s) => (
            <div
              key={s.value}
              className="h-7 w-20 bg-muted/50 animate-pulse rounded-none"
            />
          ))}
        </div>
      ) : stats ? (
        <div className="flex items-center gap-2 flex-wrap">
          {SEVERITY_LEVELS.map((s) => {
            const count =
              stats.bySeverity[s.value as keyof typeof stats.bySeverity] ?? 0;
            const isActive = activeSeverity === s.value;

            return (
              <button
                key={s.value}
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-none border transition-colors",
                  isActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                )}
                onClick={() =>
                  onSeverityFilter?.(
                    isActive ? undefined : s.value,
                  )
                }
                title={`Filter by ${s.label}`}
              >
                <SeverityBadge severity={s.value} variant="dot" />
                <span className="font-medium text-foreground">{count}</span>
                <span className="text-muted-foreground">{s.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
