import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import type { ResolvedMenuItem } from "@/lib/layout/types";

interface MenuItemProps {
  /** The resolved menu item data */
  item: ResolvedMenuItem;
  /** Additional CSS class for the link element */
  className?: string;
  /** Callback when the link is clicked (useful for mobile menu close) */
  onClick?: () => void;
}

/**
 * A single menu item link. Renders an internal TanStack Link for relative paths
 * or an anchor tag for external URLs.
 *
 * Supports:
 * - Active state detection via TanStack Router's activeProps
 * - Custom CSS classes from admin configuration
 * - Link target and rel attributes
 * - aria-current="page" for current page items
 */
export function MenuItem({ item, className, onClick }: MenuItemProps) {
  if (item.isOrphaned) return null;

  const isExternal =
    item.url.startsWith("http://") || item.url.startsWith("https://");

  const linkProps = {
    ...(item.target ? { target: item.target } : {}),
    ...(item.rel ? { rel: item.rel } : {}),
  };

  if (isExternal) {
    return (
      <a
        href={item.url}
        className={cn(
          "text-xs text-muted-foreground transition-colors hover:text-foreground",
          item.cssClasses,
          className,
        )}
        onClick={onClick}
        {...linkProps}
      >
        {item.label}
      </a>
    );
  }

  return (
    <Link
      to={item.url}
      className={cn(
        "text-xs text-muted-foreground transition-colors hover:text-foreground",
        item.cssClasses,
        className,
      )}
      activeProps={{
        className: "text-foreground font-medium",
        "aria-current": "page",
      }}
      onClick={onClick}
      {...linkProps}
    >
      {item.label}
    </Link>
  );
}
