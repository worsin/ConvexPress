import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/_admin/commerce/products",
)({
	component: CommerceProductsPage,
});

type VariantIntegrity = {
	totals?: Record<string, number>;
};

function CommerceProductsPage() {
	const products = useQuery(api["commerce/products"].list, {}) as
		| Array<{
				_id: Id<"commerce_products">;
				title: string;
				slug: string;
				status: "draft" | "publish" | "private" | "trash";
				productType: "simple" | "variable" | "external";
				sku?: string;
				displayPrice?: number;
				stockQuantity?: number;
				trackInventory?: boolean;
				updatedAt?: number;
				categories?: Array<{ _id: string; name: string }>;
		  }>
		| undefined;
	const variantIntegrity = useQuery(
		api["commerce/migrations"].auditVariantIntegrity,
		{ sampleLimit: 10 },
	) as VariantIntegrity | undefined;
	const repairVariantIntegrity = useMutation(
		api["commerce/migrations"].repairVariantIntegrity,
	);
	const [repairing, setRepairing] = useState(false);

	const statusTone: Record<string, string> = {
		draft: "bg-muted text-muted-foreground",
		publish: "bg-primary/10 text-primary",
		private: "bg-warning/10 text-warning",
		trash: "bg-destructive/10 text-destructive",
	};
	const variantIssueTotal = variantIntegrity?.totals
		? Object.entries(variantIntegrity.totals).reduce(
				(total, [key, value]) =>
					key === "products" || key === "variants" ? total : total + value,
				0,
			)
		: 0;

	async function handlePreviewRepair() {
		setRepairing(true);
		try {
			const result = await repairVariantIntegrity({ dryRun: true });
			toast.success(
				`Dry run: ${result.productsTouched} products touched, ${result.selectionRepairs} selection repairs, ${result.selectionKeyRepairs} key repairs, ${result.defaultVariantRepairs} default repairs.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to preview variant repair",
			);
		} finally {
			setRepairing(false);
		}
	}

	async function handleApplyRepair() {
		if (
			!window.confirm(
				"Apply global variant integrity repair? This writes deterministic product/variant fixes across the catalog.",
			)
		) {
			return;
		}

		setRepairing(true);
		try {
			const result = await repairVariantIntegrity({ dryRun: false });
			toast.success(
				`Repair applied: ${result.productsTouched} products touched, ${result.selectionRepairs} selection repairs, ${result.selectionKeyRepairs} key repairs, ${result.defaultVariantRepairs} default repairs.`,
			);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to apply variant repair",
			);
		} finally {
			setRepairing(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-2">
					<h1 className="text-3xl font-bold tracking-tight">Products</h1>
					<p className="max-w-3xl text-sm text-muted-foreground">
						Live catalog view backed by the new commerce product query. Product
						authoring is now wired into dedicated create and edit screens.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<Link
						to="/commerce/categories"
						className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
					>
						Categories
					</Link>
					<Link
						to="/commerce/products/new"
						className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
					>
						Add Product
					</Link>
				</div>
			</div>

			<section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<h2 className="text-base font-semibold text-foreground">
							Variant integrity operations
						</h2>
						<p className="mt-1 max-w-3xl text-sm text-muted-foreground">
							Global audit and deterministic repair path for operators who
							cannot invoke Convex functions from the CLI.
						</p>
					</div>
					<span
						className={`rounded-full px-3 py-1 text-xs font-medium ${
							variantIntegrity === undefined
								? "bg-muted text-muted-foreground"
								: variantIssueTotal > 0
									? "bg-warning/10 text-warning"
									: "bg-primary/10 text-primary"
						}`}
					>
						{variantIntegrity === undefined
							? "Loading"
							: variantIssueTotal > 0
								? `${variantIssueTotal} issues`
								: "Healthy"}
					</span>
				</div>
				<div className="mt-4 grid gap-3 sm:grid-cols-3">
					<div className="rounded-xl bg-muted/40 p-4">
						<p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
							Products checked
						</p>
						<p className="mt-2 text-2xl font-semibold">
							{variantIntegrity?.totals?.products ?? "—"}
						</p>
					</div>
					<div className="rounded-xl bg-muted/40 p-4">
						<p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
							Variants checked
						</p>
						<p className="mt-2 text-2xl font-semibold">
							{variantIntegrity?.totals?.variants ?? "—"}
						</p>
					</div>
					<div className="rounded-xl bg-muted/40 p-4">
						<p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
							Open issues
						</p>
						<p className="mt-2 text-2xl font-semibold">{variantIssueTotal}</p>
					</div>
				</div>
				<div className="mt-4 flex flex-wrap gap-3">
					<button
						type="button"
						onClick={() => void handlePreviewRepair()}
						disabled={repairing || variantIntegrity === undefined}
						className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Preview repair
					</button>
					<button
						type="button"
						onClick={() => void handleApplyRepair()}
						disabled={
							repairing ||
							variantIntegrity === undefined ||
							variantIssueTotal === 0
						}
						className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Apply global repair
					</button>
				</div>
			</section>

			<div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
				<div className="grid grid-cols-[minmax(0,2fr)_120px_120px_140px] gap-4 border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
					<div>Product</div>
					<div>Status</div>
					<div>Price</div>
					<div>Inventory</div>
				</div>

				{products === undefined ? (
					<div className="space-y-3 p-5">
						{["one", "two", "three", "four"].map((key) => (
							<div
								key={key}
								className="h-16 animate-pulse rounded-xl bg-muted"
							/>
						))}
					</div>
				) : products.length === 0 ? (
					<div className="p-10 text-center">
						<p className="text-sm text-muted-foreground">
							No commerce products exist yet.
						</p>
					</div>
				) : (
					<div className="divide-y divide-border">
						{products.map((product) => (
							<div
								key={product._id}
								className="grid grid-cols-[minmax(0,2fr)_120px_120px_140px] gap-4 px-5 py-4"
							>
								<div className="min-w-0">
									<div className="flex items-center gap-3">
										<Link
											to="/commerce/products/$productId"
											params={{ productId: product._id }}
											className="truncate text-sm font-semibold text-foreground hover:text-primary"
										>
											{product.title}
										</Link>
										{product.productType !== "simple" ? (
											<span
												className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
													product.productType === "variable"
														? "bg-accent/10 text-accent-foreground"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{product.productType === "variable"
													? "Variable"
													: "External"}
											</span>
										) : null}
										{product.sku ? (
											<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
												{product.sku}
											</span>
										) : null}
									</div>
									<p className="mt-1 text-xs text-muted-foreground">
										/products/{product.slug}
									</p>
									{product.categories?.length ? (
										<div className="mt-2 flex flex-wrap gap-2">
											{product.categories.map((category) => (
												<span
													key={category._id}
													className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
												>
													{category.name}
												</span>
											))}
										</div>
									) : null}
								</div>

								<div>
									<span
										className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[product.status] ?? "bg-muted text-foreground"}`}
									>
										{product.status}
									</span>
								</div>

								<div className="text-sm font-medium text-foreground">
									{typeof product.displayPrice === "number"
										? new Intl.NumberFormat("en-US", {
												style: "currency",
												currency: "USD",
											}).format(product.displayPrice / 100)
										: "—"}
								</div>

								<div className="text-sm text-muted-foreground">
									{product.trackInventory === false
										? "Not tracked"
										: (product.stockQuantity ?? "—")}
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<div className="rounded-2xl border border-dashed border-border bg-card/60 p-5">
				<p className="text-sm text-muted-foreground">
					Product creation and editing screens are next. Until those land, the
					storefront catalog can still be exercised with seeded data and direct
					backend mutations.
				</p>
				<div className="mt-3">
					<Link
						to="/admin/commerce"
						className="text-sm font-medium text-primary hover:underline"
					>
						Back to commerce overview
					</Link>
				</div>
			</div>
		</div>
	);
}
