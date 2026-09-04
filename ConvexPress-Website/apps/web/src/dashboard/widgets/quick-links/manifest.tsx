/**
 * Quick links: shortcuts from the resolved sidebar (menu or registry), so
 * they always match what the admin exposed. `limit` is a widget setting.
 */

import { Link } from "@tanstack/react-router";

import type { DashboardWidgetModule, DashboardWidgetProps } from "../../contracts";
import { resolveIcon } from "../../icons";
import { badgeCountFor, flattenNavLinks, formatBadge } from "../../nav";
import { useDashboardShell } from "../../shell/DashboardShellContext";

function QuickLinksWidget({ settings, size }: DashboardWidgetProps) {
  const { sidebarNav, badges } = useDashboardShell();
  const limit = Math.max(3, Math.min(12, Number(settings.limit) || 6));
  const links = flattenNavLinks(sidebarNav).filter((item) => !item.exact).slice(0, limit);
  const columns = size === "sm" ? "grid-cols-2" : size === "lg" ? "grid-cols-4" : "grid-cols-3";

  if (links.length === 0) {
    return <p className="text-xs text-muted-foreground">No pages to link to yet.</p>;
  }

  return (
    <ul role="list" className={`grid gap-2 ${columns}`}>
      {links.map((link) => {
        const Icon = resolveIcon(link.icon);
        const count = badgeCountFor(link, badges);
        const className =
          "relative flex h-full flex-col items-center justify-center gap-1.5 border border-border p-3 text-center text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";
        const body = (
          <>
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="line-clamp-1">{link.label}</span>
            {count > 0 && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {formatBadge(count)}
              </span>
            )}
          </>
        );
        return (
          <li key={link.id}>
            {link.external ? (
              <a href={link.href} target={link.target} rel={link.rel} className={className}>
                {body}
              </a>
            ) : (
              <Link to={link.href} className={className}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const module: DashboardWidgetModule = {
  id: "quick-links",
  Widget: QuickLinksWidget,
};

export default module;
