import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavSection } from "@/lib/admin-shell/types";
import { NavItem } from "./NavItem";

interface NavSectionProps {
  section: AdminNavSection;
  collapsed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  isActive: boolean;
}

export function NavSection({
  section,
  collapsed,
  isExpanded,
  onToggle,
  isActive,
}: NavSectionProps) {
  const hasChildren = section.children && section.children.length > 0;
  const Icon = section.icon;

  return (
    <li>
      {/* Separator line */}
      {section.separator && (
        <div className="mx-3 my-2 border-t border-sidebar-border" />
      )}

      {/* Collapsed mode: wrap in hover group for flyout */}
      {collapsed && hasChildren ? (
        <div className="group/flyout relative">
          {/* Icon-only button */}
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              "flex w-full items-center justify-center rounded-sm py-2 text-sm transition-colors",
              "text-sidebar-foreground",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            title={section.label}
          >
            <Icon className="size-4 shrink-0" />
          </button>

          {/* Flyout panel */}
          <div
            className={cn(
              "invisible absolute left-full top-0 z-50 ml-1 min-w-44 rounded-sm border border-sidebar-border bg-sidebar p-1 shadow-md opacity-0 transition-all",
              "group-hover/flyout:visible group-hover/flyout:opacity-100",
            )}
          >
            <div className="px-2 py-1.5 text-xs font-semibold text-sidebar-foreground">
              {section.label}
            </div>
            <ul role="list">
              {section.children!.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  collapsed={false}
                  depth={1}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : collapsed && !hasChildren ? (
        /* Collapsed, no children: icon-only direct link */
        <Link
          to={section.to}
          className={cn(
            "flex items-center justify-center rounded-sm py-2 text-sm transition-colors",
            "text-sidebar-foreground",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            "[&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground",
          )}
          title={section.label}
        >
          <Icon className="size-4 shrink-0" />
          {section.badge !== undefined && section.badge > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex items-center justify-center rounded-full bg-destructive px-1 py-0.5 text-[9px] font-bold leading-none text-destructive-foreground min-w-4">
              {section.badge > 99 ? "99+" : section.badge}
            </span>
          )}
        </Link>
      ) : hasChildren ? (
        /* Expanded mode with children: toggle button + collapsible list */
        <>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls={`section-${section.id}-children`}
            className={cn(
              "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
              "text-sidebar-foreground",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive &&
                !isExpanded &&
                "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{section.label}</span>
            {/* Badge on parent */}
            {section.badge !== undefined && section.badge > 0 && (
              <span className="ml-auto mr-1 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
                {section.badge > 99 ? "99+" : section.badge}
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                section.badge === undefined || section.badge === 0
                  ? "ml-auto"
                  : "",
                isExpanded && "rotate-180",
              )}
            />
          </button>

          {/* Collapsible children list */}
          <ul
            id={`section-${section.id}-children`}
            role="list"
            className={cn(
              "overflow-hidden transition-all duration-200",
              isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            {section.children!.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                collapsed={false}
                depth={1}
              />
            ))}
          </ul>
        </>
      ) : (
        /* Expanded mode, no children: direct link */
        <Link
          to={section.to}
          className={cn(
            "flex items-center gap-2 rounded-sm px-3 py-2 text-sm transition-colors",
            "text-sidebar-foreground",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            "[&.active]:bg-sidebar-primary [&.active]:text-sidebar-primary-foreground",
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{section.label}</span>
          {section.badge !== undefined && section.badge > 0 && (
            <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-medium leading-none text-destructive-foreground">
              {section.badge > 99 ? "99+" : section.badge}
            </span>
          )}
        </Link>
      )}
    </li>
  );
}
