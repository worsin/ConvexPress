import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { api } from "@backend/convex/_generated/api";
import { ProductListTable } from "@/components/commerce/ProductListTable";

const productSearchSchema = z.object({
	status: z.enum(["draft", "publish", "private", "trash"]).optional(),
	search: z.string().optional(),
	productType: z.enum(["simple", "variable", "external", "grouped"]).optional(),
	orderBy: z.enum(["title", "sku", "status", "date", "created"]).optional(),
	orderDir: z.enum(["asc", "desc"]).optional(),
	page: z.number().min(1).optional(),
	perPage: z.number().min(1).max(100).optional(),
});

export const Route = createFileRoute("/_authenticated/_admin/commerce/products")({
	validateSearch: productSearchSchema,
	component: CommerceProductsPage,
});

type VariantIntegrity = {
	totals?: Record<string, number>;
};

function CommerceProductsPage() {
	const variantIntegrity = useQuery(
		api["commerce/migrations"].auditVariantIntegrity,
		{ sampleLimit: 10 },
	) as VariantIntegrity | undefined;

	const repairVariantIntegrity = useMutation(
		api["commerce/migrations"].repairVariantIntegrity,
	);
	const [repairing, setRepairing] = useState(false);

	const variantIssueTotal = variantIntegrity?.totals
		? Object.entries(variantIntegrity.totals).reduce(
				(total, [key, value]) =>
					key === "products" || key === "variants" ? total : total + (value ?? 0),
				0,
			)
		: 0;

	async function handleApplyRepair() {
		setRepairing(true);
		try {
			const result = await repairVariantIntegrity({ dryRun: false });
			toast.success(`Repair complete: ${JSON.stringify(result)}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Repair failed.");
		} finally {
			setRepairing(false);
		}
	}

	return (
		<div className="space-y-6">
			<ProductListTable />

			{/* Variant integrity widget — kept compact below the list. */}
			{variantIntegrity !== undefined && variantIssueTotal > 0 && (
				<section className="rounded-2xl border border-warning/40 bg-warning/5 p-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								Variant integrity: {variantIssueTotal} issues found
							</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								{variantIntegrity.totals?.products ?? 0} products /{" "}
								{variantIntegrity.totals?.variants ?? 0} variants checked. Open a
								specific product to see scope-specific reference issues.
							</p>
						</div>
						<button
							type="button"
							onClick={() => void handleApplyRepair()}
							disabled={repairing}
							className="rounded-full bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{repairing ? "Repairing…" : "Apply Repair"}
						</button>
					</div>
				</section>
			)}
		</div>
	);
}
