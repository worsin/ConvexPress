import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminNavSection } from "@/lib/admin-shell/types";
import { NAV_ROW_ACTIVE_CLASS, NAV_ROW_CLASS, NavBadge, NavItem } from "./NavItem";

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
        <div className="mx-2.5 my-2 border-t border-sidebar-border" />
      )}

      {/* Collapsed mode: wrap in hover group for flyout */}
      {collapsed && hasChildren ? (
        <div className="group/flyout relative">
          {/* Icon-only button */}
          <button
            type="button"
            onClick={onToggle}
            className={cn(
              NAV_ROW_CLASS,
              "h-8 w-full justify-center px-0",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft [&_svg]:text-primary",
            )}
            title={section.label}
          >
            <Icon />
          </button>

          {/* Flyout panel */}
          <div
            className={cn(
              "invisible absolute left-full top-0 z-50 ml-2 min-w-48 rounded-xl border border-line-strong bg-popover p-1.5 opacity-0 shadow-float transition-all",
              "group-hover/flyout:visible group-hover/flyout:opacity-100",
            )}
          >
            <div className="px-2.5 py-1.5 text-[12px] font-semibold text-foreground">
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
          className={cn(NAV_ROW_CLASS, NAV_ROW_ACTIVE_CLASS, "relative h-8 justify-center px-0")}
          title={section.label}
        >
          <Icon />
          {section.badge !== undefined && section.badge > 0 && (
            <NavBadge count={section.badge} className="absolute -right-1 -top-1" />
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
              NAV_ROW_CLASS,
              "h-8 w-full px-2.5",
              isActive &&
                !isExpanded &&
                "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft [&_svg]:text-primary",
              isActive && isExpanded && "text-sidebar-accent-foreground [&>svg:first-child]:text-primary",
            )}
          >
            <Icon />
            <span className="truncate">{section.label}</span>
            {/* Badge on parent */}
            {section.badge !== undefined && section.badge > 0 && (
              <NavBadge count={section.badge} className="ml-auto" />
            )}
            <ChevronDown
              className={cn(
                "size-3.5! transition-transform duration-200",
                section.badge === undefined || section.badge === 0 ? "ml-auto" : "",
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
              isExpanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0",
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
          className={cn(NAV_ROW_CLASS, NAV_ROW_ACTIVE_CLASS, "h-8 px-2.5")}
        >
          <Icon />
          <span className="truncate">{section.label}</span>
          {section.badge !== undefined && section.badge > 0 && (
            <NavBadge count={section.badge} className="ml-auto" />
          )}
        </Link>
      )}
    </li>
  );
}
