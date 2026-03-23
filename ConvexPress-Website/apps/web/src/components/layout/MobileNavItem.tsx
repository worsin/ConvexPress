import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import type { ResolvedMenuItem } from "@/lib/layout/types";

interface MobileNavItemProps {
  item: ResolvedMenuItem;
  depth: number;
  onNavigate: () => void;
}

/**
 * A single navigation item in the mobile nav, with accordion toggle for items with children.
 */
export function MobileNavItem({ item, depth, onNavigate }: MobileNavItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  if (item.isOrphaned) return null;

  const hasChildren = item.children.length > 0;
  const paddingLeft = depth * 16;

  const linkProps = {
    ...(item.target ? { target: item.target } : {}),
    ...(item.rel ? { rel: item.rel } : {}),
  };

  return (
    <li data-slot="mobile-nav-item">
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
            "aria-current": "page" as const,
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
              <MobileNavItem
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
