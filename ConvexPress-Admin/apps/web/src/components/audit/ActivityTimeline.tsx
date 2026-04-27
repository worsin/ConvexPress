/**
 * ActivityTimeline Component
 *
 * Chronological timeline grouped by date (Today, Yesterday, older dates).
 * Real-time via Convex subscription. Supports category filtering and
 * infinite scroll via "Load More".
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { ActivityIcon, LoaderIcon } from "lucide-react";

import { api } from "@backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import type { AuditEntryListItem } from "@/lib/audit/types";
import { getDateGroup } from "@/lib/audit/formatters";
import { ACTIVITY_CATEGORIES } from "@/lib/audit/constants";
import { ActivityEntry } from "./ActivityEntry";

interface ActivityTimelineProps {
  /** Initial number of entries to load */
  initialLimit?: number;
}

export function ActivityTimeline({
  initialLimit = 50,
}: ActivityTimelineProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [limit, setLimit] = useState(initialLimit);

  // Build query args based on category
  const queryArgs = useMemo(() => {
    const cat = ACTIVITY_CATEGORIES.find((c) => c.key === activeCategory);
    if (!cat || cat.key === "all") {
      return { limit };
    }
    // For objectType-based categories, we filter client-side
    // since recentActivity doesn't support objectType filter
    return { limit: limit * 2 }; // fetch extra for client-side filtering
  }, [activeCategory, limit]);

  const result = useQuery(api.auditLogs.queries.recentActivity, queryArgs);
  const rawEntries = (result?.entries ?? []) as AuditEntryListItem[];

  // Client-side category filtering
  const entries = useMemo(() => {
    const cat = ACTIVITY_CATEGORIES.find((c) => c.key === activeCategory);
    if (!cat || cat.key === "all") return rawEntries;

    let filtered = rawEntries;

    if ("objectTypes" in cat && cat.objectTypes) {
      const types = new Set<string>(cat.objectTypes);
      filtered = filtered.filter((e) => types.has(e.objectType));
    }

    if ("eventPrefixes" in cat && cat.eventPrefixes) {
      const prefixes = cat.eventPrefixes;
      filtered = filtered.filter((e) =>
        prefixes.some((p) => e.eventCode.startsWith(p)),
      );
    }

    return filtered.slice(0, limit);
  }, [rawEntries, activeCategory, limit]);

  // Group entries by date
  const groupedEntries = useMemo(() => {
    const groups: Array<{ label: string; entries: AuditEntryListItem[] }> = [];
    let currentGroup: string | null = null;

    for (const entry of entries) {
      const group = getDateGroup(entry.occurredAt);
      if (group !== currentGroup) {
        groups.push({ label: group, entries: [] });
        currentGroup = group;
      }
      groups[groups.length - 1].entries.push(entry);
    }

    return groups;
  }, [entries]);

  const handleLoadMore = useCallback(() => {
    setLimit((prev) => prev + initialLimit);
  }, [initialLimit]);

  const isLoading = result === undefined;

  return (
    <div>
      {/* Category Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {ACTIVITY_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeCategory === cat.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setActiveCategory(cat.key);
              setLimit(initialLimit);
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin mr-2" />
          Loading activity...
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No activity found."
          description={
            activeCategory !== "all"
              ? "Try selecting a different category."
              : "Activity will appear here as users interact with the system."
          }
          isFiltered={activeCategory !== "all"}
        />
      ) : (
        <div className="border border-border rounded-none overflow-hidden">
          {groupedEntries.map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="px-3 py-1.5 bg-muted/50 border-b border-border">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </span>
              </div>

              {/* Entries in this group */}
              <div className="divide-y divide-border">
                {group.entries.map((entry) => (
                  <ActivityEntry key={entry._id} entry={entry} />
                ))}
              </div>
            </div>
          ))}

          {/* Load More */}
          {rawEntries.length >= limit && (
            <div className="p-3 border-t border-border flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadMore}
              >
                Load More
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
