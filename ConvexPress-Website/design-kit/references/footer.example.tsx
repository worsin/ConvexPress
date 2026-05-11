/**
 * REFERENCE — Site Footer (chrome, not a route)
 *
 * Read by `design:footer`. Not part of the production build.
 *
 * The footer is rendered inside the marketing layout at
 * `apps/web/src/routes/_marketing.tsx`. This reference shows the shape.
 *
 * What this reference demonstrates:
 *   1. Logo + tagline from settings
 *   2. Column-based link layout from menu locations
 *      ("footer-primary", "footer-secondary", "footer-tertiary")
 *   3. Newsletter signup form
 *   4. Legal / copyright row
 *   5. Social icons (read socials from settings)
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { cn } from "@/lib/utils";

export function SiteFooter() {
	const identity = useQuery(api.settings.queries.getBySection, { section: "general" });
	const colA = useQuery(api.menus.queries.getMenuForLocation, { location: "footer-primary" });
	const colB = useQuery(api.menus.queries.getMenuForLocation, { location: "footer-secondary" });
	const colC = useQuery(api.menus.queries.getMenuForLocation, { location: "footer-tertiary" });

	const year = new Date().getFullYear();

	return (
		<footer className={cn("border-t border-border bg-card text-card-foreground")}>
			<div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-5">
				{/* Brand block */}
				<div className="flex flex-col gap-3 lg:col-span-2">
					<Link to="/" className="flex items-center gap-2 font-semibold">
						{identity?.logoUrl ? (
							<img
								src={identity.logoUrl}
								alt={`${identity.name ?? "Site"} logo`}
								width={28}
								height={28}
								className="size-7 rounded"
							/>
						) : null}
						<span className="text-sm tracking-tight">{identity?.name ?? "Site"}</span>
					</Link>
					{identity?.tagline ? (
						<p className="text-sm text-muted-foreground">{identity.tagline}</p>
					) : null}

					{/* Newsletter (optional, brand permitting) */}
					<form className="mt-2 flex max-w-sm gap-2">
						<input
							type="email"
							required
							placeholder="you@example.com"
							className={cn(
								"min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
							)}
						/>
						<button
							type="submit"
							className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Subscribe
						</button>
					</form>
				</div>

				{/* Column A */}
				<FooterColumn title="Browse" items={colA?.items ?? []} />
				{/* Column B */}
				<FooterColumn title="Company" items={colB?.items ?? []} />
				{/* Column C */}
				<FooterColumn title="More" items={colC?.items ?? []} />
			</div>

			{/* Legal row */}
			<div className="border-t border-border">
				<div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row">
					<p>© {year} {identity?.name ?? "Site"}. All rights reserved.</p>
					<nav className="flex gap-4">
						<Link to="/page/privacy" className="hover:text-foreground">Privacy</Link>
						<Link to="/page/terms" className="hover:text-foreground">Terms</Link>
					</nav>
				</div>
			</div>
		</footer>
	);
}

function FooterColumn({ title, items }: { title: string; items: any[] }) {
	return (
		<div>
			<h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</h2>
			<ul className="flex flex-col gap-1.5 text-sm">
				{items.map((item) => (
					<li key={item.id}>
						<Link to={item.url} className="text-card-foreground hover:underline">
							{item.label}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
