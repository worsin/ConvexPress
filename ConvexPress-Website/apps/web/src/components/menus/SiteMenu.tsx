import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DROPDOWN_TIMING } from "@/lib/layout/constants";
import { useMenuForLocation } from "@/hooks/layout/useMenuForLocation";
import type { ResolvedMenu, ResolvedMenuItem } from "@/lib/layout/types";

import { DropdownMenu } from "./DropdownMenu";
import { MenuItemList } from "./MenuItemList";
import { SocialLinksMenu } from "./SocialLinksMenu";

interface SiteMenuProps {
  /** Menu location slug (e.g., "header", "footer", "sidebar", "mobile", "social") */
  location: string;
  /** Additional CSS classes for the outer nav element */
  className?: string;
  /** CSS class applied to each menu item link */
  itemClassName?: string;
  /** Maximum nesting depth to render (default: unlimited) */
  maxDepth?: number;
  /** Show item descriptions (mega-menu style) */
  showDescriptions?: boolean;
}

/**
 * Main SiteMenu component. The WordPress equivalent of wp_nav_menu().
 *
 * Renders the menu assigned to the given location. Automatically selects
 * the appropriate rendering variant based on the location:
 *
 * - "header": Horizontal nav with dropdown submenus on hover
 * - "footer": Horizontal flat link list
 * - "sidebar": Vertical list with indented sub-items
 * - "mobile": Vertical accordion (typically used in a MobileMenu overlay)
 * - "social": Row of social media icons (detected from URL domain)
 *
 * Usage:
 *   <SiteMenu location="header" />
 *   <SiteMenu location="footer" className="mt-4" />
 *   <SiteMenu location="sidebar" maxDepth={2} />
 *
 * Returns null if no menu is assigned to the location or the menu is empty.
 */
export function SiteMenu({
  location,
  className,
  itemClassName,
  maxDepth,
  showDescriptions = false,
}: SiteMenuProps) {
  const menu = useMenuForLocation(location);

  // Social location uses a specialized component
  if (location === "social") {
    return <SocialLinksMenu className={className} />;
  }

  // No menu assigned or empty
  if (!menu || menu.items.length === 0) return null;

  const visibleItems = menu.items.filter((item) => !item.isOrphaned);
  if (visibleItems.length === 0) return null;

  // Route to the correct rendering variant
  switch (location) {
    case "header":
      return (
        <HeaderMenu
          menu={menu}
          visibleItems={visibleItems}
          className={className}
          itemClassName={itemClassName}
          maxDepth={maxDepth}
        />
      );
    case "footer":
      return (
        <FooterMenu
          menu={menu}
          visibleItems={visibleItems}
          className={className}
          itemClassName={itemClassName}
        />
      );
    case "sidebar":
      return (
        <SidebarMenu
          menu={menu}
          visibleItems={visibleItems}
          className={className}
          itemClassName={itemClassName}
          maxDepth={maxDepth}
          showDescriptions={showDescriptions}
        />
      );
    default:
      // Generic vertical menu for any custom location
      return (
        <nav
          data-slot="site-menu"
          aria-label={menu.name}
          className={className}
        >
          <MenuItemList
            items={visibleItems}
            maxDepth={maxDepth}
            itemClassName={itemClassName}
            showDescriptions={showDescriptions}
            direction="vertical"
          />
        </nav>
      );
  }
}

// ─── Header Menu ────────────────────────────────────────────────────────────

interface HeaderMenuProps {
  menu: ResolvedMenu;
  visibleItems: ResolvedMenuItem[];
  className?: string;
  itemClassName?: string;
  maxDepth?: number;
}

/**
 * Horizontal navigation with dropdown submenus on hover.
 * Hidden on mobile (< lg breakpoint).
 */
function HeaderMenu({
  menu,
  visibleItems,
  className,
  itemClassName,
  maxDepth,
}: HeaderMenuProps) {
  return (
    <nav
      data-slot="site-menu"
      data-location="header"
      aria-label={menu.name}
      className={cn("hidden lg:flex items-center gap-1", className)}
    >
      <ul role="list" className="flex items-center gap-1">
        {visibleItems.map((item) => (
          <HeaderMenuItem
            key={item.id}
            item={item}
            className={itemClassName}
            maxDepth={maxDepth}
          />
        ))}
      </ul>
    </nav>
  );
}

interface HeaderMenuItemProps {
  item: ResolvedMenuItem;
  className?: string;
  maxDepth?: number;
}

function HeaderMenuItem({ item, className, maxDepth }: HeaderMenuItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const closeTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const openTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const hasChildren =
    item.children.length > 0 &&
    (maxDepth === undefined || item.depth < maxDepth);

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
      data-slot="header-menu-item"
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to={item.url}
        className={cn(
          "flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground",
          item.cssClasses,
          className,
        )}
        activeProps={{
          className: "text-foreground font-medium",
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
        <DropdownMenu items={item.children} depth={0} />
      )}
    </li>
  );
}

// ─── Footer Menu ────────────────────────────────────────────────────────────

interface FooterMenuProps {
  menu: ResolvedMenu;
  visibleItems: ResolvedMenuItem[];
  className?: string;
  itemClassName?: string;
}

/**
 * Horizontal flat link list for footer navigation.
 * No dropdowns - renders only top-level items.
 */
function FooterMenu({
  menu,
  visibleItems,
  className,
  itemClassName,
}: FooterMenuProps) {
  return (
    <nav
      data-slot="site-menu"
      data-location="footer"
      aria-label={menu.name}
      className={className}
    >
      <ul
        role="list"
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2"
      >
        {visibleItems.map((item, index) => {
          const linkProps = {
            ...(item.target ? { target: item.target } : {}),
            ...(item.rel ? { rel: item.rel } : {}),
          };

          return (
            <li key={item.id} className="flex items-center gap-4">
              <Link
                to={item.url}
                className={cn(
                  "text-xs text-muted-foreground transition-colors hover:text-foreground",
                  item.cssClasses,
                  itemClassName,
                )}
                {...linkProps}
              >
                {item.label}
              </Link>
              {index < visibleItems.length - 1 && (
                <span className="text-border" aria-hidden="true">
                  |
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─── Sidebar Menu ───────────────────────────────────────────────────────────

interface SidebarMenuProps {
  menu: ResolvedMenu;
  visibleItems: ResolvedMenuItem[];
  className?: string;
  itemClassName?: string;
  maxDepth?: number;
  showDescriptions?: boolean;
}

/**
 * Vertical list with indented sub-items for sidebar widget areas.
 */
function SidebarMenu({
  menu,
  visibleItems,
  className,
  itemClassName,
  maxDepth,
  showDescriptions,
}: SidebarMenuProps) {
  return (
    <nav
      data-slot="site-menu"
      data-location="sidebar"
      aria-label={menu.name}
      className={className}
    >
      <MenuItemList
        items={visibleItems}
        maxDepth={maxDepth}
        itemClassName={itemClassName}
        showDescriptions={showDescriptions}
        direction="vertical"
      />
    </nav>
  );
}
