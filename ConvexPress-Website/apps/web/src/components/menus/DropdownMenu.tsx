import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DROPDOWN_TIMING } from "@/lib/layout/constants";
import type { ResolvedMenuItem } from "@/lib/layout/types";

interface DropdownMenuProps {
  /** Child menu items to render in the dropdown */
  items: ResolvedMenuItem[];
  /** Current nesting depth for positioning */
  depth: number;
  /** Additional CSS class */
  className?: string;
}

/**
 * Desktop dropdown submenu for nested menu items.
 * Appears on hover with configurable open/close delays.
 * Supports recursive nesting up to 5 levels.
 *
 * This component wraps the NavDropdown pattern from the layout system
 * in the canonical menus/ directory for explicit Menu System ownership.
 */
export function DropdownMenu({ items, depth, className }: DropdownMenuProps) {
  if (depth > 5 || items.length === 0) return null;

  const visibleItems = items.filter((item) => !item.isOrphaned);

  if (visibleItems.length === 0) return null;

  return (
    <ul
      data-slot="dropdown-menu"
      role="list"
      aria-label="Submenu"
      className={cn(
        "min-w-44 bg-popover text-popover-foreground ring-1 ring-foreground/10 rounded-none shadow-md",
        depth === 0
          ? "absolute left-0 top-full"
          : "absolute left-full top-0",
        className,
      )}
    >
      {visibleItems.map((item) => (
        <DropdownMenuItem key={item.id} item={item} depth={depth} />
      ))}
    </ul>
  );
}

interface DropdownMenuItemProps {
  item: ResolvedMenuItem;
  depth: number;
}

function DropdownMenuItem({ item, depth }: DropdownMenuItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasChildren = item.children.length > 0;

  const handleMouseEnter = React.useCallback(() => {
    if (!hasChildren) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    openTimeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, DROPDOWN_TIMING.openDelay);
  }, [hasChildren]);

  const handleMouseLeave = React.useCallback(() => {
    if (!hasChildren) return;
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, DROPDOWN_TIMING.closeDelay);
  }, [hasChildren]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (!hasChildren) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "ArrowLeft" || e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    },
    [hasChildren],
  );

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    };
  }, []);

  const linkProps = {
    ...(item.target ? { target: item.target } : {}),
    ...(item.rel ? { rel: item.rel } : {}),
  };

  return (
    <li
      data-slot="dropdown-menu-item"
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to={item.url}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          item.cssClasses,
        )}
        onKeyDown={handleKeyDown}
        {...linkProps}
      >
        <span>{item.label}</span>
        {hasChildren && <ChevronRight className="size-3 opacity-60" />}
      </Link>
      {hasChildren && isOpen && (
        <DropdownMenu items={item.children} depth={depth + 1} />
      )}
    </li>
  );
}
