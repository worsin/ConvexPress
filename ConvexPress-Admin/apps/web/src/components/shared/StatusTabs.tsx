import { cn } from "@/lib/utils";
import type { StatusTab } from "@/types/list-table";

interface StatusTabsProps {
  /** Tab definitions with counts. */
  tabs: StatusTab[];
  /** Currently active tab key. Empty string or undefined = "all". */
  activeTab?: string;
  /** Tab change handler (updates URL params). */
  onTabChange: (tabKey: string) => void;
}

/**
 * Horizontal tab strip for status filtering.
 * Displays clickable status labels with count badges.
 * The active tab is bold. Clicking a tab updates the URL search params.
 *
 * Rendering: All (42) | Published (28) | Drafts (10) | Pending (2) | Trash (1)
 */
export function StatusTabs({ tabs, activeTab, onTabChange }: StatusTabsProps) {
  // Normalize: undefined or empty means "all"
  const currentTab = activeTab || "all";

  return (
    <div role="tablist" className="flex flex-wrap items-center gap-0 text-xs">
      {tabs.map((tab, index) => {
        const isActive =
          tab.key === currentTab ||
          (tab.key === "all" && !activeTab);
        const showSeparator = index < tabs.length - 1;

        return (
          <div key={tab.key} className="flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() =>
                onTabChange(tab.key === "all" ? "" : tab.key)
              }
              className={cn(
                "px-1 py-1 transition-colors",
                isActive
                  ? "text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-muted-foreground ml-0.5"
                  aria-label={`${tab.count} items`}
                >
                  ({tab.count})
                </span>
              )}
            </button>
            {showSeparator && (
              <span className="text-muted-foreground/50 px-1">|</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
