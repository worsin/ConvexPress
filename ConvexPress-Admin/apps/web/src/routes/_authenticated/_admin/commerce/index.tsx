import { api } from "@backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { Package, Repeat, Settings, ShoppingCart, Users } from "lucide-react";

import { usePluginSettings } from "@/hooks/usePluginSettings";

export const Route = createFileRoute("/_authenticated/_admin/commerce/")({
	component: CommerceOverviewPage,
});

type OverviewLink = { label: string; href: string };

/**
 * Commerce home. What it shows follows what the site sells: the catalog and
 * fulfilment with the Storefront on; subscriptions when that extension is on;
 * orders, customers, payments and settings always.
 */
function CommerceOverviewPage() {
	const { isEnabled } = usePluginSettings();
	const storefront = isEnabled("commerceStorefront");
	const subscriptions = isEnabled("commerceSubscriptions");
	const counts = useQuery(api["commerce/products"].counts, storefront ? {} : "skip");

	const stats = [
		...(storefront
			? [
					{ label: "Products", value: counts?.all ?? "…", icon: Package, href: "/commerce/products", description: "Published and draft catalog items" },
					{ label: "Published", value: counts?.published ?? "…", icon: ShoppingCart, href: "/commerce/products", description: "Products currently visible in the storefront" },
					{ label: "Drafts", value: counts?.draft ?? "…", icon: Users, href: "/commerce/products", description: "Products still in preparation" },
				]
			: []),
		...(subscriptions
			? [{ label: "Subscriptions", value: "Billing", icon: Repeat, href: "/commerce/subscriptions", description: "Contracts, invoices, failed payments and plans" }]
			: []),
		{ label: "Store Settings", value: "Core", icon: Settings, href: "/commerce/settings", description: "Checkout, payment and store details" },
	];

	const sections: Array<{ title: string; description: string; links: OverviewLink[] }> = [
		...(storefront
			? [
					{
						title: "Catalog",
						description: "Create and organize sellable catalog records.",
						links: [
							{ label: "Products", href: "/commerce/products" },
							{ label: "Add product", href: "/commerce/products/new" },
							{ label: "Categories", href: "/commerce/categories" },
							{ label: "Attributes", href: "/commerce/attributes" },
						],
					},
				]
			: []),
		...(subscriptions
			? [
					{
						title: "Subscriptions",
						description: "Recurring billing: who pays, what they pay, and what failed.",
						links: [
							{ label: "Contracts", href: "/commerce/subscriptions/contracts" },
							{ label: "Invoices", href: "/commerce/subscriptions/invoices" },
							{ label: "Failed payments", href: "/commerce/subscriptions/dunning" },
							{ label: "Offers", href: "/commerce/subscriptions/offers" },
						],
					},
				]
			: []),
		{
			title: "Operations",
			description: storefront ? "Review money-moving and fulfillment activity." : "Review money-moving activity.",
			links: [
				{ label: "Orders", href: "/commerce/orders" },
				{ label: "Customers", href: "/commerce/customers" },
				{ label: "Payments", href: "/commerce/payments" },
				...(storefront ? [{ label: "Shipping", href: "/commerce/settings/shipping" }] : []),
			],
		},
	];

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">Commerce</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{storefront
						? "Manage products, orders, customers, payments, shipping, and store configuration from live commerce records. Optional add-ons stay behind their plugin guards."
						: "Manage orders, customers, payments and store configuration. The storefront (products, cart and shipping) is turned off for this site."}
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{stats.map((stat) => {
					const Icon = stat.icon;
					return (
						<Link
							key={stat.label}
							to={stat.href}
							className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/20"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="space-y-2">
									<p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
									<p className="text-3xl font-semibold tracking-tight">{stat.value}</p>
								</div>
								<div className="rounded-xl bg-primary/10 p-2 text-primary">
									<Icon className="h-5 w-5" />
								</div>
							</div>
							<p className="mt-4 text-sm text-muted-foreground">{stat.description}</p>
						</Link>
					);
				})}
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				{sections.map((section) => (
					<section key={section.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
						<div>
							<h2 className="text-lg font-semibold">{section.title}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
						</div>
						<div className="mt-5 grid gap-2 sm:grid-cols-2">
							{section.links.map((link) => (
								<Link
									key={link.href}
									to={link.href}
									className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent/20"
								>
									{link.label}
								</Link>
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
