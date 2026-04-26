import { api } from "@backend/convex/_generated/api";
import type { Doc } from "@backend/convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/_admin/commerce/discounts",
)({
	component: CommerceDiscountsPage,
});

type DiscountType = "fixed_cart" | "percent" | "fixed_product";
type DiscountRecord = Doc<"commerce_discount_codes">;

type TierDraft = {
	label: string;
	minQuantity: string;
	minSubtotal: string;
	discountType: DiscountType;
	amount: string;
};

const emptyTier = (): TierDraft => ({
	label: "",
	minQuantity: "",
	minSubtotal: "",
	discountType: "percent",
	amount: "",
});

function centsToDisplay(amount: number) {
	return (amount / 100).toFixed(2);
}

function displayToCents(value: string) {
	return Math.round(Number.parseFloat(value || "0") * 100);
}

function parseOptionalCents(value: string) {
	return value.trim() ? displayToCents(value) : null;
}

function parseOptionalNumber(value: string) {
	return value.trim() ? Number(value) : null;
}

function parseOptionalDate(value: string) {
	return value.trim() ? new Date(value).getTime() : null;
}

function parseIdList(value: string) {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function storedAmount(discountType: DiscountType, value: string) {
	return discountType === "percent"
		? Number(value || "0")
		: displayToCents(value);
}

function formatAmount(discountType: DiscountType, amount: number) {
	return discountType === "percent"
		? `${amount}%`
		: `$${centsToDisplay(amount)}`;
}

function tierPayload(tiers: TierDraft[]) {
	return tiers
		.filter(
			(tier) =>
				tier.amount.trim() &&
				(tier.minQuantity.trim() || tier.minSubtotal.trim()),
		)
		.map((tier) => ({
			label: tier.label.trim() || undefined,
			minQuantity: tier.minQuantity.trim()
				? Number(tier.minQuantity)
				: undefined,
			minSubtotalAmount: tier.minSubtotal.trim()
				? displayToCents(tier.minSubtotal)
				: undefined,
			discountType: tier.discountType,
			amount: storedAmount(tier.discountType, tier.amount),
		}));
}

function idSummary(values?: Array<{ toString(): string }> | string[]) {
	if (!values?.length) return null;
	return `${values.length} selected`;
}

function CommerceDiscountsPage() {
	const discounts = useQuery(api["commerce/discounts"].list, {}) as
		| DiscountRecord[]
		| undefined;
	const createDiscount = useMutation(api["commerce/discounts"].create);
	const updateDiscount = useMutation(api["commerce/discounts"].update);
	const removeDiscount = useMutation(api["commerce/discounts"].remove);

	const [code, setCode] = useState("");
	const [description, setDescription] = useState("");
	const [discountType, setDiscountType] = useState<DiscountType>("fixed_cart");
	const [amount, setAmount] = useState("");
	const [minimumSubtotal, setMinimumSubtotal] = useState("");
	const [minimumQuantity, setMinimumQuantity] = useState("");
	const [maxDiscount, setMaxDiscount] = useState("");
	const [usageLimit, setUsageLimit] = useState("");
	const [startsAt, setStartsAt] = useState("");
	const [endsAt, setEndsAt] = useState("");
	const [applicability, setApplicability] = useState<"cart" | "matching_items">(
		"matching_items",
	);
	const [productIds, setProductIds] = useState("");
	const [categoryIds, setCategoryIds] = useState("");
	const [excludedProductIds, setExcludedProductIds] = useState("");
	const [excludedCategoryIds, setExcludedCategoryIds] = useState("");
	const [tiers, setTiers] = useState<TierDraft[]>([]);

	const activeCount = useMemo(
		() =>
			discounts?.filter((discount) => discount.status === "active").length ?? 0,
		[discounts],
	);

	function resetForm() {
		setCode("");
		setDescription("");
		setDiscountType("fixed_cart");
		setAmount("");
		setMinimumSubtotal("");
		setMinimumQuantity("");
		setMaxDiscount("");
		setUsageLimit("");
		setStartsAt("");
		setEndsAt("");
		setApplicability("matching_items");
		setProductIds("");
		setCategoryIds("");
		setExcludedProductIds("");
		setExcludedCategoryIds("");
		setTiers([]);
	}

	async function handleCreate() {
		try {
			const parsedTiers = tierPayload(tiers);
			await createDiscount({
				code,
				description: description || undefined,
				discountType,
				amount: storedAmount(discountType, amount),
				minimumSubtotalAmount: parseOptionalCents(minimumSubtotal),
				minimumQuantity: parseOptionalNumber(minimumQuantity),
				maxDiscountAmount: parseOptionalCents(maxDiscount),
				usageLimit: parseOptionalNumber(usageLimit),
				startsAt: parseOptionalDate(startsAt),
				endsAt: parseOptionalDate(endsAt),
				applicability,
				productIds: parseIdList(productIds),
				categoryIds: parseIdList(categoryIds),
				excludedProductIds: parseIdList(excludedProductIds),
				excludedCategoryIds: parseIdList(excludedCategoryIds),
				tiers: parsedTiers,
			});
			resetForm();
			toast.success("Discount code created");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					"Failed to create discount code",
			);
		}
	}

	async function handleToggle(discount: DiscountRecord) {
		try {
			await updateDiscount({
				discountId: discount._id,
				status: discount.status === "active" ? "inactive" : "active",
			});
			toast.success("Discount updated");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					"Failed to update discount code",
			);
		}
	}

	async function handleRemove(discount: DiscountRecord) {
		try {
			await removeDiscount({ discountId: discount._id });
			toast.success("Discount removed");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					"Failed to remove discount code",
			);
		}
	}

	function updateTier(index: number, patch: Partial<TierDraft>) {
		setTiers((current) =>
			current.map((tier, tierIndex) =>
				tierIndex === index ? { ...tier, ...patch } : tier,
			),
		);
	}

	return (
		<div className="space-y-8">
			<div className="space-y-3">
				<h1 className="text-3xl font-bold tracking-tight">Discounts</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Build cart, product, category, threshold, and tiered bulk discount
					codes.
				</p>
			</div>

			<div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
				<section className="rounded-lg border border-border bg-card p-6 shadow-sm">
					<h2 className="text-lg font-semibold">New Discount Code</h2>
					<div className="mt-4 grid gap-4">
						<div className="grid gap-3 md:grid-cols-2">
							<input
								value={code}
								onChange={(event) => setCode(event.target.value.toUpperCase())}
								placeholder="BULK25"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<input
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Bulk order promotion"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
						</div>

						<div className="grid gap-3 md:grid-cols-3">
							<select
								value={discountType}
								onChange={(event) =>
									setDiscountType(event.target.value as DiscountType)
								}
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							>
								<option value="fixed_cart">Fixed cart amount</option>
								<option value="percent">Percentage</option>
								<option value="fixed_product">Fixed per-item amount</option>
							</select>
							<input
								value={amount}
								onChange={(event) => setAmount(event.target.value)}
								placeholder={discountType === "percent" ? "15" : "10.00"}
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<select
								value={applicability}
								onChange={(event) =>
									setApplicability(
										event.target.value as "cart" | "matching_items",
									)
								}
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							>
								<option value="matching_items">Apply to matching items</option>
								<option value="cart">Apply to cart</option>
							</select>
						</div>

						<div className="grid gap-3 md:grid-cols-3">
							<input
								value={minimumSubtotal}
								onChange={(event) => setMinimumSubtotal(event.target.value)}
								placeholder="Minimum subtotal"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<input
								value={minimumQuantity}
								onChange={(event) => setMinimumQuantity(event.target.value)}
								placeholder="Minimum quantity"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<input
								value={maxDiscount}
								onChange={(event) => setMaxDiscount(event.target.value)}
								placeholder="Maximum discount"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
						</div>

						<div className="grid gap-3 md:grid-cols-3">
							<input
								value={usageLimit}
								onChange={(event) => setUsageLimit(event.target.value)}
								placeholder="Usage limit"
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<input
								type="datetime-local"
								value={startsAt}
								onChange={(event) => setStartsAt(event.target.value)}
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<input
								type="datetime-local"
								value={endsAt}
								onChange={(event) => setEndsAt(event.target.value)}
								className="rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
						</div>

						<div className="grid gap-3 md:grid-cols-2">
							<textarea
								value={productIds}
								onChange={(event) => setProductIds(event.target.value)}
								placeholder="Product IDs to include"
								className="min-h-20 rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<textarea
								value={categoryIds}
								onChange={(event) => setCategoryIds(event.target.value)}
								placeholder="Category IDs to include"
								className="min-h-20 rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<textarea
								value={excludedProductIds}
								onChange={(event) => setExcludedProductIds(event.target.value)}
								placeholder="Product IDs to exclude"
								className="min-h-20 rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
							<textarea
								value={excludedCategoryIds}
								onChange={(event) => setExcludedCategoryIds(event.target.value)}
								placeholder="Category IDs to exclude"
								className="min-h-20 rounded-md border border-border bg-background px-4 py-3 text-sm"
							/>
						</div>

						<div className="space-y-3 rounded-lg border border-border p-4">
							<div className="flex items-center justify-between gap-3">
								<h3 className="text-sm font-semibold">Bulk Tiers</h3>
								<button
									type="button"
									onClick={() =>
										setTiers((current) => [...current, emptyTier()])
									}
									className="rounded-md border border-border px-3 py-2 text-sm font-medium"
								>
									Add tier
								</button>
							</div>

							{tiers.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No tiers. The base amount applies when thresholds match.
								</p>
							) : (
								tiers.map((tier, index) => (
									<div
										key={index}
										className="grid gap-3 rounded-md bg-muted/40 p-3"
									>
										<div className="grid gap-3 md:grid-cols-[1fr_0.8fr_0.8fr]">
											<input
												value={tier.label}
												onChange={(event) =>
													updateTier(index, { label: event.target.value })
												}
												placeholder="Tier label"
												className="rounded-md border border-border bg-background px-3 py-2 text-sm"
											/>
											<input
												value={tier.minQuantity}
												onChange={(event) =>
													updateTier(index, { minQuantity: event.target.value })
												}
												placeholder="Min quantity"
												className="rounded-md border border-border bg-background px-3 py-2 text-sm"
											/>
											<input
												value={tier.minSubtotal}
												onChange={(event) =>
													updateTier(index, { minSubtotal: event.target.value })
												}
												placeholder="Min subtotal"
												className="rounded-md border border-border bg-background px-3 py-2 text-sm"
											/>
										</div>
										<div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
											<select
												value={tier.discountType}
												onChange={(event) =>
													updateTier(index, {
														discountType: event.target.value as DiscountType,
													})
												}
												className="rounded-md border border-border bg-background px-3 py-2 text-sm"
											>
												<option value="fixed_cart">Fixed cart amount</option>
												<option value="percent">Percentage</option>
												<option value="fixed_product">
													Fixed per-item amount
												</option>
											</select>
											<input
												value={tier.amount}
												onChange={(event) =>
													updateTier(index, { amount: event.target.value })
												}
												placeholder={
													tier.discountType === "percent" ? "10" : "5.00"
												}
												className="rounded-md border border-border bg-background px-3 py-2 text-sm"
											/>
											<button
												type="button"
												onClick={() =>
													setTiers((current) =>
														current.filter(
															(_, tierIndex) => tierIndex !== index,
														),
													)
												}
												className="rounded-md border border-border px-3 py-2 text-sm font-medium"
											>
												Remove
											</button>
										</div>
									</div>
								))
							)}
						</div>

						<button
							type="button"
							onClick={() => void handleCreate()}
							className="inline-flex justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
						>
							Create discount
						</button>
					</div>
				</section>

				<section className="rounded-lg border border-border bg-card p-6 shadow-sm">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h2 className="text-lg font-semibold">Codes</h2>
							<p className="text-sm text-muted-foreground">
								{activeCount} active code{activeCount === 1 ? "" : "s"}
							</p>
						</div>
					</div>

					<div className="mt-6 space-y-3">
						{discounts === undefined ? (
							Array.from({ length: 4 }).map((_, index) => (
								<div
									key={index}
									className="h-24 animate-pulse rounded-md bg-muted"
								/>
							))
						) : discounts.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No discount codes created yet.
							</p>
						) : (
							discounts.map((discount) => (
								<div
									key={discount._id}
									className="rounded-lg border border-border px-4 py-4 text-sm"
								>
									<div className="flex items-start justify-between gap-4">
										<div>
											<p className="font-semibold text-foreground">
												{discount.code}
											</p>
											<p className="mt-1 text-muted-foreground">
												{discount.description || "No description"}
											</p>
										</div>
										<div className="flex flex-wrap justify-end gap-2">
											<button
												type="button"
												onClick={() => void handleToggle(discount)}
												className="rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground"
											>
												{discount.status === "active"
													? "Deactivate"
													: "Activate"}
											</button>
											<button
												type="button"
												onClick={() => void handleRemove(discount)}
												className="rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive"
											>
												Delete
											</button>
										</div>
									</div>

									<div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
										<span>{discount.status}</span>
										<span>{discount.discountType}</span>
										<span>
											{formatAmount(discount.discountType, discount.amount)}
										</span>
										<span>{discount.applicability ?? "matching_items"}</span>
										<span>
											Used {discount.usageCount}
											{typeof discount.usageLimit === "number"
												? ` / ${discount.usageLimit}`
												: ""}
										</span>
									</div>

									<div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
										{typeof discount.minimumSubtotalAmount === "number" ? (
											<span>
												Minimum subtotal: $
												{centsToDisplay(discount.minimumSubtotalAmount)}
											</span>
										) : null}
										{typeof discount.minimumQuantity === "number" ? (
											<span>Minimum quantity: {discount.minimumQuantity}</span>
										) : null}
										{typeof discount.maxDiscountAmount === "number" ? (
											<span>
												Max discount: $
												{centsToDisplay(discount.maxDiscountAmount)}
											</span>
										) : null}
										{discount.tiers?.length ? (
											<span>{discount.tiers.length} tiered rule(s)</span>
										) : null}
										{idSummary(discount.productIds) ? (
											<span>Products: {idSummary(discount.productIds)}</span>
										) : null}
										{idSummary(discount.categoryIds) ? (
											<span>Categories: {idSummary(discount.categoryIds)}</span>
										) : null}
										{idSummary(discount.excludedProductIds) ? (
											<span>
												Excluded products:{" "}
												{idSummary(discount.excludedProductIds)}
											</span>
										) : null}
										{idSummary(discount.excludedCategoryIds) ? (
											<span>
												Excluded categories:{" "}
												{idSummary(discount.excludedCategoryIds)}
											</span>
										) : null}
									</div>
								</div>
							))
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
