import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavItem } from "@/lib/admin-shell/types";

interface NavItemProps {
  item: AdminNavItem;
  collapsed: boolean;
  depth: number;
}

export function NavItem({ item, collapsed, depth }: NavItemProps) {
  const isChild = depth > 0;

  return (
    <li>
      <Link
        to={item.to}
        activeOptions={{ exact: item.exact }}
        className={cn(
          "flex items-center gap-2 rounded-sm text-sm transition-colors",
          "text-sidebar-foreground",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "[&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground",
          isChild && !collapsed ? "py-1.5 pl-9 pr-3" : "px-3 py-2",
          collapsed && "justify-center px-0 py-2",
        )}
        title={collapsed ? item.label : undefined}
      >
        {/* Icon for top-level items */}
        {item.icon && !isChild && (
          <item.icon className="size-4 shrink-0" />
        )}

        {/* Add New icon for child "Add New" items */}
        {item.isAddNew && isChild && !collapsed && (
          <Plus className="size-3.5 shrink-0" />
        )}

        {/* Label */}
        {!collapsed && (
          <span className="truncate">{item.label}</span>
        )}

        {/* Badge */}
        {item.badge !== undefined && item.badge > 0 && (
          <span
            className={cn(
              "ml-auto inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground",
              collapsed && "absolute -right-1 -top-1 ml-0",
            )}
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        )}
      </Link>
    </li>
  );
}
