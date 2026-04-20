/**
 * Pure variant helper functions extracted from products.ts and migrations.ts.
 * These have no Convex runtime dependencies and are fully unit-testable.
 *
 * ## Variant System Invariants
 *
 * 1. **Default variant**: Every variable product must have exactly one default
 *    variant. The first created variant is auto-defaulted. Changing default
 *    unsets siblings atomically. Cannot unset default if no other variant exists.
 *
 * 2. **Selection key uniqueness**: No two variants of the same product may share
 *    the same selectionKey. Keys are computed from optionTypeId:optionValueId
 *    pairs joined by pipe. Enforced at create/update/generate time.
 *
 * 3. **Selections match option model**: Each variant's selections must include
 *    exactly one value for each of the product's optionTypes. Option type IDs
 *    and value IDs must reference existing entries in the product's optionTypes
 *    JSON field.
 *
 * 4. **Product type consistency**: Products with variants must have
 *    productType === "variable". Deleting the last variant reverts to "simple".
 *    Creating a variant promotes to "variable".
 *
 * 5. **Reference integrity**: Variants cannot be deleted while referenced by
 *    cart items, order items, wishlist items, digital files, license keys,
 *    bundle components, subscription items, return items, stock reservations,
 *    or inventory adjustments.
 *
 * 6. **Option rename propagation**: Renaming an option type or value updates
 *    all variant selections' optionTypeName/optionValueLabel, regenerates
 *    optionSummary text, and recomputes selectionKey.
 */

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

export interface VariantSelection {
  optionTypeId: string;
  optionTypeName: string;
  optionValueId: string;
  optionValueLabel: string;
  sortOrder: number;
}

export interface OptionValue {
  id: string;
  label: string;
  sortOrder: number;
  active?: boolean;
}

export interface OptionType {
  id: string;
  name: string;
  values: OptionValue[];
  sortOrder: number;
  createdAt?: number;
}

export interface Money {
  amount: number;
  currencyCode: string;
}

export interface VariantRecord {
  _id?: unknown;
  productId?: unknown;
  title?: string;
  sku?: string;
  optionSummary?: string;
  selections?: VariantSelection[];
  selectionKey?: string;
  price?: Money;
  salePrice?: Money;
  stockQuantity?: number;
  isDefault?: boolean;
  createdAt?: number;
}

// ────────────────────────────────────────────────────────────────────
// Selection normalization
// ────────────────────────────────────────────────────────────────────

export function normalizeVariantSelections(
  selections: VariantSelection[] | undefined,
): VariantSelection[] | undefined {
  if (!selections?.length) return undefined;
  return [...selections]
    .map((selection, index) => ({
      optionTypeId: selection.optionTypeId,
      optionTypeName: selection.optionTypeName,
      optionValueId: selection.optionValueId,
      optionValueLabel: selection.optionValueLabel,
      sortOrder: selection.sortOrder ?? index,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ────────────────────────────────────────────────────────────────────
// Selection key generation
// ────────────────────────────────────────────────────────────────────

export function buildSelectionKey(
  selections: VariantSelection[] | undefined,
): string | undefined {
  if (!selections?.length) return undefined;
  return selections
    .map((selection) => `${selection.optionTypeId}:${selection.optionValueId}`)
    .join("|");
}

// ────────────────────────────────────────────────────────────────────
// Option summary
// ────────────────────────────────────────────────────────────────────

export function buildOptionSummaryFromSelections(
  selections: VariantSelection[] | undefined,
): string {
  if (!selections?.length) return "";
  return selections
    .map((selection) => `${selection.optionTypeName}: ${selection.optionValueLabel}`)
    .join(" / ");
}

// ────────────────────────────────────────────────────────────────────
// Name normalization (case-insensitive comparison)
// ────────────────────────────────────────────────────────────────────

export function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

// ────────────────────────────────────────────────────────────────────
// Variant selection validation
// ────────────────────────────────────────────────────────────────────

export interface ValidationError {
  code: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; selections: VariantSelection[] }
  | { ok: false; error: ValidationError };

/**
 * Validates variant selections against a product's option types.
 * Returns canonical sorted selections or a validation error.
 * This is a pure function — throws no exceptions.
 */
export function validateVariantSelectionsResult(
  optionTypes: OptionType[],
  selections: VariantSelection[] | undefined,
): ValidationResult {
  if (!selections?.length) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Variant selections are required for variable products.",
      },
    };
  }

  const normalizedSelections = normalizeVariantSelections(selections)!;
  const activeOptionTypes = [...optionTypes].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  if (normalizedSelections.length !== activeOptionTypes.length) {
    return {
      ok: false,
      error: {
        code: "validation_error",
        message: "Variant selections must include exactly one value for each option type.",
      },
    };
  }

  const seenTypeIds = new Set<string>();
  for (const selection of normalizedSelections) {
    if (seenTypeIds.has(selection.optionTypeId)) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Variant selections cannot include the same option type more than once.",
        },
      };
    }
    seenTypeIds.add(selection.optionTypeId);

    const optionType = activeOptionTypes.find((c) => c.id === selection.optionTypeId);
    if (!optionType) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Variant selection references an option type that does not exist.",
        },
      };
    }

    const optionValue = (optionType.values ?? []).find(
      (c) => c.id === selection.optionValueId,
    );
    if (!optionValue) {
      return {
        ok: false,
        error: {
          code: "validation_error",
          message: "Variant selection references an option value that does not exist.",
        },
      };
    }
  }

  const canonicalSelections = activeOptionTypes.map((optionType, index) => {
    const selection = normalizedSelections.find(
      (c) => c.optionTypeId === optionType.id,
    )!;
    const optionValue = (optionType.values ?? []).find(
      (c) => c.id === selection.optionValueId,
    )!;
    return {
      optionTypeId: optionType.id,
      optionTypeName: optionType.name,
      optionValueId: optionValue.id,
      optionValueLabel: optionValue.label,
      sortOrder: index,
    };
  });

  return { ok: true, selections: canonicalSelections };
}

// ────────────────────────────────────────────────────────────────────
// Infer selections from option summary string
// ────────────────────────────────────────────────────────────────────

export function inferSelectionsFromOptionSummary(
  optionTypes: OptionType[] | undefined,
  optionSummary: string,
): VariantSelection[] | undefined {
  if (!optionTypes?.length || !optionSummary?.trim()) return undefined;

  const parts = optionSummary
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) return undefined;

  const selections: VariantSelection[] = [];

  for (const part of parts) {
    const [typeNameRaw, valueLabelRaw] = part.split(":").map((s) => s?.trim());
    if (!typeNameRaw || !valueLabelRaw) return undefined;

    const optionType = optionTypes.find(
      (c) => normalizeName(c.name) === normalizeName(typeNameRaw),
    );
    if (!optionType) return undefined;

    const optionValue = (optionType.values ?? []).find(
      (c) => normalizeName(c.label) === normalizeName(valueLabelRaw),
    );
    if (!optionValue) return undefined;

    selections.push({
      optionTypeId: optionType.id,
      optionTypeName: optionType.name,
      optionValueId: optionValue.id,
      optionValueLabel: optionValue.label,
      sortOrder: optionType.sortOrder ?? selections.length,
    });
  }

  if (selections.length !== optionTypes.length) return undefined;

  return normalizeVariantSelections(selections);
}

// ────────────────────────────────────────────────────────────────────
// Display price helper
// ────────────────────────────────────────────────────────────────────

export function getVariantDisplayPrice(variant: VariantRecord | undefined): number {
  if (!variant) return Number.POSITIVE_INFINITY;
  return typeof variant.salePrice?.amount === "number"
    ? variant.salePrice.amount
    : (variant.price?.amount ?? Number.POSITIVE_INFINITY);
}

// ────────────────────────────────────────────────────────────────────
// Option types shape validation
// ────────────────────────────────────────────────────────────────────

export interface OptionTypeValidationIssue {
  path: string;
  message: string;
}

/**
 * Strict runtime validation for the optionTypes JSON shape stored on products.
 * Returns an array of issues (empty = valid).
 */
export function validateOptionTypesShape(
  optionTypes: unknown,
): OptionTypeValidationIssue[] {
  const issues: OptionTypeValidationIssue[] = [];

  if (!Array.isArray(optionTypes)) {
    issues.push({ path: "optionTypes", message: "Must be an array" });
    return issues;
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (let i = 0; i < optionTypes.length; i++) {
    const ot = optionTypes[i];
    const prefix = `optionTypes[${i}]`;

    if (!ot || typeof ot !== "object") {
      issues.push({ path: prefix, message: "Must be an object" });
      continue;
    }

    if (typeof ot.id !== "string" || !ot.id.trim()) {
      issues.push({ path: `${prefix}.id`, message: "Must be a non-empty string" });
    } else if (seenIds.has(ot.id)) {
      issues.push({ path: `${prefix}.id`, message: `Duplicate option type id: ${ot.id}` });
    } else {
      seenIds.add(ot.id);
    }

    if (typeof ot.name !== "string" || !ot.name.trim()) {
      issues.push({ path: `${prefix}.name`, message: "Must be a non-empty string" });
    } else {
      const normalized = normalizeName(ot.name);
      if (seenNames.has(normalized)) {
        issues.push({
          path: `${prefix}.name`,
          message: `Duplicate option type name (case-insensitive): ${ot.name}`,
        });
      } else {
        seenNames.add(normalized);
      }
    }

    if (typeof ot.sortOrder !== "number") {
      issues.push({ path: `${prefix}.sortOrder`, message: "Must be a number" });
    }

    if (!Array.isArray(ot.values)) {
      issues.push({ path: `${prefix}.values`, message: "Must be an array" });
      continue;
    }

    const seenValueIds = new Set<string>();
    const seenValueLabels = new Set<string>();

    for (let j = 0; j < ot.values.length; j++) {
      const val = ot.values[j];
      const valPrefix = `${prefix}.values[${j}]`;

      if (!val || typeof val !== "object") {
        issues.push({ path: valPrefix, message: "Must be an object" });
        continue;
      }

      if (typeof val.id !== "string" || !val.id.trim()) {
        issues.push({ path: `${valPrefix}.id`, message: "Must be a non-empty string" });
      } else if (seenValueIds.has(val.id)) {
        issues.push({ path: `${valPrefix}.id`, message: `Duplicate value id: ${val.id}` });
      } else {
        seenValueIds.add(val.id);
      }

      if (typeof val.label !== "string" || !val.label.trim()) {
        issues.push({ path: `${valPrefix}.label`, message: "Must be a non-empty string" });
      } else {
        const normalizedLabel = normalizeName(val.label);
        if (seenValueLabels.has(normalizedLabel)) {
          issues.push({
            path: `${valPrefix}.label`,
            message: `Duplicate value label (case-insensitive): ${val.label}`,
          });
        } else {
          seenValueLabels.add(normalizedLabel);
        }
      }

      if (typeof val.sortOrder !== "number") {
        issues.push({ path: `${valPrefix}.sortOrder`, message: "Must be a number" });
      }
    }
  }

  return issues;
}

// ────────────────────────────────────────────────────────────────────
// Audit summarization helpers
// ────────────────────────────────────────────────────────────────────

export interface AuditIssueSummary {
  category: string;
  count: number;
  severity: "critical" | "high" | "medium" | "low";
}

/**
 * Summarizes audit totals into a prioritized issue list.
 */
export function summarizeAuditIssues(
  totals: Record<string, number>,
): AuditIssueSummary[] {
  const severityMap: Record<string, "critical" | "high" | "medium" | "low"> = {
    duplicateSelectionKeyGroups: "critical",
    missingVariantRefs: "critical",
    crossProductVariantRefs: "critical",
    variableProductsWithoutDefault: "high",
    variableProductsWithMultipleDefaults: "high",
    variantsWithInvalidSelections: "high",
    variableOrderItemsMissingVariant: "high",
    variableProductsWithMissingVariant: "medium",
    productsWithTypeDrift: "medium",
    variantsMissingSelections: "medium",
    variantsMissingSelectionKey: "low",
    variantsNeedingManualSelectionRepair: "medium",
  };

  const issues: AuditIssueSummary[] = [];

  for (const [category, count] of Object.entries(totals)) {
    if (category === "products" || category === "variants") continue;
    if (count > 0 && severityMap[category]) {
      issues.push({ category, count, severity: severityMap[category] });
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

// ────────────────────────────────────────────────────────────────────
// Repair plan helpers
// ────────────────────────────────────────────────────────────────────

export interface RepairPlanItem {
  action: string;
  description: string;
  count: number;
  automated: boolean;
}

/**
 * Builds a deterministic repair plan from audit totals.
 * Items are ordered by dependency (type promotions first, then selections, then keys, then defaults).
 */
export function buildRepairPlan(
  totals: Record<string, number>,
): RepairPlanItem[] {
  const plan: RepairPlanItem[] = [];

  if ((totals.productsWithTypeDrift ?? 0) > 0) {
    plan.push({
      action: "promote_product_type",
      description: "Promote non-variable products with variants to 'variable' type",
      count: totals.productsWithTypeDrift,
      automated: true,
    });
  }

  if ((totals.variantsMissingSelections ?? 0) > 0) {
    plan.push({
      action: "infer_selections",
      description: "Infer variant selections from option summary text",
      count: totals.variantsMissingSelections,
      automated: true,
    });
  }

  if ((totals.variantsMissingSelectionKey ?? 0) > 0) {
    plan.push({
      action: "recompute_selection_keys",
      description: "Recompute selection keys from normalized selections",
      count: totals.variantsMissingSelectionKey,
      automated: true,
    });
  }

  if ((totals.variableProductsWithoutDefault ?? 0) > 0 ||
      (totals.variableProductsWithMultipleDefaults ?? 0) > 0) {
    plan.push({
      action: "fix_default_variants",
      description: "Ensure exactly one default variant per variable product",
      count:
        (totals.variableProductsWithoutDefault ?? 0) +
        (totals.variableProductsWithMultipleDefaults ?? 0),
      automated: true,
    });
  }

  if ((totals.variantsNeedingManualSelectionRepair ?? 0) > 0) {
    plan.push({
      action: "manual_selection_repair",
      description: "Variants requiring manual intervention (cannot infer selections)",
      count: totals.variantsNeedingManualSelectionRepair,
      automated: false,
    });
  }

  if ((totals.duplicateSelectionKeyGroups ?? 0) > 0) {
    plan.push({
      action: "deduplicate_selection_keys",
      description: "Duplicate selection key groups requiring manual resolution",
      count: totals.duplicateSelectionKeyGroups,
      automated: false,
    });
  }

  if ((totals.missingVariantRefs ?? 0) > 0 || (totals.crossProductVariantRefs ?? 0) > 0) {
    plan.push({
      action: "fix_broken_references",
      description: "Broken variant references requiring manual resolution",
      count: (totals.missingVariantRefs ?? 0) + (totals.crossProductVariantRefs ?? 0),
      automated: false,
    });
  }

  return plan;
}

// ────────────────────────────────────────────────────────────────────
// Variant generation helpers (pure cartesian product)
// ────────────────────────────────────────────────────────────────────

/**
 * Generate the full set of variant selection combos from option types.
 * Returns normalized selections with computed keys and summaries.
 */
export function generateVariantCombinations(
  optionTypes: OptionType[],
): Array<{
  selections: VariantSelection[];
  selectionKey: string;
  optionSummary: string;
  title: string;
}> {
  if (optionTypes.length === 0) return [];

  const sorted = [...optionTypes].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );

  const valueArrays = sorted.map((ot) =>
    (ot.values ?? []).map((val) => ({
      typeId: ot.id,
      typeName: ot.name,
      valueId: val.id,
      valueLabel: val.label,
    })),
  );

  if (valueArrays.some((a) => a.length === 0)) return [];

  function cartesian<T>(arrays: T[][]): T[][] {
    return arrays.reduce(
      (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
      [[]] as T[][],
    );
  }

  return cartesian(valueArrays).map((combo) => {
    const selections: VariantSelection[] = combo.map((c, index) => ({
      optionTypeId: c.typeId,
      optionTypeName: c.typeName,
      optionValueId: c.valueId,
      optionValueLabel: c.valueLabel,
      sortOrder: index,
    }));

    return {
      selections,
      selectionKey: buildSelectionKey(selections)!,
      optionSummary: buildOptionSummaryFromSelections(selections),
      title: selections.map((s) => s.optionValueLabel).join(" / "),
    };
  });
}

/**
 * Filter generated combos to only those not already present.
 * Uses selectionKey and optionSummary for deduplication.
 */
export function filterNewVariantCombinations(
  combos: ReturnType<typeof generateVariantCombinations>,
  existingKeys: Set<string>,
  existingSummaries: Set<string>,
): ReturnType<typeof generateVariantCombinations> {
  return combos.filter(
    (combo) =>
      !existingKeys.has(combo.selectionKey) &&
      !existingSummaries.has(combo.optionSummary),
  );
}

// ────────────────────────────────────────────────────────────────────
// Standardized variant label helper
// ────────────────────────────────────────────────────────────────────

/**
 * Resolve a human-readable label for a variant.
 * Standardized fallback order: optionSummary -> title -> name -> sku -> null.
 * Use this across all customer-facing surfaces for consistency.
 */
export function getVariantLabel(variant: {
  optionSummary?: string;
  title?: string;
  name?: string;
  sku?: string;
} | null | undefined): string | null {
  if (!variant) return null;
  return (
    variant.optionSummary?.trim() ||
    variant.title?.trim() ||
    variant.name?.trim() ||
    variant.sku?.trim() ||
    null
  );
}

// ────────────────────────────────────────────────────────────────────
// WooCommerce field mapping helpers
// ────────────────────────────────────────────────────────────────────

export function mapWooManageStock(
  value: boolean | "parent" | undefined,
): "yes" | "no" | "parent" | undefined {
  if (value === undefined) return undefined;
  if (value === "parent") return "parent";
  return value ? "yes" : "no";
}

export function mapWooSaleDates(
  from: string | null | undefined,
  to: string | null | undefined,
): { salePriceFrom: number | undefined; salePriceTo: number | undefined } {
  return {
    salePriceFrom: from ? new Date(from).getTime() : undefined,
    salePriceTo: to ? new Date(to).getTime() : undefined,
  };
}

export function mapWooDimensions(
  dimensions: { length?: string; width?: string; height?: string } | undefined,
): {
  shippingLengthIn: string | undefined;
  shippingWidthIn: string | undefined;
  shippingHeightIn: string | undefined;
} {
  return {
    shippingLengthIn: dimensions?.length || undefined,
    shippingWidthIn: dimensions?.width || undefined,
    shippingHeightIn: dimensions?.height || undefined,
  };
}

export function mapWooBackorders(
  value: "no" | "notify" | "yes" | undefined,
): "no" | "notify" | "yes" | undefined {
  if (value === "no" || value === "yes" || value === "notify") return value;
  return undefined;
}

export function resolveActivePrice(variant: {
  price?: { amount: number };
  salePrice?: { amount: number } | null;
  salePriceFrom?: number;
  salePriceTo?: number;
}): number | undefined {
  if (!variant.price) return undefined;
  const now = Date.now();
  const saleActive = variant.salePrice &&
    (!variant.salePriceFrom || variant.salePriceFrom <= now) &&
    (!variant.salePriceTo || variant.salePriceTo >= now);
  return saleActive ? variant.salePrice!.amount : variant.price.amount;
}

export function resolveVariantField<T>(
  variantValue: T | undefined | null,
  parentValue: T | undefined | null,
): T | undefined {
  return variantValue !== undefined && variantValue !== null ? variantValue : (parentValue ?? undefined);
}
