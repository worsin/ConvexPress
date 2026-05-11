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
			href: "/admin/commerce/products",
			description: "Published and draft catalog items",
		},
		{
			label: "Published",
			value: counts?.published ?? "…",
			icon: ShoppingCart,
			href: "/admin/commerce/products",
			description: "Products currently visible in the storefront",
		},
		{
			label: "Drafts",
			value: counts?.draft ?? "…",
			icon: Users,
			href: "/admin/commerce/products",
			description: "Products still in preparation",
		},
		{
			label: "Store Settings",
			value: "Core",
			icon: Settings,
			href: "/admin/commerce/settings",
			description: "Tax, checkout, payment, and catalog configuration",
		},
	];

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">Commerce</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Manage your store — products, orders, customers, payments, shipping,
					subscriptions, and more. All commerce features are fully operational.
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
				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<h2 className="text-lg font-semibold">Wave 1 focus</h2>
					<p className="mt-2 text-sm leading-6 text-muted-foreground">
						This slice establishes the WooCommerce-style core: products,
						storefront catalog, cart, checkout sessions, orders, and customer
						records. The next implementation passes will add authoring forms and
						convert the remaining route shells to live runtime views.
					</p>
				</section>

				<section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
					<h2 className="text-lg font-semibold">Immediate next steps</h2>
					<ul className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
						<li>Finalize admin product authoring and category management.</li>
						<li>
							Attach cart and checkout pages to the new backend session APIs.
						</li>
						<li>Expose order history and customer profile views.</li>
					</ul>
				</section>
			</div>
		</div>
	);
}
