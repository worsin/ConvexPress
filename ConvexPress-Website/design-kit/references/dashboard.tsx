/**
 * REFERENCE — Customer dashboard shell (chrome, not a route)
 *
 * Read by `design:dashboard`. Not part of the production build.
 *
 * The real implementation lives in apps/web/src/dashboard/ (DashboardShell.tsx,
 * shell/*, grid/*, WidgetGrid.tsx). This file shows the *shape* a restyle must
 * keep: config-driven surfaces, menu-first navigation with a registry fallback,
 * shared context for widgets, and brand tokens only.
 *
 * What this reference demonstrates:
 *   1. dashboardConfig drives layout, menu locations, toggles, brand, footer
 *   2. Navigation = menu(location) ?? registryToNav(registry.pages)
 *   3. Badges from one subscription (myBadges), keyed by item.badge
 *   4. Hrefs always built from the base path (useDashboardPath)
 *   5. Widgets render inside the shell's card chrome; grid geometry from the server
 *   6. Disabled plugin → compact account frame with the same page modules
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Menu, Search } from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { WebsiteNotificationBell } from "@/components/layout/WebsiteNotificationBell";
import { useDashboardConfig, useDashboardPath } from "@/hooks/useDashboardConfig";
import { useCanFn } from "@/hooks/useCan";
import { resolveIcon } from "@/dashboard/icons";
import { badgeCountFor, formatBadge, menuToNav, registryToNav, type NavItem } from "@/dashboard/nav";
import { cn } from "@/lib/utils";

export function DashboardShellReference({ children }: { children: React.ReactNode }) {
	// 1. Config (defaults merged) and the base-path href builder.
	const { config } = useDashboardConfig();
	const { basePath, to } = useDashboardPath();

	// 2. Data: registry + badges are shared; menus only for the surfaces the layout renders.
	const registry = useQuery(api.extensions.dashboard.queries.registry, {});
	const badges = useQuery(api.extensions.dashboard.queries.myBadges, {}) as Record<string, number> | undefined;
	const sidebarMenu = useQuery(
		api.menus.queries.getMenuForLocation,
		config.sidebarLocation ? { locationSlug: config.sidebarLocation } : "skip",
	);
	const can = useCanFn();

	// 3. Menu first, registry fallback (grouped, capability-gated).
	const sidebarNav: NavItem[] = sidebarMenu?.items?.length
		? menuToNav(sidebarMenu.items, basePath)
		: registryToNav(registry?.pages ?? [], { basePath, can, withHeadings: true });

	const hasSidebar = config.layout !== "topbar";

	return (
		<div className="flex min-h-svh bg-background text-foreground" style={{ "--dashboard-sidebar-width": `${config.sidebarWidth}px` } as React.CSSProperties}>
			{hasSidebar && (
				<aside className="sticky top-0 hidden h-svh w-(--dashboard-sidebar-width) flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
					<div className="flex h-14 items-center px-4">
						{/* brandMark: site | custom | none — never a hardcoded logo */}
						<Link to={to("")} className="text-sm font-semibold">Site</Link>
					</div>
					<nav aria-label="Dashboard" className="flex-1 overflow-y-auto py-3">
						<ul role="list" className="space-y-0.5 px-2">
							{sidebarNav.map((item) => {
								if (item.kind === "separator") return <li key={item.id} role="separator" className="my-2 h-px bg-sidebar-border" />;
								if (item.kind === "heading") return <li key={item.id} className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/55">{item.label}</li>;
								const Icon = resolveIcon(item.icon);
								const count = badgeCountFor(item, badges ?? null);
								return (
									<li key={item.id}>
										<Link to={item.href} className={cn("flex h-9 items-center gap-3 px-3 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")} activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" }}>
											<Icon className="size-4" aria-hidden="true" />
											<span className="flex-1 truncate">{item.label}</span>
											{count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{formatBadge(count)}</span>}
										</Link>
									</li>
								);
							})}
						</ul>
					</nav>
				</aside>
			)}
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
					<button type="button" aria-label="Open navigation" className="size-9 md:hidden"><Menu className="size-5" aria-hidden="true" /></button>
					<div className="ml-auto flex items-center gap-1">
						{config.showSearch && <button type="button" aria-label="Search" className="size-9"><Search className="size-4" aria-hidden="true" /></button>}
						{config.showNotificationBell && <WebsiteNotificationBell />}
						{config.showThemeToggle && <ThemeToggle />}
						{/* profile dropdown: menu(profileLocation) ?? Profile / Settings / Sign out */}
					</div>
				</header>
				<main id="main-content" role="main" className="flex-1 px-4 py-6 md:px-8">
					<div className="mx-auto w-full max-w-7xl">{children}</div>
				</main>
				{/* footerVariant: minimal | full | none → <SiteFooter variant /> or nothing */}
			</div>
		</div>
	);
}
