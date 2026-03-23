import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import type { ResolvedMenuItem } from "@/lib/layout/types";

interface MobileMenuItemProps {
  /** The resolved menu item */
  item: ResolvedMenuItem;
  /** Current nesting depth (affects indentation) */
  depth: number;
  /** Callback when a navigation link is clicked (to close mobile menu) */
  onNavigate: () => void;
}

/**
 * A single navigation item in the mobile menu with accordion toggle
 * for items that have children.
 *
 * Indentation increases with depth (16px per level).
 * Children are expanded/collapsed via a chevron toggle button.
 */
export function MobileMenuItem({
  item,
  depth,
  onNavigate,
}: MobileMenuItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (item.isOrphaned) return null;

  const hasChildren = item.children.length > 0;
  const paddingLeft = depth * 16;

  const linkProps = {
    ...(item.target ? { target: item.target } : {}),
    ...(item.rel ? { rel: item.rel } : {}),
  };

  return (
    <li data-slot="mobile-menu-item">
      <div className="flex items-center">
        <Link
          to={item.url}
          className={cn(
            "flex-1 px-4 py-3 text-xs text-foreground transition-colors hover:bg-muted",
            item.cssClasses,
          )}
          style={{ paddingLeft: `${paddingLeft + 16}px` }}
          activeProps={{
            className: "bg-muted font-medium",
          }}
          onClick={onNavigate}
          {...linkProps}
        >
          {item.label}
        </Link>
        {hasChildren && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex size-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${item.label} submenu`}
            aria-expanded={isExpanded}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                isExpanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {hasChildren && isExpanded && (
        <ul role="list">
          {item.children
            .filter((child) => !child.isOrphaned)
            .map((child) => (
              <MobileMenuItem
                key={child.id}
                item={child}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
        </ul>
      )}
    </li>
  );
}
