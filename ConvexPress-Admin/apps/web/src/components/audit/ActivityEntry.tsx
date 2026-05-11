/**
 * ActivityEntry Component
 *
 * Single timeline entry in the Activity Log.
 * Shows severity dot, actor, description, relative timestamp.
 * Expandable to show additional details inline.
 */

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, UserIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuditEntryListItem } from "@/lib/audit/types";
import { formatRelativeTime } from "@/lib/audit/formatters";
import { SEVERITY_MAP } from "@/lib/audit/constants";
import { SeverityBadge } from "./SeverityBadge";

interface ActivityEntryProps {
  entry: AuditEntryListItem;
}

export function ActivityEntry({ entry }: ActivityEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_MAP[entry.severity];

  return (
    <div className="group">
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Severity dot */}
        <div className="mt-1.5 shrink-0">
          <SeverityBadge severity={entry.severity} variant="dot" />
        </div>

        {/* Actor avatar placeholder */}
        <div className="mt-0.5 shrink-0 flex items-center justify-center size-6 rounded-full bg-muted">
          <UserIcon className="size-3 text-muted-foreground" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground truncate">
              {entry.actorName ?? entry.actorEmail ?? "System"}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(entry.occurredAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {entry.description}
          </p>
        </div>

        {/* Expand indicator */}
        <div className="mt-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {expanded ? (
            <ChevronDownIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-[3.25rem] px-3 pb-3 text-xs">
          <div className="border border-border rounded-none bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground">Severity:</span>{" "}
                <SeverityBadge severity={entry.severity} variant="full" />
              </div>
              <div>
                <span className="text-muted-foreground">Event:</span>{" "}
                <code className="text-[11px] text-muted-foreground">
                  {entry.eventCode}
                </code>
              </div>
            </div>
            {entry.objectLabel && (
              <div>
                <span className="text-muted-foreground">Object:</span>{" "}
                <span className="text-foreground">
                  {entry.objectLabel}
                </span>
                <span className="text-muted-foreground ml-1">
                  ({entry.objectType})
                </span>
              </div>
            )}
            {entry.actorRole && (
              <div>
                <span className="text-muted-foreground">Role:</span>{" "}
                <span className="text-foreground capitalize">
                  {entry.actorRole}
                </span>
              </div>
            )}
            {entry.actorIp && (
              <div>
                <span className="text-muted-foreground">IP:</span>{" "}
                <code className="text-[11px] text-muted-foreground">
                  {entry.actorIp}
                </code>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
