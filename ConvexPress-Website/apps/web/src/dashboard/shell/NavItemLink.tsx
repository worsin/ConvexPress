/**
 * One navigation entry. Handles link / heading / separator kinds, the active
 * state, the resolved icon, and the live badge.
 */

import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";
import { resolveIcon } from "../icons";
import { badgeCountFor, formatBadge, isNavItemActive, type NavItem } from "../nav";

interface NavItemLinkProps {
  item: NavItem;
  badges: Record<string, number> | null;
  /** Icon-only presentation (collapsed sidebar). */
  compact?: boolean;
  /** Horizontal presentation (topbar). */
  inline?: boolean;
  onNavigate?: () => void;
  depth?: number;
}

export function NavItemLink({ item, badges, compact = false, inline = false, onNavigate, depth = 0 }: NavItemLinkProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (item.kind === "separator") {
    return <li role="separator" aria-hidden="true" className={cn("my-2 h-px bg-sidebar-border", inline && "mx-1 h-4 w-px self-center")} />;
  }
  if (item.kind === "heading") {
    if (compact) return <li role="separator" aria-hidden="true" className="my-2 h-px bg-sidebar-border" />;
    return (
      <li className={cn("px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55", inline && "hidden")}>
        {item.label}
      </li>
    );
  }

  const active = isNavItemActive(item, pathname);
  const count = badgeCountFor(item, badges);
  const Icon = resolveIcon(item.icon);
  const badgeLabel = count > 0 ? `${formatBadge(count)} new` : undefined;
  const linkClass = cn(
    "group/nav relative flex items-center gap-3 rounded-none text-[13px] outline-hidden transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar",
    inline
      ? "h-9 px-2.5 text-muted-foreground hover:text-foreground"
      : compact
        ? "h-10 justify-center px-0 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        : "h-9 px-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    active && !inline && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
    active && inline && "font-medium text-foreground",
    depth > 0 && !compact && !inline && "pl-9",
  );
  const body = (
    <>
      {active && !inline && (
        <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 bg-sidebar-primary" />
      )}
      <Icon className={cn("size-4 shrink-0", active ? "text-sidebar-primary" : "opacity-80")} aria-hidden="true" />
      {!compact && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {count > 0 && (
        <span
          aria-label={badgeLabel}
          className={cn(
            "flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground",
            compact && "absolute right-1.5 top-1.5",
          )}
        >
          {formatBadge(count)}
        </span>
      )}
    </>
  );

  const children = item.children.length > 0 && !compact && !inline ? (
    <ul role="list" className="mt-0.5 space-y-0.5">
      {item.children.map((child) => (
        <NavItemLink key={child.id} item={child} badges={badges} onNavigate={onNavigate} depth={depth + 1} />
      ))}
    </ul>
  ) : null;

  return (
    <li>
      {item.external ? (
        <a
          href={item.href}
          target={item.target}
          rel={item.rel ?? (item.target === "_blank" ? "noopener noreferrer" : undefined)}
          className={linkClass}
          title={compact ? item.label : undefined}
          onClick={onNavigate}
        >
          {body}
        </a>
      ) : (
        <Link
          to={item.href}
          className={linkClass}
          title={compact ? item.label : undefined}
          aria-current={active ? "page" : undefined}
          onClick={onNavigate}
        >
          {body}
        </Link>
      )}
      {children}
    </li>
  );
}
