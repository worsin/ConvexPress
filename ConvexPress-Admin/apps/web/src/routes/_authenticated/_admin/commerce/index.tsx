import { api } from "@backend/convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex-helpers/react/cache";
import { Package, Settings, ShoppingCart, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/_admin/commerce/")({
	component: CommerceOverviewPage,
});

function CommerceOverviewPage() {
	const counts = useQuery(api["commerce/products"].counts, {}) as
		| {
				all: number;
				draft: number;
				published: number;
				private: number;
				trash: number;
		  }
		| undefined;

	const stats = [
		{
			label: "Products",
			value: counts?.all ?? "…",
			icon: Package,
			href: "/commerce/products",
			description: "Published and draft catalog items",
		},
		{
			label: "Published",
			value: counts?.published ?? "…",
			icon: ShoppingCart,
			href: "/commerce/products",
			description: "Products currently visible in the storefront",
		},
		{
			label: "Drafts",
			value: counts?.draft ?? "…",
			icon: Users,
			href: "/commerce/products",
			description: "Products still in preparation",
		},
		{
			label: "Store Settings",
			value: "Core",
			icon: Settings,
			href: "/commerce/settings",
			description: "Tax, checkout, payment, and catalog configuration",
		},
	];

	const sections = [
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
		{
			title: "Operations",
			description: "Review money-moving and fulfillment activity.",
			links: [
				{ label: "Orders", href: "/commerce/orders" },
				{ label: "Customers", href: "/commerce/customers" },
				{ label: "Payments", href: "/commerce/payments" },
				{ label: "Shipping", href: "/commerce/settings/shipping" },
			],
		},
	] as const;

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">Commerce</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Manage products, orders, customers, payments, shipping, and store
					configuration from live commerce records. Optional add-ons stay behind
					their plugin guards.
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
									<p className="text-sm font-medium text-muted-foreground">
										{stat.label}
									</p>
									<p className="text-3xl font-semibold tracking-tight">
										{stat.value}
									</p>
								</div>
								<div className="rounded-xl bg-primary/10 p-2 text-primary">
									<Icon className="h-5 w-5" />
								</div>
							</div>
							<p className="mt-4 text-sm text-muted-foreground">
								{stat.description}
							</p>
						</Link>
					);
				})}
			</div>

			<div className="grid gap-4 lg:grid-cols-2">
				{sections.map((section) => (
					<section
						key={section.title}
						className="rounded-2xl border border-border bg-card p-6 shadow-sm"
					>
						<div>
							<h2 className="text-lg font-semibold">{section.title}</h2>
							<p className="mt-2 text-sm leading-6 text-muted-foreground">
								{section.description}
							</p>
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
