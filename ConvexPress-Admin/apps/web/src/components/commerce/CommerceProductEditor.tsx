import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ChevronDown, ChevronUp } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	type BulkEditFields,
	applyBulkEditToVariants,
	buildVariantDraft,
	centsToDisplay,
	countVariantsUsingOptionType,
	displayToMoney,
	emptyBulkEditFields,
	getProductTypeLabel,
	parseOptionValueInput,
} from "./CommerceProductEditor.helpers";
import { MediaPicker } from "@/components/media/MediaPicker";

type EditorMode = "create" | "edit";
type ProductStatus = "draft" | "publish" | "private";
type Money = { amount?: number; currency?: string };
type Category = {
	_id: Id<"commerce_product_categories">;
	name: string;
	description?: string;
};
type OptionValue = {
	id: string;
	label: string;
};
type OptionType = {
	id: string;
	name: string;
	values?: OptionValue[];
};
type Variant = {
	_id: Id<"commerce_product_variants">;
	title?: string;
	sku?: string;
	price?: Money;
	salePrice?: Money | null;
	stockQuantity?: number;
	optionSummary?: string;
	isDefault?: boolean;
	featuredMediaId?: Id<"media">;
	description?: string;
	globalUniqueId?: string;
	weight?: string;
	shippingLengthIn?: string;
	shippingWidthIn?: string;
	shippingHeightIn?: string;
	manageStock?: "yes" | "no" | "parent";
	stockStatus?: "instock" | "outofstock" | "onbackorder";
	backorders?: "yes" | "no" | "notify";
	lowStockAmount?: number;
	taxClass?: string;
	shippingClassId?: string;
	isVirtual?: boolean;
	isDownloadable?: boolean;
	downloadLimit?: number;
	downloadExpiry?: number;
	status?: "publish" | "private" | "draft";
	salePriceFrom?: number;
	salePriceTo?: number;
	menuOrder?: number;
};
type Product = {
	title?: string;
	slug?: string;
	description?: string;
	excerpt?: string;
	sku?: string;
	basePrice?: Money;
	salePrice?: Money | null;
	stockQuantity?: number;
	status?: ProductStatus;
	trackInventory?: boolean;
	allowBackorders?: boolean;
	isVirtual?: boolean;
	shippingWeightOz?: number;
	isDownloadable?: boolean;
	categoryIds?: Id<"commerce_product_categories">[];
	featuredMediaId?: Id<"media">;
	galleryMediaIds?: Id<"media">[];
	productType?: string;
	inventoryAdjustments?: Array<{
		_id: string;
		adjustmentType: string;
		quantityDelta: number;
		reason?: string;
		createdAt: number;
	}>;
};
type VariantIntegrity = {
	totals: Record<string, number>;
	samples: Record<string, Record<string, unknown>[]>;
};

interface CommerceProductEditorProps {
	mode: EditorMode;
	productId?: Id<"commerce_products">;
}

export function CommerceProductEditor({
	mode,
	productId,
}: CommerceProductEditorProps) {
	const navigate = useNavigate();
	const categories =
		(useQuery(api["commerce/categories"].list, {}) as Category[] | undefined) ??
		[];
	const optionTypes = useQuery(
		api["commerce/products"].listOptionTypes,
		mode === "edit" && productId ? { productId } : "skip",
	) as OptionType[] | undefined;
	const variants = useQuery(
		api["commerce/products"].listVariants,
		mode === "edit" && productId ? { productId } : "skip",
	) as Variant[] | undefined;
	const variantIntegrity = useQuery(
		api["commerce/migrations"].auditVariantIntegrity,
		mode === "edit" && productId ? { productId, sampleLimit: 8 } : "skip",
	) as VariantIntegrity | undefined;
	const product = useQuery(
		api["commerce/products"].get,
		mode === "edit" && productId ? { productId } : "skip",
	) as Product | null | undefined;
	const createProduct = useMutation(api["commerce/products"].create);
	const updateProduct = useMutation(api["commerce/products"].update);
	const createOptionType = useMutation(
		api["commerce/products"].createOptionType,
	);
	const updateOptionType = useMutation(
		api["commerce/products"].updateOptionType,
	);
	const deleteOptionType = useMutation(
		api["commerce/products"].deleteOptionType,
	);
	const createOptionValue = useMutation(
		api["commerce/products"].createOptionValue,
	);
	const updateOptionValue = useMutation(
		api["commerce/products"].updateOptionValue,
	);
	const deleteOptionValue = useMutation(
		api["commerce/products"].deleteOptionValue,
	);
	const generateVariants = useMutation(
		api["commerce/products"].generateVariants,
	);
	const updateVariant = useMutation(api["commerce/products"].updateVariant);
	const createVariant = useMutation(api["commerce/products"].createVariant);
	const deleteVariant = useMutation(api["commerce/products"].deleteVariant);
	const repairVariantIntegrity = useMutation(
		api["commerce/migrations"].repairVariantIntegrity,
	);

	const [title, setTitle] = useState("");
	const [slug, setSlug] = useState("");
	const [description, setDescription] = useState("");
	const [excerpt, setExcerpt] = useState("");
	const [sku, setSku] = useState("");
	const [basePrice, setBasePrice] = useState("");
	const [salePrice, setSalePrice] = useState("");
	const [stockQuantity, setStockQuantity] = useState("");
	const [status, setStatus] = useState<ProductStatus>("draft");
	const [trackInventory, setTrackInventory] = useState(true);
	const [allowBackorders, setAllowBackorders] = useState(false);
	const [isVirtual, setIsVirtual] = useState(false);
	const [shippingWeightOz, setShippingWeightOz] = useState("");
	const [isDownloadable, setIsDownloadable] = useState(false);
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<
		Id<"commerce_product_categories">[]
	>([]);
	const [featuredMediaId, setFeaturedMediaId] = useState<
		Id<"media"> | undefined
	>(undefined);
	const [galleryMediaIds, setGalleryMediaIds] = useState<Id<"media">[]>([]);
	const [newOptionTypeName, setNewOptionTypeName] = useState("");
	const [newOptionTypeValues, setNewOptionTypeValues] = useState("");
	const [optionTypeDrafts, setOptionTypeDrafts] = useState<
		Record<string, string>
	>({});
	const [newValueDrafts, setNewValueDrafts] = useState<Record<string, string>>(
		{},
	);
	const [optionValueDrafts, setOptionValueDrafts] = useState<
		Record<string, string>
	>({});
	const [variantDrafts, setVariantDrafts] = useState<
		Record<string, import("./CommerceProductEditor.helpers").VariantDraft>
	>({});
	const [variantMediaDrafts, setVariantMediaDrafts] = useState<
		Record<string, Id<"media"> | null | undefined>
	>({});
	const [initialized, setInitialized] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [isRepairPreviewing, setIsRepairPreviewing] = useState(false);
	const [isRepairApplying, setIsRepairApplying] = useState(false);
	const [repairDialogOpen, setRepairDialogOpen] = useState(false);

	// Expanded variant detail panels (set of variant IDs)
	const [expandedVariants, setExpandedVariants] = useState<Set<string>>(
		new Set(),
	);
	// Show sale schedule date pickers per variant
	const [showSaleSchedule, setShowSaleSchedule] = useState<Set<string>>(
		new Set(),
	);

	// Single variant creation form
	const [showSingleVariantForm, setShowSingleVariantForm] = useState(false);
	const [singleVariantTitle, setSingleVariantTitle] = useState("");
	const [singleVariantSku, setSingleVariantSku] = useState("");
	const [singleVariantPrice, setSingleVariantPrice] = useState("");
	const [singleVariantSalePrice, setSingleVariantSalePrice] = useState("");
	const [singleVariantStock, setSingleVariantStock] = useState("");
	const [singleVariantMediaId, setSingleVariantMediaId] = useState<
		Id<"media"> | undefined
	>(undefined);
	const [singleVariantSelections, setSingleVariantSelections] = useState<
		Record<string, { valueId: string; valueLabel: string }>
	>({});
	const [isCreatingVariant, setIsCreatingVariant] = useState(false);

	// Bulk edit
	const [showBulkEdit, setShowBulkEdit] = useState(false);
	const [bulkEditFields, setBulkEditFields] = useState<BulkEditFields>(
		emptyBulkEditFields(),
	);
	const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(
		new Set(),
	);

	// Destructive action confirmations
	const [deleteOptionTypeConfirm, setDeleteOptionTypeConfirm] = useState<{
		open: boolean;
		optionTypeId: string;
		optionTypeName: string;
		affectedCount: number;
	}>({ open: false, optionTypeId: "", optionTypeName: "", affectedCount: 0 });

	const [deleteVariantConfirm, setDeleteVariantConfirm] = useState<{
		open: boolean;
		variantId: string;
		variantTitle: string;
		isDefault: boolean;
	}>({ open: false, variantId: "", variantTitle: "", isDefault: false });

	const [renameWarning, setRenameWarning] = useState<{
		open: boolean;
		type: "optionType" | "optionValue";
		id: string;
		parentId?: string;
		oldName: string;
		newName: string;
		affectedCount: number;
	}>({
		open: false,
		type: "optionType",
		id: "",
		oldName: "",
		newName: "",
		affectedCount: 0,
	});

	useEffect(() => {
		if (mode !== "edit" || !product || initialized) return;
		setTitle(product.title ?? "");
		setSlug(product.slug ?? "");
		setDescription(product.description ?? "");
		setExcerpt(product.excerpt ?? "");
		setSku(product.sku ?? "");
		setBasePrice(centsToDisplay(product.basePrice?.amount));
		setSalePrice(centsToDisplay(product.salePrice?.amount));
		setStockQuantity(
			typeof product.stockQuantity === "number"
				? String(product.stockQuantity)
				: "",
		);
		setStatus(product.status ?? "draft");
		setTrackInventory(product.trackInventory ?? true);
		setAllowBackorders(product.allowBackorders ?? false);
		setIsVirtual(product.isVirtual ?? false);
		setShippingWeightOz(
			typeof product.shippingWeightOz === "number"
				? String(product.shippingWeightOz)
				: "",
		);
		setIsDownloadable(product.isDownloadable ?? false);
		setSelectedCategoryIds(product.categoryIds ?? []);
		setFeaturedMediaId(product.featuredMediaId);
		setGalleryMediaIds(product.galleryMediaIds ?? []);
		setInitialized(true);
	}, [initialized, mode, product]);

	const titleForPage = useMemo(
		() => (mode === "create" ? "Add Product" : "Edit Product"),
		[mode],
	);
	const variantModeEnabled = mode === "edit" && Boolean(productId);
	const resolvedOptionTypes = optionTypes ?? [];
	const resolvedVariants = variants ?? [];
	const productTypeLabel = getProductTypeLabel(
		product?.productType,
		resolvedVariants.length,
	);
	const integrityIssueTotal = useMemo(() => {
		if (!variantIntegrity?.totals) return 0;
		return Object.entries(variantIntegrity.totals).reduce(
			(sum, [key, value]) => {
				if (key === "products" || key === "variants") {
					return sum;
				}
				return sum + (typeof value === "number" ? value : 0);
			},
			0,
		);
	}, [variantIntegrity]);
	const integrityRows = useMemo(
		() =>
			variantIntegrity
				? [
						{
							label: "Duplicate selection keys",
							count: variantIntegrity.totals.duplicateSelectionKeyGroups ?? 0,
							sampleKey: "duplicateSelectionKeyGroups",
						},
						{
							label: "Missing default variant",
							count:
								variantIntegrity.totals.variableProductsWithoutDefault ?? 0,
							sampleKey: "variableProductsWithoutDefault",
						},
						{
							label: "Multiple default variants",
							count:
								variantIntegrity.totals.variableProductsWithMultipleDefaults ??
								0,
							sampleKey: "variableProductsWithMultipleDefaults",
						},
						{
							label: "Type drift",
							count: variantIntegrity.totals.productsWithTypeDrift ?? 0,
							sampleKey: "productsWithTypeDrift",
						},
						{
							label: "Missing normalized selections",
							count: variantIntegrity.totals.variantsMissingSelections ?? 0,
							sampleKey: "variantsMissingSelections",
						},
						{
							label: "Invalid selections",
							count: variantIntegrity.totals.variantsWithInvalidSelections ?? 0,
							sampleKey: "variantsWithInvalidSelections",
						},
						{
							label: "Stale selection keys",
							count: variantIntegrity.totals.variantsMissingSelectionKey ?? 0,
							sampleKey: "variantsMissingSelectionKey",
						},
						{
							label: "Manual repair required",
							count:
								variantIntegrity.totals.variantsNeedingManualSelectionRepair ??
								0,
							sampleKey: "variantsNeedingManualSelectionRepair",
						},
						{
							label: "Broken references",
							count:
								(variantIntegrity.totals.missingVariantRefs ?? 0) +
								(variantIntegrity.totals.crossProductVariantRefs ?? 0),
							sampleKey:
								(variantIntegrity.totals.crossProductVariantRefs ?? 0) > 0
									? "crossProductVariantRefs"
									: "missingVariantRefs",
						},
						{
							label: "Variantless order items",
							count:
								variantIntegrity.totals.variableOrderItemsMissingVariant ?? 0,
							sampleKey: "variableOrderItemsMissingVariant",
						},
					].filter((row) => row.count > 0)
				: [],
		[variantIntegrity],
	);

	const handleCategoryToggle = (categoryId: Id<"commerce_product_categories">) => {
		setSelectedCategoryIds((current) =>
			current.includes(categoryId)
				? current.filter((id) => id !== categoryId)
				: [...current, categoryId],
		);
	};

	useEffect(() => {
		if (!resolvedOptionTypes.length) return;
		setOptionTypeDrafts((current) => {
			const next = { ...current };
			for (const optionType of resolvedOptionTypes) {
				if (next[optionType.id] === undefined) {
					next[optionType.id] = optionType.name;
				}
			}
			return next;
		});
		setOptionValueDrafts((current) => {
			const next = { ...current };
			for (const optionType of resolvedOptionTypes) {
				for (const value of optionType.values ?? []) {
					if (next[value.id] === undefined) {
						next[value.id] = value.label;
					}
				}
			}
			return next;
		});
	}, [resolvedOptionTypes]);

	useEffect(() => {
		if (!resolvedVariants.length) return;
		setVariantDrafts((current) => {
			const next = { ...current };
			for (const variant of resolvedVariants) {
				if (next[variant._id] === undefined) {
					next[variant._id] = buildVariantDraft(variant);
				}
			}
			return next;
		});
	}, [resolvedVariants]);

	function setVariantDraftField(
		variantId: string,
		field: keyof import("./CommerceProductEditor.helpers").VariantDraft,
		value: string | boolean,
	) {
		setVariantDrafts((current) => {
			const existing = current[variantId];
			if (!existing) return current;
			return {
				...current,
				[variantId]: {
					...existing,
					[field]: value,
				},
			};
		});
	}

	async function handleCreateOptionType() {
		if (!productId) return;
		const name = newOptionTypeName.trim();
		const values = parseOptionValueInput(newOptionTypeValues);

		if (!name) {
			toast.error("Option type name is required.");
			return;
		}

		if (values.length === 0) {
			toast.error("Add at least one option value.");
			return;
		}

		try {
			await createOptionType({ productId, name, values });
			setNewOptionTypeName("");
			setNewOptionTypeValues("");
			toast.success("Option type created.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to create option type"),
			);
		}
	}

	async function handleSaveOptionType(optionTypeId: string) {
		if (!productId) return;
		const name = optionTypeDrafts[optionTypeId]?.trim();
		if (!name) {
			toast.error("Option type name is required.");
			return;
		}

		try {
			await updateOptionType({ productId, optionTypeId, name });
			toast.success("Option type updated.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to update option type"),
			);
		}
	}

	async function handleDeleteOptionType(optionTypeId: string) {
		if (!productId) return;
		try {
			await deleteOptionType({ productId, optionTypeId });
			toast.success("Option type deleted.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to delete option type"),
			);
		}
	}

	async function handleCreateOptionValue(optionTypeId: string) {
		if (!productId) return;
		const label = newValueDrafts[optionTypeId]?.trim();
		if (!label) {
			toast.error("Option value is required.");
			return;
		}

		try {
			await createOptionValue({ productId, optionTypeId, label });
			setNewValueDrafts((current) => ({ ...current, [optionTypeId]: "" }));
			toast.success("Option value added.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to create option value"),
			);
		}
	}

	async function handleSaveOptionValue(optionTypeId: string, valueId: string) {
		if (!productId) return;
		const label = optionValueDrafts[valueId]?.trim();
		if (!label) {
			toast.error("Option value is required.");
			return;
		}

		try {
			await updateOptionValue({ productId, optionTypeId, valueId, label });
			toast.success("Option value updated.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to update option value"),
			);
		}
	}

	async function handleDeleteOptionValue(
		optionTypeId: string,
		valueId: string,
	) {
		if (!productId) return;
		try {
			await deleteOptionValue({ productId, optionTypeId, valueId });
			toast.success("Option value deleted.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to delete option value"),
			);
		}
	}

	function handleRequestDeleteOptionType(optionTypeId: string) {
		const optionType = resolvedOptionTypes.find((ot) => ot.id === optionTypeId);
		const affectedCount = countVariantsUsingOptionType(
			resolvedVariants as Array<{
				selections?: Array<{ optionTypeId?: string }>;
			}>,
			optionTypeId,
		);
		setDeleteOptionTypeConfirm({
			open: true,
			optionTypeId,
			optionTypeName: optionType?.name ?? "Unknown",
			affectedCount,
		});
	}

	function handleRequestDeleteVariant(variantId: string) {
		const variant = resolvedVariants.find((v) => v._id === variantId);
		setDeleteVariantConfirm({
			open: true,
			variantId,
			variantTitle: variant?.optionSummary ?? variant?.title ?? "Unnamed variant",
			isDefault: variant?.isDefault ?? false,
		});
	}

	function handleRequestSaveOptionType(optionTypeId: string) {
		if (!productId) return;
		const optionType = resolvedOptionTypes.find((ot) => ot.id === optionTypeId);
		const oldName = optionType?.name ?? "";
		const newName = optionTypeDrafts[optionTypeId]?.trim() ?? "";
		if (!newName) {
			toast.error("Option type name is required.");
			return;
		}
		if (oldName === newName) {
			void handleSaveOptionType(optionTypeId);
			return;
		}
		const affectedCount = countVariantsUsingOptionType(
			resolvedVariants as Array<{
				selections?: Array<{ optionTypeId?: string }>;
			}>,
			optionTypeId,
		);
		if (affectedCount > 0) {
			setRenameWarning({
				open: true,
				type: "optionType",
				id: optionTypeId,
				oldName,
				newName,
				affectedCount,
			});
		} else {
			void handleSaveOptionType(optionTypeId);
		}
	}

	function handleRequestSaveOptionValue(
		optionTypeId: string,
		valueId: string,
	) {
		if (!productId) return;
		const optionType = resolvedOptionTypes.find((ot) => ot.id === optionTypeId);
		const value = (optionType?.values ?? []).find((v) => v.id === valueId);
		const oldLabel = value?.label ?? "";
		const newLabel = optionValueDrafts[valueId]?.trim() ?? "";
		if (!newLabel) {
			toast.error("Option value is required.");
			return;
		}
		if (oldLabel === newLabel) {
			void handleSaveOptionValue(optionTypeId, valueId);
			return;
		}
		const affectedCount = resolvedVariants.filter((variant) =>
			((variant as Record<string, unknown>).selections as Array<{
				optionValueId?: string;
			}> | undefined)?.some((sel) => sel.optionValueId === valueId),
		).length;
		if (affectedCount > 0) {
			setRenameWarning({
				open: true,
				type: "optionValue",
				id: valueId,
				parentId: optionTypeId,
				oldName: oldLabel,
				newName: newLabel,
				affectedCount,
			});
		} else {
			void handleSaveOptionValue(optionTypeId, valueId);
		}
	}

	function handleConfirmRename() {
		if (renameWarning.type === "optionType") {
			void handleSaveOptionType(renameWarning.id);
		} else if (renameWarning.parentId) {
			void handleSaveOptionValue(renameWarning.parentId, renameWarning.id);
		}
		setRenameWarning((prev) => ({ ...prev, open: false }));
	}

	async function handleCreateSingleVariant() {
		if (!productId) return;
		if (!singleVariantTitle.trim()) {
			toast.error("Variant title is required.");
			return;
		}
		if (!singleVariantPrice.trim()) {
			toast.error("Variant price is required.");
			return;
		}

		const selections = resolvedOptionTypes
			.map((ot) => {
				const sel = singleVariantSelections[ot.id];
				if (!sel) return null;
				return {
					optionTypeId: ot.id,
					optionTypeName: ot.name,
					optionValueId: sel.valueId,
					optionValueLabel: sel.valueLabel,
				};
			})
			.filter(Boolean) as Array<{
			optionTypeId: string;
			optionTypeName: string;
			optionValueId: string;
			optionValueLabel: string;
		}>;

		const optionSummary =
			selections.length > 0
				? selections.map((s) => s.optionValueLabel).join(" / ")
				: singleVariantTitle.trim();

		setIsCreatingVariant(true);
		try {
			await createVariant({
				productId,
				title: singleVariantTitle.trim(),
				sku: singleVariantSku.trim() || undefined,
				optionSummary,
				selections: selections.length > 0 ? selections : undefined,
				priceAmount: displayToMoney(singleVariantPrice).amount,
				salePriceAmount: singleVariantSalePrice.trim()
					? displayToMoney(singleVariantSalePrice).amount
					: undefined,
				stockQuantity: singleVariantStock.trim()
					? Number(singleVariantStock)
					: undefined,
				featuredMediaId: singleVariantMediaId,
			});
			toast.success("Variant created.");
			setSingleVariantTitle("");
			setSingleVariantSku("");
			setSingleVariantPrice("");
			setSingleVariantSalePrice("");
			setSingleVariantStock("");
			setSingleVariantMediaId(undefined);
			setSingleVariantSelections({});
			setShowSingleVariantForm(false);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to create variant"),
			);
		} finally {
			setIsCreatingVariant(false);
		}
	}

	function handleBulkEditApply() {
		const targetIds =
			selectedVariantIds.size > 0
				? Array.from(selectedVariantIds)
				: resolvedVariants.map((v) => v._id);
		if (targetIds.length === 0) {
			toast.error("No variants to update.");
			return;
		}
		const hasValues =
			bulkEditFields.price.trim() ||
			bulkEditFields.salePrice.trim() ||
			bulkEditFields.skuPrefix.trim() ||
			bulkEditFields.stockQuantity.trim();
		if (!hasValues) {
			toast.error("Enter at least one field to apply.");
			return;
		}
		setVariantDrafts((current) =>
			applyBulkEditToVariants(current, targetIds, bulkEditFields),
		);
		toast.success(
			`Applied bulk changes to ${targetIds.length} variant draft${targetIds.length === 1 ? "" : "s"}. Save each variant to persist.`,
		);
		setBulkEditFields(emptyBulkEditFields());
	}

	function handleToggleVariantSelection(variantId: string) {
		setSelectedVariantIds((current) => {
			const next = new Set(current);
			if (next.has(variantId)) {
				next.delete(variantId);
			} else {
				next.add(variantId);
			}
			return next;
		});
	}

	function handleToggleAllVariants() {
		setSelectedVariantIds((current) => {
			if (current.size === resolvedVariants.length) {
				return new Set();
			}
			return new Set(resolvedVariants.map((v) => v._id));
		});
	}

	async function handleGenerateVariants() {
		if (!productId) return;
		try {
			const created = await generateVariants({
				productId,
				basePriceAmount: displayToMoney(basePrice).amount,
			});
			toast.success(
				created?.created
					? `Generated ${created.created} variants.`
					: "No new variants were needed.",
			);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to generate variants"),
			);
		}
	}

	async function handleSaveVariant(variantId: string) {
		const draft = variantDrafts[variantId];
		if (!draft) return;

		try {
			await updateVariant({
				variantId,
				title: draft.title.trim(),
				sku: draft.sku.trim() || undefined,
				priceAmount: displayToMoney(draft.price).amount,
				salePriceAmount: draft.salePrice.trim()
					? displayToMoney(draft.salePrice).amount
					: undefined,
				salePriceFrom: draft.salePriceFrom
					? new Date(draft.salePriceFrom).getTime()
					: undefined,
				salePriceTo: draft.salePriceTo
					? new Date(draft.salePriceTo).getTime()
					: undefined,
				stockQuantity: draft.stockQuantity.trim()
					? Number(draft.stockQuantity)
					: undefined,
				featuredMediaId: variantMediaDrafts[variantId],
				description: draft.description.trim() || undefined,
				globalUniqueId: draft.globalUniqueId.trim() || undefined,
				weight: draft.weight.trim() || undefined,
				shippingLengthIn: draft.shippingLengthIn.trim() || undefined,
				shippingWidthIn: draft.shippingWidthIn.trim() || undefined,
				shippingHeightIn: draft.shippingHeightIn.trim() || undefined,
				manageStock: draft.manageStock,
				stockStatus: draft.stockStatus,
				backorders: draft.backorders,
				lowStockAmount: draft.lowStockAmount.trim()
					? Number(draft.lowStockAmount)
					: undefined,
				taxClass: draft.taxClass.trim() || undefined,
				shippingClassId: draft.shippingClassId.trim() || undefined,
				isVirtual: draft.isVirtual,
				isDownloadable: draft.isDownloadable,
				downloadLimit: draft.downloadLimit.trim()
					? Number(draft.downloadLimit)
					: undefined,
				downloadExpiry: draft.downloadExpiry.trim()
					? Number(draft.downloadExpiry)
					: undefined,
				status: draft.status,
				menuOrder: draft.menuOrder.trim()
					? Number(draft.menuOrder)
					: undefined,
			});
			toast.success("Variant updated.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to update variant"),
			);
		}
	}

	async function handleSetDefaultVariant(variantId: string) {
		try {
			await updateVariant({ variantId, isDefault: true });
			toast.success("Default variant updated.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to update default variant"),
			);
		}
	}

	async function handleDeleteVariant(variantId: string) {
		try {
			await deleteVariant({ variantId });
			toast.success("Variant deleted.");
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to delete variant"),
			);
		}
	}

	async function handleRepairPreview() {
		if (!productId) return;

		setIsRepairPreviewing(true);
		try {
			const result = await repairVariantIntegrity({ productId, dryRun: true });
			toast.success(
				`Dry run complete: ${result.productsTouched} products touched, ${result.selectionRepairs} selection repairs, ${result.selectionKeyRepairs} selection key repairs, ${result.defaultVariantRepairs} default repairs.`,
			);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error
						? error.message
						: "Failed to preview repairs"),
			);
		} finally {
			setIsRepairPreviewing(false);
		}
	}

	async function handleApplyRepair() {
		if (!productId) return;

		setIsRepairApplying(true);
		try {
			const result = await repairVariantIntegrity({ productId, dryRun: false });
			toast.success(
				`Repair complete: ${result.productsTouched} products touched, ${result.selectionRepairs} selection repairs, ${result.selectionKeyRepairs} selection key repairs, ${result.defaultVariantRepairs} default repairs.`,
			);
			setRepairDialogOpen(false);
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to apply repairs"),
			);
		} finally {
			setIsRepairApplying(false);
		}
	}

	async function handleSubmit() {
		if (!title.trim()) {
			toast.error("Product title is required.");
			return;
		}
		if (!basePrice.trim()) {
			toast.error("Base price is required.");
			return;
		}

		const basePayload = {
			title: title.trim(),
			slug: slug.trim() || undefined,
			description: description.trim() || undefined,
			excerpt: excerpt.trim() || undefined,
			sku: sku.trim() || undefined,
			categoryIds: selectedCategoryIds,
			basePrice: displayToMoney(basePrice),
			trackInventory,
			allowBackorders,
			isVirtual,
			shippingWeightOz: shippingWeightOz.trim()
				? Number(shippingWeightOz)
				: undefined,
			isDownloadable,
			featuredMediaId:
				mode === "edit" ? (featuredMediaId ?? null) : featuredMediaId,
			galleryMediaIds,
			status,
		};
		const salePriceValue = salePrice.trim()
			? displayToMoney(salePrice)
			: undefined;
		const stockQuantityValue =
			trackInventory && stockQuantity.trim()
				? Number(stockQuantity)
				: undefined;

		setIsSaving(true);
		try {
			const nextId =
				mode === "create"
					? await createProduct({
							...basePayload,
							salePrice: salePriceValue,
							stockQuantity: stockQuantityValue,
						})
					: await updateProduct({
							productId,
							...basePayload,
							salePrice: salePrice.trim() ? displayToMoney(salePrice) : null,
							stockQuantity: trackInventory
								? stockQuantity.trim()
									? Number(stockQuantity)
									: null
								: null,
						});
			toast.success(
				mode === "create" ? "Product created." : "Product updated.",
			);
			navigate({
				to: "/commerce/products/$productId",
				params: { productId: String(nextId) },
			});
		} catch (error) {
			toast.error(
				(error as { data?: { message?: string } })?.data?.message ??
					(error instanceof Error ? error.message : "Failed to save product"),
			);
		} finally {
			setIsSaving(false);
		}
	}

	if (mode === "edit" && product === undefined) {
		return <div className="h-64 animate-pulse rounded-3xl bg-muted" />;
	}

	if (mode === "edit" && product === null) {
		return (
			<div className="rounded-3xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
				Product not found.
			</div>
		);
	}

	return (
		<div className="mx-auto flex max-w-6xl flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<div className="mb-2">
						<Link
							to="/commerce/products"
							className="text-sm text-primary hover:underline"
						>
							Back to products
						</Link>
					</div>
					<h1 className="text-2xl font-semibold text-foreground">
						{titleForPage}
					</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage core catalog data for the storefront.
					</p>
					<p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
						Product type: {productTypeLabel}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						onClick={() => navigate({ to: "/commerce/products" })}
					>
						Cancel
					</Button>
					<Button onClick={() => void handleSubmit()} disabled={isSaving}>
						{isSaving
							? "Saving..."
							: mode === "create"
								? "Create Product"
								: "Save Product"}
					</Button>
				</div>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
				<section className="rounded-3xl border border-border bg-card p-6">
					<div className="grid gap-5">
						<div className="grid gap-2">
							<label
								className="text-sm font-medium"
								htmlFor="commerce-product-title"
							>
								Title
							</label>
							<Input
								id="commerce-product-title"
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="Minimal Desk Lamp"
							/>
						</div>
						<div className="grid gap-2">
							<label
								className="text-sm font-medium"
								htmlFor="commerce-product-slug"
							>
								Slug
							</label>
							<Input
								id="commerce-product-slug"
								value={slug}
								onChange={(event) => setSlug(event.target.value)}
								placeholder="minimal-desk-lamp"
							/>
						</div>
						<div className="grid gap-2">
							<label
								className="text-sm font-medium"
								htmlFor="commerce-product-excerpt"
							>
								Excerpt
							</label>
							<Textarea
								id="commerce-product-excerpt"
								rows={3}
								value={excerpt}
								onChange={(event) => setExcerpt(event.target.value)}
								placeholder="Short storefront summary."
							/>
						</div>
						<div className="grid gap-2">
							<label
								className="text-sm font-medium"
								htmlFor="commerce-product-description"
							>
								Description
							</label>
							<Textarea
								id="commerce-product-description"
								rows={8}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="Long product description."
							/>
						</div>
					</div>
				</section>

				<section className="rounded-3xl border border-border bg-card p-6">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="text-lg font-semibold">Options</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Define the option structure that variants must follow.
							</p>
						</div>
						{variantModeEnabled ? (
							<Button
								variant="outline"
								onClick={() => void handleGenerateVariants()}
							>
								Generate variants
							</Button>
						) : null}
					</div>

					{variantModeEnabled ? (
						<div className="mt-5 space-y-5">
							<div className="grid gap-3 rounded-2xl border border-dashed border-border p-4 md:grid-cols-[1fr_1fr_auto]">
								<Input
									value={newOptionTypeName}
									onChange={(event) => setNewOptionTypeName(event.target.value)}
									placeholder="Option type name, e.g. Color"
								/>
								<Input
									value={newOptionTypeValues}
									onChange={(event) =>
										setNewOptionTypeValues(event.target.value)
									}
									placeholder="Comma-separated values, e.g. Black, White"
								/>
								<Button onClick={() => void handleCreateOptionType()}>
									Add option
								</Button>
							</div>

							{resolvedOptionTypes.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									Save the product, then add option types to start generating
									variants.
								</p>
							) : (
								resolvedOptionTypes.map((optionType) => (
									<div
										key={optionType.id}
										className="rounded-2xl border border-border p-4"
									>
										<div className="flex flex-wrap items-center gap-3">
											<Input
												value={
													optionTypeDrafts[optionType.id] ?? optionType.name
												}
												onChange={(event) =>
													setOptionTypeDrafts((current) => ({
														...current,
														[optionType.id]: event.target.value,
													}))
												}
												className="max-w-sm"
											/>
											<Button
												variant="outline"
												onClick={() =>
													handleRequestSaveOptionType(optionType.id)
												}
											>
												Save
											</Button>
											<Button
												variant="outline"
												onClick={() =>
													handleRequestDeleteOptionType(optionType.id)
												}
											>
												Delete
											</Button>
										</div>

										<div className="mt-4 space-y-3">
											{(optionType.values ?? []).map((value) => (
												<div
													key={value.id}
													className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 md:grid-cols-[1fr_auto_auto]"
												>
													<Input
														value={optionValueDrafts[value.id] ?? value.label}
														onChange={(event) =>
															setOptionValueDrafts((current) => ({
																...current,
																[value.id]: event.target.value,
															}))
														}
													/>
													<Button
														variant="outline"
														onClick={() =>
															handleRequestSaveOptionValue(
																optionType.id,
																value.id,
															)
														}
													>
														Save
													</Button>
													<Button
														variant="outline"
														onClick={() =>
															void handleDeleteOptionValue(
																optionType.id,
																value.id,
															)
														}
													>
														Delete
													</Button>
												</div>
											))}
										</div>

										<div className="mt-4 flex flex-wrap gap-3">
											<Input
												value={newValueDrafts[optionType.id] ?? ""}
												onChange={(event) =>
													setNewValueDrafts((current) => ({
														...current,
														[optionType.id]: event.target.value,
													}))
												}
												placeholder={`Add ${optionType.name} value`}
												className="max-w-sm"
											/>
											<Button
												variant="outline"
												onClick={() =>
													void handleCreateOptionValue(optionType.id)
												}
											>
												Add value
											</Button>
										</div>
									</div>
								))
							)}
						</div>
					) : (
						<p className="mt-4 text-sm text-muted-foreground">
							Create the product first, then return to define option types and
							generate variants.
						</p>
					)}
				</section>

				<section className="rounded-3xl border border-border bg-card p-6">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="text-lg font-semibold">Variants</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								Manage variant pricing, SKU, stock, and default selection.
							</p>
						</div>
						<div className="flex items-center gap-3">
							{variantModeEnabled && resolvedVariants.length > 0 ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setShowBulkEdit((v) => !v)}
								>
									{showBulkEdit ? "Hide bulk edit" : "Bulk edit"}
								</Button>
							) : null}
							{variantModeEnabled ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										setShowSingleVariantForm((v) => !v)
									}
								>
									{showSingleVariantForm ? "Cancel" : "Create variant"}
								</Button>
							) : null}
							<div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
								{resolvedVariants.length} variants
							</div>
						</div>
					</div>

					{/* Single Variant Creation Form */}
					{variantModeEnabled && showSingleVariantForm ? (
						<div className="mt-5 rounded-2xl border border-dashed border-border p-4">
							<h3 className="text-sm font-semibold text-foreground">
								Create single variant
							</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								Manually add one variant with custom option selections.
							</p>

							{resolvedOptionTypes.length > 0 ? (
								<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{resolvedOptionTypes.map((ot) => (
										<div key={ot.id} className="grid gap-1.5">
											<label className="text-xs font-medium text-muted-foreground">
												{ot.name}
											</label>
											<select
												className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
												value={
													singleVariantSelections[ot.id]?.valueId ?? ""
												}
												onChange={(e) => {
													const val = (ot.values ?? []).find(
														(v) => v.id === e.target.value,
													);
													setSingleVariantSelections((prev) =>
														val
															? {
																	...prev,
																	[ot.id]: {
																		valueId: val.id,
																		valueLabel: val.label,
																	},
																}
															: (() => {
																	const next = { ...prev };
																	delete next[ot.id];
																	return next;
																})(),
													);
												}}
											>
												<option value="">-- Select --</option>
												{(ot.values ?? []).map((val) => (
													<option key={val.id} value={val.id}>
														{val.label}
													</option>
												))}
											</select>
										</div>
									))}
								</div>
							) : null}

							<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
								<Input
									value={singleVariantTitle}
									onChange={(e) => setSingleVariantTitle(e.target.value)}
									placeholder="Variant title"
								/>
								<Input
									value={singleVariantSku}
									onChange={(e) => setSingleVariantSku(e.target.value)}
									placeholder="SKU"
								/>
								<Input
									type="number"
									step="0.01"
									value={singleVariantPrice}
									onChange={(e) =>
										setSingleVariantPrice(e.target.value)
									}
									placeholder="Price"
								/>
								<Input
									type="number"
									step="0.01"
									value={singleVariantSalePrice}
									onChange={(e) =>
										setSingleVariantSalePrice(e.target.value)
									}
									placeholder="Sale price"
								/>
								<Input
									type="number"
									value={singleVariantStock}
									onChange={(e) =>
										setSingleVariantStock(e.target.value)
									}
									placeholder="Stock"
								/>
							</div>
							<div className="mt-4">
								<MediaPicker
									label="Variant image"
									allowedTypes={["image"]}
									selectedId={singleVariantMediaId}
									onSelect={(mediaId) => setSingleVariantMediaId(mediaId)}
									onClear={() => setSingleVariantMediaId(undefined)}
								/>
							</div>
							<div className="mt-4">
								<Button
									onClick={() => void handleCreateSingleVariant()}
									disabled={isCreatingVariant}
								>
									{isCreatingVariant
										? "Creating..."
										: "Create variant"}
								</Button>
							</div>
						</div>
					) : null}

					{/* Bulk Edit */}
					{variantModeEnabled &&
					showBulkEdit &&
					resolvedVariants.length > 0 ? (
						<div className="mt-5 rounded-2xl border border-dashed border-border p-4">
							<h3 className="text-sm font-semibold text-foreground">
								Bulk edit variants
							</h3>
							<p className="mt-1 text-xs text-muted-foreground">
								{selectedVariantIds.size > 0
									? `Applying to ${selectedVariantIds.size} selected variant${selectedVariantIds.size === 1 ? "" : "s"}.`
									: `Applying to all ${resolvedVariants.length} variants. Select individual variants below to narrow the scope.`}
							</p>
							<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
								<div className="grid gap-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Price
									</label>
									<Input
										type="number"
										step="0.01"
										value={bulkEditFields.price}
										onChange={(e) =>
											setBulkEditFields((prev) => ({
												...prev,
												price: e.target.value,
											}))
										}
										placeholder="Set price for all"
									/>
								</div>
								<div className="grid gap-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Sale price
									</label>
									<Input
										type="number"
										step="0.01"
										value={bulkEditFields.salePrice}
										onChange={(e) =>
											setBulkEditFields((prev) => ({
												...prev,
												salePrice: e.target.value,
											}))
										}
										placeholder="Set sale price for all"
									/>
								</div>
								<div className="grid gap-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										SKU
									</label>
									<Input
										value={bulkEditFields.skuPrefix}
										onChange={(e) =>
											setBulkEditFields((prev) => ({
												...prev,
												skuPrefix: e.target.value,
											}))
										}
										placeholder="Set SKU for all"
									/>
								</div>
								<div className="grid gap-1.5">
									<label className="text-xs font-medium text-muted-foreground">
										Stock quantity
									</label>
									<Input
										type="number"
										value={bulkEditFields.stockQuantity}
										onChange={(e) =>
											setBulkEditFields((prev) => ({
												...prev,
												stockQuantity: e.target.value,
											}))
										}
										placeholder="Set stock for all"
									/>
								</div>
							</div>
							<div className="mt-4">
								<Button
									variant="outline"
									onClick={handleBulkEditApply}
								>
									Apply to drafts
								</Button>
							</div>
						</div>
					) : null}

					{!variantModeEnabled ? (
						<p className="mt-4 text-sm text-muted-foreground">
							Variants are available after the product has been created.
						</p>
					) : resolvedVariants.length === 0 ? (
						<p className="mt-4 text-sm text-muted-foreground">
							No variants yet. Add option types above, then generate
							combinations or create one manually.
						</p>
					) : (
						<div className="mt-5 space-y-4">
							{/* Select all checkbox */}
							{showBulkEdit ? (
								<div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-4 py-2">
									<input
										type="checkbox"
										checked={
											selectedVariantIds.size ===
											resolvedVariants.length
										}
										onChange={handleToggleAllVariants}
									/>
									<span className="text-xs font-medium text-muted-foreground">
										{selectedVariantIds.size ===
										resolvedVariants.length
											? "Deselect all"
											: "Select all"}
									</span>
								</div>
							) : null}

							{resolvedVariants.map((variant) => {
								const draft =
									variantDrafts[variant._id] ?? buildVariantDraft(variant);
								const isExpanded = expandedVariants.has(variant._id);
								const hasSaleSchedule = showSaleSchedule.has(variant._id);

								return (
									<div
										key={variant._id}
										className="rounded-2xl border border-border p-4"
									>
										{/* Header row */}
										<div className="flex flex-wrap items-center justify-between gap-3">
											<div className="flex items-center gap-3">
												{showBulkEdit ? (
													<input
														type="checkbox"
														checked={selectedVariantIds.has(
															variant._id,
														)}
														onChange={() =>
															handleToggleVariantSelection(
																variant._id,
															)
														}
													/>
												) : null}
												<button
													type="button"
													className="flex items-center gap-2 text-left"
													onClick={() =>
														setExpandedVariants((prev) => {
															const next = new Set(prev);
															if (next.has(variant._id)) {
																next.delete(variant._id);
															} else {
																next.add(variant._id);
															}
															return next;
														})
													}
												>
													{isExpanded ? (
														<ChevronUp className="h-4 w-4 text-muted-foreground" />
													) : (
														<ChevronDown className="h-4 w-4 text-muted-foreground" />
													)}
													<div>
														<p className="font-medium text-foreground">
															{variant.optionSummary}
														</p>
														<p className="mt-1 text-xs text-muted-foreground">
															{variant.isDefault
																? "Default variant"
																: "Secondary variant"}
															{draft.status === "draft"
																? " \u00b7 Disabled"
																: ""}
														</p>
													</div>
												</button>
											</div>
											<div className="flex flex-wrap gap-2">
												{!variant.isDefault ? (
													<Button
														variant="outline"
														onClick={() =>
															void handleSetDefaultVariant(variant._id)
														}
													>
														Make default
													</Button>
												) : null}
												<Button
													variant="outline"
													onClick={() =>
														handleRequestDeleteVariant(variant._id)
													}
												>
													Delete
												</Button>
											</div>
										</div>

										{/* Core fields (always visible) */}
										<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
											<Input
												value={draft.title}
												onChange={(event) =>
													setVariantDraftField(
														variant._id,
														"title",
														event.target.value,
													)
												}
												placeholder="Variant title"
											/>
											<Input
												value={draft.sku}
												onChange={(event) =>
													setVariantDraftField(
														variant._id,
														"sku",
														event.target.value,
													)
												}
												placeholder="Variant SKU"
											/>
											<Input
												type="number"
												step="0.01"
												value={draft.price}
												onChange={(event) =>
													setVariantDraftField(
														variant._id,
														"price",
														event.target.value,
													)
												}
												placeholder="Base price"
											/>
											<Input
												type="number"
												step="0.01"
												value={draft.salePrice}
												onChange={(event) =>
													setVariantDraftField(
														variant._id,
														"salePrice",
														event.target.value,
													)
												}
												placeholder="Sale price"
											/>
											<Input
												type="number"
												value={draft.stockQuantity}
												onChange={(event) =>
													setVariantDraftField(
														variant._id,
														"stockQuantity",
														event.target.value,
													)
												}
												placeholder="Stock"
											/>
										</div>

										<div className="mt-3">
											<MediaPicker
												label="Variant image"
												allowedTypes={["image"]}
												selectedId={
													variantMediaDrafts[variant._id] !== undefined
														? variantMediaDrafts[variant._id]
															? variantMediaDrafts[variant._id] ?? undefined
															: undefined
														: variant.featuredMediaId
												}
												onSelect={(mediaId) =>
													setVariantMediaDrafts((prev) => ({
														...prev,
														[variant._id]: mediaId,
													}))
												}
												onClear={() =>
													setVariantMediaDrafts((prev) => ({
														...prev,
														[variant._id]: null,
													}))
												}
											/>
										</div>

										{/* Expanded detail sections */}
										{isExpanded ? (
											<div className="mt-4 space-y-4">
												{/* ---- Status section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Status
													</h4>
													<div className="mt-3 flex items-center gap-3">
														<label className="flex items-center gap-2 text-sm">
															<input
																type="checkbox"
																checked={draft.status === "publish" || draft.status === "private"}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"status",
																		e.target.checked ? "publish" : "draft",
																	)
																}
															/>
															Enabled
														</label>
														<span className="text-xs text-muted-foreground">
															{draft.status === "publish"
																? "Published"
																: draft.status === "private"
																	? "Private"
																	: "Disabled (draft)"}
														</span>
													</div>
												</div>

												{/* ---- Pricing section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Pricing
													</h4>
													<div className="mt-3">
														<button
															type="button"
															className="text-xs font-medium text-primary hover:underline"
															onClick={() =>
																setShowSaleSchedule((prev) => {
																	const next = new Set(prev);
																	if (next.has(variant._id)) {
																		next.delete(variant._id);
																	} else {
																		next.add(variant._id);
																	}
																	return next;
																})
															}
														>
															{hasSaleSchedule
																? "Hide sale schedule"
																: "Schedule sale"}
														</button>
														{hasSaleSchedule ? (
															<div className="mt-3 grid gap-3 sm:grid-cols-2">
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Sale price from
																	</label>
																	<Input
																		type="datetime-local"
																		value={draft.salePriceFrom}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"salePriceFrom",
																				e.target.value,
																			)
																		}
																	/>
																</div>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Sale price to
																	</label>
																	<Input
																		type="datetime-local"
																		value={draft.salePriceTo}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"salePriceTo",
																				e.target.value,
																			)
																		}
																	/>
																</div>
															</div>
														) : null}
													</div>
												</div>

												{/* ---- Inventory section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Inventory
													</h4>
													<div className="mt-3 grid gap-3">
														<div className="grid gap-1.5">
															<label className="text-xs font-medium text-muted-foreground">
																Manage stock
															</label>
															<select
																className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
																value={draft.manageStock}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"manageStock",
																		e.target.value,
																	)
																}
															>
																<option value="parent">
																	Use parent setting
																</option>
																<option value="yes">
																	Track stock for this variant
																</option>
																<option value="no">
																	Don't track
																</option>
															</select>
														</div>

														{draft.manageStock === "yes" ? (
															<>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Low stock threshold
																	</label>
																	<Input
																		type="number"
																		min="0"
																		value={draft.lowStockAmount}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"lowStockAmount",
																				e.target.value,
																			)
																		}
																		placeholder="Leave blank to use store default"
																	/>
																</div>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Allow backorders
																	</label>
																	<select
																		className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
																		value={draft.backorders}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"backorders",
																				e.target.value,
																			)
																		}
																	>
																		<option value="no">
																			Do not allow
																		</option>
																		<option value="yes">
																			Allow
																		</option>
																		<option value="notify">
																			Allow, but notify customer
																		</option>
																	</select>
																</div>
															</>
														) : null}

														{draft.manageStock === "no" ? (
															<div className="grid gap-1.5">
																<label className="text-xs font-medium text-muted-foreground">
																	Stock status
																</label>
																<select
																	className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
																	value={draft.stockStatus}
																	onChange={(e) =>
																		setVariantDraftField(
																			variant._id,
																			"stockStatus",
																			e.target.value,
																		)
																	}
																>
																	<option value="instock">
																		In stock
																	</option>
																	<option value="outofstock">
																		Out of stock
																	</option>
																	<option value="onbackorder">
																		On backorder
																	</option>
																</select>
															</div>
														) : null}
													</div>
												</div>

												{/* ---- Shipping section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Shipping
													</h4>
													<div className="mt-3 grid gap-3">
														<label className="flex items-center gap-2 text-sm">
															<input
																type="checkbox"
																checked={draft.isVirtual}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"isVirtual",
																		e.target.checked,
																	)
																}
															/>
															Virtual (no shipping needed)
														</label>

														{!draft.isVirtual ? (
															<>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Weight
																	</label>
																	<Input
																		value={draft.weight}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"weight",
																				e.target.value,
																			)
																		}
																		placeholder="e.g. 1.5"
																	/>
																</div>
																<div className="grid gap-3 sm:grid-cols-3">
																	<div className="grid gap-1.5">
																		<label className="text-xs font-medium text-muted-foreground">
																			Length (in)
																		</label>
																		<Input
																			value={
																				draft.shippingLengthIn
																			}
																			onChange={(e) =>
																				setVariantDraftField(
																					variant._id,
																					"shippingLengthIn",
																					e.target.value,
																				)
																			}
																			placeholder="0"
																		/>
																	</div>
																	<div className="grid gap-1.5">
																		<label className="text-xs font-medium text-muted-foreground">
																			Width (in)
																		</label>
																		<Input
																			value={
																				draft.shippingWidthIn
																			}
																			onChange={(e) =>
																				setVariantDraftField(
																					variant._id,
																					"shippingWidthIn",
																					e.target.value,
																				)
																			}
																			placeholder="0"
																		/>
																	</div>
																	<div className="grid gap-1.5">
																		<label className="text-xs font-medium text-muted-foreground">
																			Height (in)
																		</label>
																		<Input
																			value={
																				draft.shippingHeightIn
																			}
																			onChange={(e) =>
																				setVariantDraftField(
																					variant._id,
																					"shippingHeightIn",
																					e.target.value,
																				)
																			}
																			placeholder="0"
																		/>
																	</div>
																</div>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Shipping class
																	</label>
																	<Input
																		value={draft.shippingClassId}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"shippingClassId",
																				e.target.value,
																			)
																		}
																		placeholder="Shipping class ID"
																	/>
																</div>
															</>
														) : null}
													</div>
												</div>

												{/* ---- Downloadable section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Downloads
													</h4>
													<div className="mt-3 grid gap-3">
														<label className="flex items-center gap-2 text-sm">
															<input
																type="checkbox"
																checked={draft.isDownloadable}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"isDownloadable",
																		e.target.checked,
																	)
																}
															/>
															Downloadable
														</label>
														{draft.isDownloadable ? (
															<div className="grid gap-3 sm:grid-cols-2">
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Download limit
																	</label>
																	<Input
																		type="number"
																		min="-1"
																		value={draft.downloadLimit}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"downloadLimit",
																				e.target.value,
																			)
																		}
																		placeholder="Unlimited"
																	/>
																	<p className="text-[0.7rem] text-muted-foreground">
																		Leave blank for unlimited. Use -1 for
																		unlimited.
																	</p>
																</div>
																<div className="grid gap-1.5">
																	<label className="text-xs font-medium text-muted-foreground">
																		Download expiry (days)
																	</label>
																	<Input
																		type="number"
																		min="-1"
																		value={draft.downloadExpiry}
																		onChange={(e) =>
																			setVariantDraftField(
																				variant._id,
																				"downloadExpiry",
																				e.target.value,
																			)
																		}
																		placeholder="Never expires"
																	/>
																	<p className="text-[0.7rem] text-muted-foreground">
																		Leave blank for no expiry. Use -1 for
																		never.
																	</p>
																</div>
															</div>
														) : null}
													</div>
												</div>

												{/* ---- Other section ---- */}
												<div className="rounded-xl border border-border bg-muted/10 p-4">
													<h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
														Other
													</h4>
													<div className="mt-3 grid gap-3">
														<div className="grid gap-1.5">
															<label className="text-xs font-medium text-muted-foreground">
																GTIN / UPC / EAN / ISBN
															</label>
															<Input
																value={draft.globalUniqueId}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"globalUniqueId",
																		e.target.value,
																	)
																}
																placeholder="Global unique identifier"
															/>
														</div>
														<div className="grid gap-1.5">
															<label className="text-xs font-medium text-muted-foreground">
																Tax class
															</label>
															<Input
																value={draft.taxClass}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"taxClass",
																		e.target.value,
																	)
																}
																placeholder="Same as parent"
															/>
															<p className="text-[0.7rem] text-muted-foreground">
																Leave blank for "Same as parent". Enter
																"standard", "reduced-rate", etc.
															</p>
														</div>
														<div className="grid gap-1.5">
															<label className="text-xs font-medium text-muted-foreground">
																Menu order
															</label>
															<Input
																type="number"
																value={draft.menuOrder}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"menuOrder",
																		e.target.value,
																	)
																}
																placeholder="0"
															/>
														</div>
														<div className="grid gap-1.5">
															<label className="text-xs font-medium text-muted-foreground">
																Description
															</label>
															<Textarea
																rows={3}
																value={draft.description}
																onChange={(e) =>
																	setVariantDraftField(
																		variant._id,
																		"description",
																		e.target.value,
																	)
																}
																placeholder="Variant-specific description"
															/>
														</div>
													</div>
												</div>
											</div>
										) : null}

										<div className="mt-4">
											<Button
												variant="outline"
												onClick={() => void handleSaveVariant(variant._id)}
											>
												Save variant
											</Button>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				<div className="space-y-6">
					<section className="rounded-3xl border border-border bg-card p-6">
						<h2 className="text-lg font-semibold">Catalog</h2>
						<div className="mt-4 grid gap-4">
							<div className="grid gap-2">
								<label
									className="text-sm font-medium"
									htmlFor="commerce-product-sku"
								>
									SKU
								</label>
								<Input
									id="commerce-product-sku"
									value={sku}
									onChange={(event) => setSku(event.target.value)}
									placeholder="SKU-1001"
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="grid gap-2">
									<label
										className="text-sm font-medium"
										htmlFor="commerce-product-price"
									>
										Base price
									</label>
									<Input
										id="commerce-product-price"
										type="number"
										step="0.01"
										value={basePrice}
										onChange={(event) => setBasePrice(event.target.value)}
										placeholder="49.00"
									/>
								</div>
								<div className="grid gap-2">
									<label
										className="text-sm font-medium"
										htmlFor="commerce-product-sale-price"
									>
										Sale price
									</label>
									<Input
										id="commerce-product-sale-price"
										type="number"
										step="0.01"
										value={salePrice}
										onChange={(event) => setSalePrice(event.target.value)}
										placeholder="39.00"
									/>
								</div>
							</div>
							<div className="grid gap-2">
								<label
									className="text-sm font-medium"
									htmlFor="commerce-product-status"
								>
									Status
								</label>
								<select
									id="commerce-product-status"
									value={status}
									onChange={(event) => {
										const nextStatus = event.target.value;
										if (
											nextStatus === "draft" ||
											nextStatus === "publish" ||
											nextStatus === "private"
										) {
											setStatus(nextStatus);
										}
									}}
									className="h-9 rounded-4xl border border-input bg-input/30 px-3 text-sm outline-hidden"
								>
									<option value="draft">Draft</option>
									<option value="publish">Published</option>
									<option value="private">Private</option>
								</select>
							</div>
						</div>
					</section>

					<section className="rounded-3xl border border-border bg-card p-6">
						<h2 className="text-lg font-semibold">Inventory & delivery</h2>
						<div className="mt-4 grid gap-3">
							<label className="flex items-center gap-3 text-sm">
								<input
									type="checkbox"
									checked={trackInventory}
									onChange={(event) => setTrackInventory(event.target.checked)}
								/>
								Track inventory
							</label>
							{trackInventory ? (
								<div className="grid gap-2">
									<label
										className="text-sm font-medium"
										htmlFor="commerce-product-stock"
									>
										Stock quantity
									</label>
									<Input
										id="commerce-product-stock"
										type="number"
										value={stockQuantity}
										onChange={(event) => setStockQuantity(event.target.value)}
										placeholder="25"
									/>
								</div>
							) : null}
							{!isVirtual ? (
								<div className="grid gap-2">
									<label
										className="text-sm font-medium"
										htmlFor="commerce-product-weight"
									>
										Shipping weight (oz)
									</label>
									<Input
										id="commerce-product-weight"
										type="number"
										min="0"
										step="1"
										value={shippingWeightOz}
										onChange={(event) =>
											setShippingWeightOz(event.target.value)
										}
										placeholder="16"
									/>
								</div>
							) : null}
							<label className="flex items-center gap-3 text-sm">
								<input
									type="checkbox"
									checked={allowBackorders}
									onChange={(event) => setAllowBackorders(event.target.checked)}
								/>
								Allow backorders
							</label>
							<label className="flex items-center gap-3 text-sm">
								<input
									type="checkbox"
									checked={isVirtual}
									onChange={(event) => setIsVirtual(event.target.checked)}
								/>
								Virtual product
							</label>
							<label className="flex items-center gap-3 text-sm">
								<input
									type="checkbox"
									checked={isDownloadable}
									onChange={(event) => setIsDownloadable(event.target.checked)}
								/>
								Downloadable product
							</label>
							{mode === "edit" ? (
								<div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-sm">
									<p className="font-medium text-foreground">
										Current stock state
									</p>
									<p className="mt-1 text-muted-foreground">
										{trackInventory
											? `Tracked stock: ${product?.stockQuantity ?? 0}`
											: "Inventory tracking is disabled for this product."}
									</p>
									{product?.inventoryAdjustments?.length ? (
										<div className="mt-4 space-y-2">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
												Recent adjustments
											</p>
											{product.inventoryAdjustments.map((adjustment) => (
												<div
													key={adjustment._id}
													className="rounded-xl border border-border bg-background px-3 py-2"
												>
													<div className="flex items-center justify-between gap-3">
														<span className="font-medium text-foreground">
															{adjustment.adjustmentType}
														</span>
														<span className="text-muted-foreground">
															{adjustment.quantityDelta > 0 ? "+" : ""}
															{adjustment.quantityDelta}
														</span>
													</div>
													<p className="mt-1 text-xs text-muted-foreground">
														{adjustment.reason || "No reason provided"} •{" "}
														{new Date(adjustment.createdAt).toLocaleString()}
													</p>
												</div>
											))}
										</div>
									) : null}
								</div>
							) : null}
						</div>
					</section>

					<section className="rounded-3xl border border-border bg-card p-6">
						<div className="flex items-center justify-between gap-3">
							<h2 className="text-lg font-semibold">Categories</h2>
							<Link
								to="/commerce/categories"
								className="text-sm text-primary hover:underline"
							>
								Manage
							</Link>
						</div>
						<div className="mt-4 space-y-3">
							{categories.length === 0 ? (
								<p className="text-sm text-muted-foreground">
									No categories yet. Create one first.
								</p>
							) : (
								categories.map((category) => (
									<label
										key={category._id}
										className="flex items-start gap-3 text-sm"
									>
										<input
											type="checkbox"
											checked={selectedCategoryIds.includes(category._id)}
											onChange={() => handleCategoryToggle(category._id)}
										/>
										<div>
											<div className="font-medium text-foreground">
												{category.name}
											</div>
											{category.description ? (
												<div className="text-xs text-muted-foreground">
													{category.description}
												</div>
											) : null}
										</div>
									</label>
								))
							)}
						</div>
					</section>

					<section className="rounded-3xl border border-border bg-card p-6">
						<h2 className="text-lg font-semibold">Product image</h2>
						<div className="mt-4">
							<MediaPicker
								label="Featured Image"
								allowedTypes={["image"]}
								selectedId={featuredMediaId}
								onSelect={(mediaId) => setFeaturedMediaId(mediaId)}
								onClear={() => setFeaturedMediaId(undefined)}
							/>
						</div>
					</section>

					<section className="rounded-3xl border border-border bg-card p-6">
						<h2 className="text-lg font-semibold">Product gallery</h2>
						<div className="mt-4 space-y-2">
							{galleryMediaIds.map((mediaId, index) => (
								<MediaPicker
									key={mediaId}
									label={`Gallery image ${index + 1}`}
									allowedTypes={["image"]}
									selectedId={mediaId}
									onSelect={(newId) => {
										setGalleryMediaIds((prev) =>
											prev.map((id, i) => (i === index ? newId : id)),
										);
									}}
									onClear={() => {
										setGalleryMediaIds((prev) =>
											prev.filter((_, i) => i !== index),
										);
									}}
								/>
							))}
							<MediaPicker
								label="Add gallery image"
								allowedTypes={["image"]}
								onSelect={(mediaId) => {
									setGalleryMediaIds((prev) => [...prev, mediaId]);
								}}
							/>
						</div>
					</section>

					{variantModeEnabled ? (
						<section className="rounded-3xl border border-border bg-card p-6">
							<div className="flex items-start justify-between gap-4">
								<div>
									<h2 className="text-lg font-semibold">Variant integrity</h2>
									<p className="mt-1 text-sm text-muted-foreground">
										Product-scoped audit of normalized selections, defaults, and
										downstream references.
									</p>
								</div>
								<div
									className={`rounded-full px-3 py-1 text-xs font-medium ${
										integrityIssueTotal > 0
											? "bg-amber-100 text-amber-900"
											: "bg-emerald-100 text-emerald-800"
									}`}
								>
									{variantIntegrity === undefined
										? "Loading"
										: integrityIssueTotal > 0
											? `${integrityIssueTotal} issues`
											: "Healthy"}
								</div>
							</div>

							{variantIntegrity === undefined ? (
								<div className="mt-4 h-32 animate-pulse rounded-2xl bg-muted" />
							) : (
								<>
									<div className="mt-4 grid gap-3 sm:grid-cols-3">
										<div className="rounded-2xl border border-border bg-muted/20 p-4">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
												Products checked
											</p>
											<p className="mt-2 text-2xl font-semibold text-foreground">
												{variantIntegrity.totals.products ?? 0}
											</p>
										</div>
										<div className="rounded-2xl border border-border bg-muted/20 p-4">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
												Variants checked
											</p>
											<p className="mt-2 text-2xl font-semibold text-foreground">
												{variantIntegrity.totals.variants ?? 0}
											</p>
										</div>
										<div className="rounded-2xl border border-border bg-muted/20 p-4">
											<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
												Open issues
											</p>
											<p className="mt-2 text-2xl font-semibold text-foreground">
												{integrityIssueTotal}
											</p>
										</div>
									</div>

									{integrityRows.length === 0 ? (
										<div className="mt-4 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
											No variant integrity issues are currently detected for
											this product.
										</div>
									) : (
										<div className="mt-4 space-y-3">
											{integrityRows.map((row) => (
												<div
													key={row.label}
													className="rounded-2xl border border-border p-4"
												>
													<div className="flex items-center justify-between gap-3">
														<p className="font-medium text-foreground">
															{row.label}
														</p>
														<span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
															{row.count}
														</span>
													</div>
													{(variantIntegrity.samples[row.sampleKey] ?? [])
														.length > 0 ? (
														<div className="mt-3 space-y-2">
															{(variantIntegrity.samples[row.sampleKey] ?? [])
																.slice(0, 3)
																.map((sample) => (
																	<pre
																		key={`${row.label}-${JSON.stringify(sample)}`}
																		className="overflow-x-auto rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground"
																	>
																		{JSON.stringify(sample, null, 2)}
																	</pre>
																))}
														</div>
													) : null}
												</div>
											))}
										</div>
									)}

									<div className="mt-4 flex flex-wrap gap-3">
										<Button
											variant="outline"
											onClick={() => void handleRepairPreview()}
											disabled={isRepairPreviewing || isRepairApplying}
										>
											{isRepairPreviewing
												? "Running dry run..."
												: "Preview repair"}
										</Button>
										<Button
											variant="destructive"
											onClick={() => setRepairDialogOpen(true)}
											disabled={
												isRepairPreviewing ||
												isRepairApplying ||
												integrityIssueTotal === 0
											}
										>
											Apply repair
										</Button>
									</div>
								</>
							)}
						</section>
					) : null}
				</div>
			</div>

			<ConfirmDialog
				open={repairDialogOpen}
				onClose={() => {
					if (!isRepairApplying) {
						setRepairDialogOpen(false);
					}
				}}
				onConfirm={() => void handleApplyRepair()}
				title="Apply variant integrity repair?"
				message="This runs the scoped repair mutation for the current product. Deterministic fixes such as default reassignment, product type promotion, selection backfill, and selection key repair will be written immediately."
				confirmLabel="Apply repair"
				destructive
				isExecuting={isRepairApplying}
			/>

			{/* Delete option type confirmation */}
			<ConfirmDialog
				open={deleteOptionTypeConfirm.open}
				onClose={() =>
					setDeleteOptionTypeConfirm((prev) => ({
						...prev,
						open: false,
					}))
				}
				onConfirm={() => {
					void handleDeleteOptionType(
						deleteOptionTypeConfirm.optionTypeId,
					);
					setDeleteOptionTypeConfirm((prev) => ({
						...prev,
						open: false,
					}));
				}}
				title={`Delete option type "${deleteOptionTypeConfirm.optionTypeName}"?`}
				message={
					deleteOptionTypeConfirm.affectedCount > 0
						? `This option type is currently used by ${deleteOptionTypeConfirm.affectedCount} variant${deleteOptionTypeConfirm.affectedCount === 1 ? "" : "s"}. The backend will block deletion while variants reference it. Remove or regenerate affected variants first.`
						: `This will permanently remove the "${deleteOptionTypeConfirm.optionTypeName}" option type and all its values from this product.`
				}
				confirmLabel="Delete option type"
				destructive
			/>

			{/* Delete variant confirmation */}
			<ConfirmDialog
				open={deleteVariantConfirm.open}
				onClose={() =>
					setDeleteVariantConfirm((prev) => ({
						...prev,
						open: false,
					}))
				}
				onConfirm={() => {
					void handleDeleteVariant(deleteVariantConfirm.variantId);
					setDeleteVariantConfirm((prev) => ({
						...prev,
						open: false,
					}));
				}}
				title={`Delete variant "${deleteVariantConfirm.variantTitle}"?`}
				message={
					deleteVariantConfirm.isDefault
						? "This is the default variant. The backend requires you to reassign the default to another variant before deleting this one."
						: "This will permanently delete this variant. If it is referenced by cart items, orders, or other records, the backend will block the deletion and list the references."
				}
				confirmLabel="Delete variant"
				destructive
			/>

			{/* Rename warning */}
			<ConfirmDialog
				open={renameWarning.open}
				onClose={() =>
					setRenameWarning((prev) => ({ ...prev, open: false }))
				}
				onConfirm={handleConfirmRename}
				title={`Rename ${renameWarning.type === "optionType" ? "option type" : "option value"}?`}
				message={`Renaming "${renameWarning.oldName}" to "${renameWarning.newName}" will update the option summary on ${renameWarning.affectedCount} variant${renameWarning.affectedCount === 1 ? "" : "s"}.`}
				confirmLabel="Rename"
			/>
		</div>
	);
}
