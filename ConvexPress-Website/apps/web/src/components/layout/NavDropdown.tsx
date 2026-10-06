import { MenuItemTarget, dismissMenuOnEscape } from "@/components/menus/MenuItemTarget";
import { ChevronRight } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DROPDOWN_TIMING } from "@/lib/layout/constants";
import type { ResolvedMenuItem } from "@/lib/layout/types";

interface NavDropdownProps {
  items: ResolvedMenuItem[];
  depth: number;
  className?: string;
  onNavigate?: () => void;
}

/**
 * Recursive dropdown submenu component for nested menu items.
 * Maximum 5 levels of nesting supported.
 */
export function NavDropdown({ items, depth, className, onNavigate }: NavDropdownProps) {
  if (depth > 5 || items.length === 0) return null;

  return (
    <ul
      data-slot="nav-dropdown"
      role="list"
      aria-label="Submenu"
      className={cn(
        "min-w-44 bg-popover text-popover-foreground ring-1 ring-foreground/10 rounded-none shadow-md",
        depth === 0 ? "absolute left-0 top-full" : "absolute left-full top-0",
        className,
      )}
    >
      {items
        .filter((item) => !item.isOrphaned)
        .map((item) => (
          <NavDropdownItem key={item.id} item={item} depth={depth} onNavigate={onNavigate} />
        ))}
    </ul>
  );
}

interface NavDropdownItemProps {
  onNavigate?: () => void;
  item: ResolvedMenuItem;
  depth: number;
}

function NavDropdownItem({ item, depth, onNavigate }: NavDropdownItemProps) {
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
  const linkClassName = cn(
    "flex items-center justify-between gap-2 px-3 py-2 text-xs text-popover-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    item.cssClasses,
  );
  const content = (
    <>
      <span>{item.label}</span>
      {hasChildren && <ChevronRight className="size-3 opacity-60" />}
    </>
  );

  return (
    <li
      data-slot="nav-dropdown-item"
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(event) => dismissMenuOnEscape(event, isOpen, () => {
        if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
        setIsOpen(false);
      })}
    >
      <MenuItemTarget
          item={item}
          onClick={onNavigate}
          onToggle={hasChildren ? () => setIsOpen(value => !value) : undefined}
          aria-expanded={hasChildren ? isOpen : undefined}
          className={linkClassName}
          onKeyDown={handleKeyDown}
          {...linkProps}
        >
          {content}
        </MenuItemTarget>
      {hasChildren && (isOpen || item.type === "separator") && (
        <NavDropdown
          items={item.children}
          className={item.type === "separator" ? "static shadow-none ring-0" : undefined}
          depth={depth + 1}
          onNavigate={onNavigate}
        />
      )}
    </li>
  );
}
