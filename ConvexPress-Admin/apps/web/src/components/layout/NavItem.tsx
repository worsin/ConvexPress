import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavItem } from "@/lib/admin-shell/types";

interface NavItemProps {
  item: AdminNavItem;
  collapsed: boolean;
  depth: number;
}

/** Shared row styling for every sidebar link and section toggle. */
export const NAV_ROW_CLASS =
  "flex items-center gap-2.5 rounded-lg text-[13.5px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

export const NAV_ROW_ACTIVE_CLASS =
  "[&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground [&.active]:shadow-soft [&.active_svg]:text-primary";

export function NavBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary-soft px-1.5 py-px text-[11px] font-semibold leading-[16px] text-primary",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function NavItem({ item, collapsed, depth }: NavItemProps) {
  const isChild = depth > 0;

  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.exact }}
        className={cn(
          NAV_ROW_CLASS,
          NAV_ROW_ACTIVE_CLASS,
          isChild && !collapsed
            ? "h-[30px] pl-[38px] pr-2.5 text-[13px] font-normal"
            : "h-8 px-2.5",
          isChild && !collapsed && "[&.active]:shadow-none [&.active]:bg-sidebar-accent/80 [&.active]:font-medium",
          collapsed && "relative h-8 justify-center px-0",
          item.deprecated && "italic opacity-60",
        )}
        title={
          collapsed
            ? item.label
            : item.deprecated
              ? `${item.label} — deprecated`
              : undefined
        }
      >
        {/* Icon for top-level items */}
        {item.icon && !isChild && <item.icon />}

        {/* Add New icon for child "Add New" items */}
        {item.isAddNew && isChild && !collapsed && (
          <Plus className="-ml-[18px] size-3.5" />
        )}

        {/* Label */}
        {!collapsed && <span className="truncate">{item.label}</span>}

        {/* Deprecated tag */}
        {!collapsed && item.deprecated && (
          <span className="ml-auto inline-flex items-center rounded-sm border border-muted-foreground/30 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            deprecated
          </span>
        )}

        {/* Badge */}
        {item.badge !== undefined && item.badge > 0 && (
          <NavBadge
            count={item.badge}
            className={cn("ml-auto", collapsed && "absolute -right-1 -top-1 ml-0")}
          />
        )}
      </Link>
    </li>
  );
}
