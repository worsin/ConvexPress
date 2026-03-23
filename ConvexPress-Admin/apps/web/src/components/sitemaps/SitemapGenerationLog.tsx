/**
 * SitemapGenerationLog - Recent generation log table.
 *
 * Displays the last 10 generation log entries with:
 *   - Timestamp
 *   - Trigger type
 *   - URL count
 *   - Duration
 *   - Status (success/error)
 *
 * Error entries are highlighted.
 * Updates in real-time via the reactive getStatus query.
 */

import { cn } from "@/lib/utils";
import { TRIGGER_LABELS } from "@/lib/sitemaps/constants";
import type { SitemapGenerationLogEntry } from "@/lib/sitemaps/types";

interface SitemapGenerationLogProps {
  entries: SitemapGenerationLogEntry[];
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function SitemapGenerationLog({ entries }: SitemapGenerationLogProps) {
  if (entries.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-muted-foreground">
        No generation history yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">
              Timestamp
            </th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">
              Trigger
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              URLs
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              Sitemaps
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              Duration
            </th>
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry._id}
              className={cn(
                "border-b border-border/50 last:border-b-0",
                entry.status === "error" && "bg-red-500/5",
              )}
            >
              <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                {formatTimestamp(entry.createdAt)}
              </td>
              <td className="py-1.5 px-2">
                {TRIGGER_LABELS[entry.triggeredBy] || entry.triggeredBy}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums">
                {entry.totalUrls.toLocaleString()}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums">
                {entry.sitemapsGenerated}
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                {formatDuration(entry.durationMs)}
              </td>
              <td className="py-1.5 px-2">
                {entry.status === "success" ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Success</span>
                ) : (
                  <span className="text-red-600 dark:text-red-400" title={entry.errorMessage}>
                    Error
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
