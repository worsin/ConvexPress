/**
 * REFERENCE — Site Header (chrome, not a route)
 *
 * Read by `design:header`. Not part of the production build.
 *
 * The header is rendered inside the marketing layout at
 * `apps/web/src/routes/_marketing.tsx`. This reference shows the shape
 * the header component should take and how to wire it up.
 *
 * What this reference demonstrates:
 *   1. Logo + brand name from settings
 *   2. Primary nav from the menus system (location: "primary")
 *   3. Search affordance (link to /search, with optional inline input)
 *   4. Cart icon with live count (commerce system)
 *   5. Sign-in / user dropdown via Clerk
 *   6. Sticky header behavior + scroll shadow
 *   7. Mobile hamburger drawer via Base UI Dialog
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Search as SearchIcon, ShoppingCart, Menu } from "lucide-react";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";

import { cn } from "@/lib/utils";

export function SiteHeader() {
	const identity = useQuery(api.settings.queries.getSiteIdentity);
	const primaryMenu = useQuery(api.menus.queries.getByLocation, { location: "primary" });

	return (
		<header
			className={cn(
				"sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur",
				"supports-[backdrop-filter]:bg-background/60",
			)}
		>
			<div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4">
				{/* Logo / brand */}
				<Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
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

				{/* Primary nav (hidden on mobile, becomes hamburger) */}
				<nav aria-label="Primary" className="ml-2 hidden gap-1 md:flex">
					{(primaryMenu?.items ?? []).map((item: any) => (
						<Link
							key={item.id}
							to={item.url}
							className={cn(
								"rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors",
								"hover:bg-muted hover:text-foreground",
								"[&.active]:text-foreground",
							)}
						>
							{item.label}
						</Link>
					))}
				</nav>

				{/* Right side */}
				<div className="ml-auto flex items-center gap-1">
					<Link
						to="/search"
						aria-label="Search"
						className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<SearchIcon className="size-4" />
					</Link>

					<Link
						to="/cart"
						aria-label="Cart"
						className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						<ShoppingCart className="size-4" />
						{/* Cart count badge — wire via api.cart.queries.getCount */}
					</Link>

					<SignedOut>
						<Link
							to="/login"
							className="ml-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted"
						>
							Sign in
						</Link>
					</SignedOut>
					<SignedIn>
						<UserButton afterSignOutUrl="/" />
					</SignedIn>

					{/* Mobile menu trigger — real implementation uses Base UI Dialog
					    for the drawer, populated with the same primaryMenu items. */}
					<button
						type="button"
						aria-label="Open menu"
						className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
					>
						<Menu className="size-4" />
					</button>
				</div>
			</div>
		</header>
	);
}
