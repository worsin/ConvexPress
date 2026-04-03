import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DROPDOWN_TIMING } from "@/lib/layout/constants";
import type { ResolvedMenu, ResolvedMenuItem } from "@/lib/layout/types";

import { NavDropdown } from "./NavDropdown";

interface DesktopNavProps {
  menu: ResolvedMenu | undefined;
  className?: string;
}

/**
 * Horizontal navigation bar with dropdown submenus for desktop viewports.
 * Hidden on mobile (< lg breakpoint).
 */
export function DesktopNav({ menu, className }: DesktopNavProps) {
  if (!menu) {
    // No menu assigned or still loading — render empty nav to avoid layout shift
    return (
      <nav
        data-slot="desktop-nav"
        aria-label="Primary navigation"
        className={cn("hidden lg:flex items-center gap-1", className)}
      />
    );
  }

  const visibleItems = menu.items.filter((item) => !item.isOrphaned);

  if (visibleItems.length === 0) return null;

  return (
    <nav
      data-slot="desktop-nav"
      aria-label="Primary navigation"
      className={cn("hidden lg:flex items-center gap-1", className)}
    >
      <ul role="list" className="flex items-center gap-1">
        {visibleItems.map((item) => (
          <DesktopNavItem key={item.id} item={item} />
        ))}
      </ul>
    </nav>
  );
}

interface DesktopNavItemProps {
  item: ResolvedMenuItem;
}

function DesktopNavItem({ item }: DesktopNavItemProps) {
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
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
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
      data-slot="desktop-nav-item"
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to={item.url}
        className={cn(
          "flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
          item.cssClasses,
        )}
        activeProps={{
          className: "text-foreground font-medium",
          "aria-current": "page" as const,
        }}
        onKeyDown={handleKeyDown}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-haspopup={hasChildren ? "true" : undefined}
        {...linkProps}
      >
        <span>{item.label}</span>
        {hasChildren && (
          <ChevronDown
            className={cn(
              "size-3 opacity-60 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        )}
      </Link>
      {hasChildren && isOpen && (
        <NavDropdown items={item.children} depth={0} />
      )}
    </li>
  );
}
