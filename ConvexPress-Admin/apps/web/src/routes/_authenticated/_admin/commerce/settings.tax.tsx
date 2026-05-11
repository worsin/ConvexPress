import { api } from "@backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import {
	Check,
	Database,
	Pencil,
	Plus,
	Receipt,
	Trash2,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute(
	"/_authenticated/_admin/commerce/settings/tax",
)({
	component: TaxRulesPage,
});

type TaxRule = {
	_id: string;
	name: string;
	countryCode: string;
	stateCode?: string;
	postalCodePattern?: string;
	taxClass?: string;
	ratePercent: number;
	priority: number;
	isCompound: boolean;
	isActive: boolean;
};

type RuleDraft = {
	name: string;
	countryCode: string;
	stateCode: string;
	postalCodePattern: string;
	taxClass: string;
	ratePercent: string;
	priority: string;
	isCompound: boolean;
	isActive: boolean;
};

const EMPTY_DRAFT: RuleDraft = {
	name: "",
	countryCode: "US",
	stateCode: "",
	postalCodePattern: "",
	taxClass: "",
	ratePercent: "",
	priority: "100",
	isCompound: false,
	isActive: true,
};

function formatRate(rate: number) {
	return `${rate.toFixed(2)}%`;
}

function toPayload(draft: RuleDraft) {
	return {
		name: draft.name.trim(),
		countryCode: draft.countryCode.trim().toUpperCase(),
		stateCode: draft.stateCode.trim().toUpperCase() || undefined,
		postalCodePattern: draft.postalCodePattern.trim() || undefined,
		taxClass: draft.taxClass.trim().toLowerCase() || undefined,
		ratePercent: Number(draft.ratePercent),
		priority: Number(draft.priority),
		isCompound: draft.isCompound,
		isActive: draft.isActive,
	};
}

function draftFromRule(rule: TaxRule): RuleDraft {
	return {
		name: rule.name,
		countryCode: rule.countryCode,
		stateCode: rule.stateCode ?? "",
		postalCodePattern: rule.postalCodePattern ?? "",
		taxClass: rule.taxClass ?? "",
		ratePercent: String(rule.ratePercent),
		priority: String(rule.priority),
		isCompound: rule.isCompound,
		isActive: rule.isActive,
	};
}

function centsFromDisplay(value: string) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function displayFromCents(value: number) {
	return (value / 100).toFixed(2);
}

function TaxRulesPage() {
	const rules = useQuery(api["commerce/tax"].list, {}) as TaxRule[] | undefined;
	const createRule = useMutation(api["commerce/tax"].create);
	const updateRule = useMutation(api["commerce/tax"].update);
	const toggleActive = useMutation(api["commerce/tax"].toggleActive);
	const deleteRule = useMutation(api["commerce/tax"].remove);
	const seedDefaults = useMutation(api["commerce/tax"].seedDefaultTaxRules);

	const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editDraft, setEditDraft] = useState<RuleDraft>(EMPTY_DRAFT);
	const [previewCountry, setPreviewCountry] = useState("US");
	const [previewState, setPreviewState] = useState("CA");
	const [previewPostalCode, setPreviewPostalCode] = useState("90210");
	const [previewTaxClass, setPreviewTaxClass] = useState("");
	const [previewAmount, setPreviewAmount] = useState("100.00");
	const [previewIncludesTax, setPreviewIncludesTax] = useState(false);

	const preview = useQuery(api["commerce/tax"].calculate, {
		countryCode: previewCountry.trim().toUpperCase() || "US",
		state: previewState.trim().toUpperCase() || undefined,
		postalCode: previewPostalCode.trim() || undefined,
		taxClass: previewTaxClass.trim().toLowerCase() || undefined,
		amount: centsFromDisplay(previewAmount),
		pricesIncludeTax: previewIncludesTax,
	}) as
		| {
				taxAmount: number;
				taxRate: number;
				rules: Array<{ name: string; ratePercent: number }>;
		  }
		| undefined;

	function updateDraft(field: keyof RuleDraft, value: string | boolean) {
		setDraft((current) => ({ ...current, [field]: value }));
	}

	function updateEditDraft(field: keyof RuleDraft, value: string | boolean) {
		setEditDraft((current) => ({ ...current, [field]: value }));
	}

	async function handleCreate(event: React.FormEvent) {
		event.preventDefault();
		try {
			await createRule(toPayload(draft));
			toast.success("Tax rule created.");
			setDraft(EMPTY_DRAFT);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to create tax rule"),
			);
		}
	}

	async function handleSave(ruleId: string) {
		try {
			await updateRule({ id: ruleId, ...toPayload(editDraft) });
			toast.success("Tax rule updated.");
			setEditingId(null);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to update tax rule"),
			);
		}
	}

	async function handleToggle(rule: TaxRule) {
		try {
			await toggleActive({ id: rule._id });
			toast.success(
				rule.isActive ? "Tax rule deactivated." : "Tax rule activated.",
			);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to toggle tax rule"),
			);
		}
	}

	async function handleDelete(ruleId: string) {
		if (!confirm("Delete this tax rule?")) return;
		try {
			await deleteRule({ id: ruleId });
			toast.success("Tax rule deleted.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to delete tax rule"),
			);
		}
	}

	async function handleSeedDefaults() {
		if (
			!confirm("Seed default US tax rules? This only runs when no rules exist.")
		) {
			return;
		}
		try {
			const result = await seedDefaults({});
			if (result.seeded) {
				toast.success(`${result.count} default tax rules created.`);
			} else {
				toast.info("Default rules skipped because tax rules already exist.");
			}
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to seed tax rules"),
			);
		}
	}

	function startEdit(rule: TaxRule) {
		setEditingId(rule._id);
		setEditDraft(draftFromRule(rule));
	}

	return (
		<div className="mx-auto max-w-6xl space-y-6 p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<Receipt className="h-6 w-6 text-muted-foreground" />
					<div>
						<h1 className="text-xl font-semibold text-foreground">Tax Rules</h1>
						<p className="text-sm text-muted-foreground">
							Configure location and class based sales tax for checkout.
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={handleSeedDefaults}
					className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/80"
				>
					<Database className="h-4 w-4" />
					Seed Defaults
				</button>
			</div>

			<form
				onSubmit={handleCreate}
				className="space-y-4 rounded-lg border border-border bg-card p-4"
			>
				<h2 className="text-sm font-semibold text-foreground">Add Tax Rule</h2>
				<RuleFields draft={draft} onChange={updateDraft} />
				<button
					type="submit"
					className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					<Plus className="h-4 w-4" />
					Add Rule
				</button>
			</form>

			<section className="rounded-lg border border-border bg-card p-4">
				<h2 className="text-sm font-semibold text-foreground">
					Preview Calculation
				</h2>
				<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
					<TextField
						label="Country"
						value={previewCountry}
						onChange={setPreviewCountry}
						maxLength={2}
					/>
					<TextField
						label="State"
						value={previewState}
						onChange={setPreviewState}
						maxLength={5}
					/>
					<TextField
						label="Postal code"
						value={previewPostalCode}
						onChange={setPreviewPostalCode}
					/>
					<TextField
						label="Tax class"
						value={previewTaxClass}
						onChange={setPreviewTaxClass}
						placeholder="standard"
					/>
					<TextField
						label="Amount"
						value={previewAmount}
						onChange={setPreviewAmount}
						type="number"
						step="0.01"
					/>
					<label className="flex items-end gap-2 pb-2 text-sm text-foreground">
						<input
							type="checkbox"
							checked={previewIncludesTax}
							onChange={(event) => setPreviewIncludesTax(event.target.checked)}
						/>
						Prices include tax
					</label>
				</div>
				<div className="mt-3 rounded-md bg-muted/40 px-3 py-2 text-sm">
					<span className="font-medium text-foreground">
						Tax: ${displayFromCents(preview?.taxAmount ?? 0)}
					</span>
					<span className="ml-3 text-muted-foreground">
						Effective rate: {((preview?.taxRate ?? 0) * 100).toFixed(2)}%
					</span>
					<span className="ml-3 text-muted-foreground">
						Matched:{" "}
						{preview?.rules?.map((rule) => rule.name).join(", ") || "none"}
					</span>
				</div>
			</section>

			{rules === undefined ? (
				<p className="text-sm text-muted-foreground">Loading tax rules...</p>
			) : rules.length === 0 ? (
				<div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
					<Receipt className="mx-auto h-10 w-10 text-muted-foreground/50" />
					<p className="mt-2 text-sm text-muted-foreground">
						No tax rules configured yet.
					</p>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border border-border">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-border bg-muted/30">
								<th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
									Status
								</th>
								<th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
									Rule
								</th>
								<th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
									Location
								</th>
								<th className="px-3 py-2.5 text-left font-medium text-muted-foreground">
									Class
								</th>
								<th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
									Rate
								</th>
								<th className="px-3 py-2.5 text-center font-medium text-muted-foreground">
									Priority
								</th>
								<th className="px-3 py-2.5 text-right font-medium text-muted-foreground">
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{rules.map((rule) => {
								const isEditing = editingId === rule._id;
								return (
									<tr
										key={rule._id}
										className="border-b border-border last:border-0"
									>
										<td className="px-3 py-3 align-top">
											<button
												type="button"
												onClick={() => handleToggle(rule)}
												className={`rounded-full px-2 py-1 text-xs font-medium ${
													rule.isActive
														? "bg-emerald-100 text-emerald-700"
														: "bg-muted text-muted-foreground"
												}`}
											>
												{rule.isActive ? "Active" : "Inactive"}
											</button>
										</td>
										<td className="px-3 py-3 align-top">
											{isEditing ? (
												<RuleFields
													compact
													draft={editDraft}
													onChange={updateEditDraft}
												/>
											) : (
												<div>
													<p className="font-medium text-foreground">
														{rule.name}
													</p>
													<p className="text-xs text-muted-foreground">
														{rule.isCompound ? "Compound" : "Standard"} rule
													</p>
												</div>
											)}
										</td>
										<td className="px-3 py-3 align-top text-muted-foreground">
											{isEditing ? null : (
												<>
													{rule.countryCode}
													{rule.stateCode ? ` / ${rule.stateCode}` : ""}
													{rule.postalCodePattern
														? ` / ${rule.postalCodePattern}`
														: ""}
												</>
											)}
										</td>
										<td className="px-3 py-3 align-top text-muted-foreground">
											{isEditing ? null : rule.taxClass || "standard"}
										</td>
										<td className="px-3 py-3 text-right align-top font-medium">
											{isEditing ? null : formatRate(rule.ratePercent)}
										</td>
										<td className="px-3 py-3 text-center align-top text-muted-foreground">
											{isEditing ? null : rule.priority}
										</td>
										<td className="px-3 py-3 align-top">
											<div className="flex items-center justify-end gap-1">
												{isEditing ? (
													<>
														<button
															type="button"
															onClick={() => void handleSave(rule._id)}
															className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
															aria-label="Save tax rule"
														>
															<Check className="h-4 w-4" />
														</button>
														<button
															type="button"
															onClick={() => setEditingId(null)}
															className="rounded p-1 text-muted-foreground hover:bg-muted"
															aria-label="Cancel editing"
														>
															<X className="h-4 w-4" />
														</button>
													</>
												) : (
													<>
														<button
															type="button"
															onClick={() => startEdit(rule)}
															className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
															aria-label="Edit tax rule"
														>
															<Pencil className="h-3.5 w-3.5" />
														</button>
														<button
															type="button"
															onClick={() => void handleDelete(rule._id)}
															className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
															aria-label="Delete tax rule"
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</>
												)}
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function RuleFields({
	draft,
	onChange,
	compact = false,
}: {
	draft: RuleDraft;
	onChange: (field: keyof RuleDraft, value: string | boolean) => void;
	compact?: boolean;
}) {
	return (
		<div
			className={`grid grid-cols-1 gap-3 ${compact ? "lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-8"}`}
		>
			<TextField
				label="Name"
				value={draft.name}
				onChange={(value) => onChange("name", value)}
			/>
			<TextField
				label="Country"
				value={draft.countryCode}
				onChange={(value) => onChange("countryCode", value)}
				maxLength={2}
			/>
			<TextField
				label="State"
				value={draft.stateCode}
				onChange={(value) => onChange("stateCode", value)}
				maxLength={5}
			/>
			<TextField
				label="Postal"
				value={draft.postalCodePattern}
				onChange={(value) => onChange("postalCodePattern", value)}
				placeholder="90*"
			/>
			<TextField
				label="Tax class"
				value={draft.taxClass}
				onChange={(value) => onChange("taxClass", value)}
				placeholder="standard"
			/>
			<TextField
				label="Rate %"
				value={draft.ratePercent}
				onChange={(value) => onChange("ratePercent", value)}
				type="number"
				step="0.01"
			/>
			<TextField
				label="Priority"
				value={draft.priority}
				onChange={(value) => onChange("priority", value)}
				type="number"
				step="1"
			/>
			<div className="flex items-end gap-3 pb-2">
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={draft.isActive}
						onChange={(event) => onChange("isActive", event.target.checked)}
					/>
					Active
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						checked={draft.isCompound}
						onChange={(event) => onChange("isCompound", event.target.checked)}
					/>
					Compound
				</label>
			</div>
		</div>
	);
}

function TextField({
	label,
	value,
	onChange,
	type = "text",
	step,
	maxLength,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	step?: string;
	maxLength?: number;
	placeholder?: string;
}) {
	return (
		<label className="grid gap-1">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<input
				type={type}
				step={step}
				maxLength={maxLength}
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
			/>
		</label>
	);
}
