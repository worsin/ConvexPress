import { describe, expect, test } from "bun:test";

import {
  normalizeVariantSelections,
  buildSelectionKey,
  buildOptionSummaryFromSelections,
  normalizeName,
  validateVariantSelectionsResult,
  inferSelectionsFromOptionSummary,
  getVariantDisplayPrice,
  validateOptionTypesShape,
  summarizeAuditIssues,
  buildRepairPlan,
  generateVariantCombinations,
  filterNewVariantCombinations,
  getVariantLabel,
  type OptionType,
  type VariantSelection,
} from "../variantHelpers";

// ────────────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────────────

function makeOptionTypes(): OptionType[] {
  return [
    {
      id: "opt_color",
      name: "Color",
      sortOrder: 0,
      values: [
        { id: "val_red", label: "Red", sortOrder: 0 },
        { id: "val_blue", label: "Blue", sortOrder: 1 },
      ],
    },
    {
      id: "opt_size",
      name: "Size",
      sortOrder: 1,
      values: [
        { id: "val_s", label: "Small", sortOrder: 0 },
        { id: "val_l", label: "Large", sortOrder: 1 },
      ],
    },
  ];
}

function makeSelections(
  colorValueId = "val_red",
  colorLabel = "Red",
  sizeValueId = "val_s",
  sizeLabel = "Small",
): VariantSelection[] {
  return [
    {
      optionTypeId: "opt_color",
      optionTypeName: "Color",
      optionValueId: colorValueId,
      optionValueLabel: colorLabel,
      sortOrder: 0,
    },
    {
      optionTypeId: "opt_size",
      optionTypeName: "Size",
      optionValueId: sizeValueId,
      optionValueLabel: sizeLabel,
      sortOrder: 1,
    },
  ];
}

// ────────────────────────────────────────────────────────────────────
// normalizeVariantSelections
// ────────────────────────────────────────────────────────────────────

describe("normalizeVariantSelections", () => {
  test("returns undefined for empty or undefined selections", () => {
    expect(normalizeVariantSelections(undefined)).toBeUndefined();
    expect(normalizeVariantSelections([])).toBeUndefined();
  });

  test("sorts selections by sortOrder", () => {
    const reversed: VariantSelection[] = [
      { optionTypeId: "opt_size", optionTypeName: "Size", optionValueId: "val_l", optionValueLabel: "Large", sortOrder: 1 },
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_red", optionValueLabel: "Red", sortOrder: 0 },
    ];
    const result = normalizeVariantSelections(reversed)!;
    expect(result[0].optionTypeId).toBe("opt_color");
    expect(result[1].optionTypeId).toBe("opt_size");
  });

  test("assigns default sortOrder from index when missing", () => {
    const noOrder = [
      { optionTypeId: "opt_a", optionTypeName: "A", optionValueId: "v1", optionValueLabel: "V1" },
      { optionTypeId: "opt_b", optionTypeName: "B", optionValueId: "v2", optionValueLabel: "V2" },
    ] as VariantSelection[];
    const result = normalizeVariantSelections(noOrder)!;
    expect(result[0].sortOrder).toBe(0);
    expect(result[1].sortOrder).toBe(1);
  });

  test("strips unknown properties and keeps canonical shape", () => {
    const withExtra = [
      { optionTypeId: "opt_a", optionTypeName: "A", optionValueId: "v1", optionValueLabel: "V1", sortOrder: 0, extraField: true },
    ] as any[];
    const result = normalizeVariantSelections(withExtra)!;
    expect(result[0]).toEqual({
      optionTypeId: "opt_a",
      optionTypeName: "A",
      optionValueId: "v1",
      optionValueLabel: "V1",
      sortOrder: 0,
    });
    expect((result[0] as any).extraField).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// buildSelectionKey
// ────────────────────────────────────────────────────────────────────

describe("buildSelectionKey", () => {
  test("returns undefined for empty selections", () => {
    expect(buildSelectionKey(undefined)).toBeUndefined();
    expect(buildSelectionKey([])).toBeUndefined();
  });

  test("builds deterministic pipe-separated key", () => {
    const selections = makeSelections();
    expect(buildSelectionKey(selections)).toBe("opt_color:val_red|opt_size:val_s");
  });

  test("same selections produce same key (idempotent)", () => {
    const a = makeSelections();
    const b = makeSelections();
    expect(buildSelectionKey(a)).toBe(buildSelectionKey(b));
  });

  test("different selections produce different keys", () => {
    const a = makeSelections("val_red", "Red", "val_s", "Small");
    const b = makeSelections("val_blue", "Blue", "val_l", "Large");
    expect(buildSelectionKey(a)).not.toBe(buildSelectionKey(b));
  });

  test("key changes when option value changes", () => {
    const a = makeSelections("val_red", "Red", "val_s", "Small");
    const b = makeSelections("val_red", "Red", "val_l", "Large");
    expect(buildSelectionKey(a)).not.toBe(buildSelectionKey(b));
  });
});

// ────────────────────────────────────────────────────────────────────
// buildOptionSummaryFromSelections
// ────────────────────────────────────────────────────────────────────

describe("buildOptionSummaryFromSelections", () => {
  test("returns empty string for empty selections", () => {
    expect(buildOptionSummaryFromSelections(undefined)).toBe("");
    expect(buildOptionSummaryFromSelections([])).toBe("");
  });

  test("builds human-readable summary", () => {
    const selections = makeSelections();
    expect(buildOptionSummaryFromSelections(selections)).toBe("Color: Red / Size: Small");
  });
});

// ────────────────────────────────────────────────────────────────────
// normalizeName
// ────────────────────────────────────────────────────────────────────

describe("normalizeName", () => {
  test("trims and lowercases", () => {
    expect(normalizeName("  Color  ")).toBe("color");
  });

  test("handles undefined", () => {
    expect(normalizeName(undefined)).toBe("");
  });
});

// ────────────────────────────────────────────────────────────────────
// validateVariantSelectionsResult
// ────────────────────────────────────────────────────────────────────

describe("validateVariantSelectionsResult", () => {
  const optionTypes = makeOptionTypes();

  test("rejects missing selections", () => {
    const result = validateVariantSelectionsResult(optionTypes, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("required");
    }
  });

  test("rejects empty selections", () => {
    const result = validateVariantSelectionsResult(optionTypes, []);
    expect(result.ok).toBe(false);
  });

  test("rejects wrong number of selections", () => {
    const result = validateVariantSelectionsResult(optionTypes, [
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_red", optionValueLabel: "Red", sortOrder: 0 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("exactly one value for each");
    }
  });

  test("rejects duplicate option type in selections", () => {
    const result = validateVariantSelectionsResult(optionTypes, [
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_red", optionValueLabel: "Red", sortOrder: 0 },
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_blue", optionValueLabel: "Blue", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("same option type more than once");
    }
  });

  test("rejects selection referencing missing option type", () => {
    const result = validateVariantSelectionsResult(optionTypes, [
      { optionTypeId: "opt_FAKE", optionTypeName: "Fake", optionValueId: "val_red", optionValueLabel: "Red", sortOrder: 0 },
      { optionTypeId: "opt_size", optionTypeName: "Size", optionValueId: "val_s", optionValueLabel: "Small", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("option type that does not exist");
    }
  });

  test("rejects selection referencing missing option value", () => {
    const result = validateVariantSelectionsResult(optionTypes, [
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_FAKE", optionValueLabel: "Fake", sortOrder: 0 },
      { optionTypeId: "opt_size", optionTypeName: "Size", optionValueId: "val_s", optionValueLabel: "Small", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("option value that does not exist");
    }
  });

  test("returns canonical sorted selections on valid input", () => {
    const result = validateVariantSelectionsResult(optionTypes, makeSelections());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections).toHaveLength(2);
      expect(result.selections[0].optionTypeId).toBe("opt_color");
      expect(result.selections[1].optionTypeId).toBe("opt_size");
      expect(result.selections[0].sortOrder).toBe(0);
      expect(result.selections[1].sortOrder).toBe(1);
    }
  });

  test("canonical selections use current option type/value names from model", () => {
    const result = validateVariantSelectionsResult(optionTypes, [
      { optionTypeId: "opt_color", optionTypeName: "OldColorName", optionValueId: "val_red", optionValueLabel: "OldRed", sortOrder: 0 },
      { optionTypeId: "opt_size", optionTypeName: "OldSize", optionValueId: "val_s", optionValueLabel: "OldSmall", sortOrder: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0].optionTypeName).toBe("Color");
      expect(result.selections[0].optionValueLabel).toBe("Red");
      expect(result.selections[1].optionTypeName).toBe("Size");
      expect(result.selections[1].optionValueLabel).toBe("Small");
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// inferSelectionsFromOptionSummary
// ────────────────────────────────────────────────────────────────────

describe("inferSelectionsFromOptionSummary", () => {
  const optionTypes = makeOptionTypes();

  test("returns undefined for empty input", () => {
    expect(inferSelectionsFromOptionSummary(undefined, "Color: Red / Size: Small")).toBeUndefined();
    expect(inferSelectionsFromOptionSummary(optionTypes, "")).toBeUndefined();
    expect(inferSelectionsFromOptionSummary(optionTypes, "  ")).toBeUndefined();
  });

  test("infers selections from valid summary string", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "Color: Red / Size: Small");
    expect(result).toBeDefined();
    expect(result!).toHaveLength(2);
    expect(result![0].optionTypeId).toBe("opt_color");
    expect(result![0].optionValueId).toBe("val_red");
    expect(result![1].optionTypeId).toBe("opt_size");
    expect(result![1].optionValueId).toBe("val_s");
  });

  test("is case-insensitive on type names and value labels", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "color: red / size: small");
    expect(result).toBeDefined();
    expect(result![0].optionValueId).toBe("val_red");
  });

  test("returns undefined for mismatched type count", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "Color: Red");
    expect(result).toBeUndefined();
  });

  test("returns undefined for unknown type name", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "Material: Cotton / Size: Small");
    expect(result).toBeUndefined();
  });

  test("returns undefined for unknown value label", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "Color: Purple / Size: Small");
    expect(result).toBeUndefined();
  });

  test("returns undefined for malformed summary (missing colon)", () => {
    const result = inferSelectionsFromOptionSummary(optionTypes, "Red / Small");
    expect(result).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// getVariantDisplayPrice
// ────────────────────────────────────────────────────────────────────

describe("getVariantDisplayPrice", () => {
  test("returns Infinity for undefined variant", () => {
    expect(getVariantDisplayPrice(undefined)).toBe(Number.POSITIVE_INFINITY);
  });

  test("returns sale price when available", () => {
    expect(
      getVariantDisplayPrice({
        price: { amount: 2000, currencyCode: "USD" },
        salePrice: { amount: 1500, currencyCode: "USD" },
      }),
    ).toBe(1500);
  });

  test("returns base price when no sale price", () => {
    expect(
      getVariantDisplayPrice({
        price: { amount: 2000, currencyCode: "USD" },
      }),
    ).toBe(2000);
  });
});

// ────────────────────────────────────────────────────────────────────
// validateOptionTypesShape
// ────────────────────────────────────────────────────────────────────

describe("validateOptionTypesShape", () => {
  test("returns no issues for valid optionTypes", () => {
    expect(validateOptionTypesShape(makeOptionTypes())).toEqual([]);
  });

  test("rejects non-array", () => {
    const issues = validateOptionTypesShape("not an array");
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("optionTypes");
  });

  test("rejects missing id", () => {
    const issues = validateOptionTypesShape([{ name: "Color", sortOrder: 0, values: [] }]);
    expect(issues.some((i) => i.path.includes(".id"))).toBe(true);
  });

  test("rejects duplicate option type ids", () => {
    const issues = validateOptionTypesShape([
      { id: "opt_1", name: "Color", sortOrder: 0, values: [] },
      { id: "opt_1", name: "Size", sortOrder: 1, values: [] },
    ]);
    expect(issues.some((i) => i.message.includes("Duplicate option type id"))).toBe(true);
  });

  test("rejects duplicate option type names (case-insensitive)", () => {
    const issues = validateOptionTypesShape([
      { id: "opt_1", name: "Color", sortOrder: 0, values: [] },
      { id: "opt_2", name: "color", sortOrder: 1, values: [] },
    ]);
    expect(issues.some((i) => i.message.includes("Duplicate option type name"))).toBe(true);
  });

  test("rejects duplicate value ids within same type", () => {
    const issues = validateOptionTypesShape([
      {
        id: "opt_1",
        name: "Color",
        sortOrder: 0,
        values: [
          { id: "val_1", label: "Red", sortOrder: 0 },
          { id: "val_1", label: "Blue", sortOrder: 1 },
        ],
      },
    ]);
    expect(issues.some((i) => i.message.includes("Duplicate value id"))).toBe(true);
  });

  test("rejects duplicate value labels (case-insensitive)", () => {
    const issues = validateOptionTypesShape([
      {
        id: "opt_1",
        name: "Color",
        sortOrder: 0,
        values: [
          { id: "val_1", label: "Red", sortOrder: 0 },
          { id: "val_2", label: "red", sortOrder: 1 },
        ],
      },
    ]);
    expect(issues.some((i) => i.message.includes("Duplicate value label"))).toBe(true);
  });

  test("rejects missing sortOrder on option type", () => {
    const issues = validateOptionTypesShape([{ id: "opt_1", name: "Color", values: [] }]);
    expect(issues.some((i) => i.path.includes("sortOrder"))).toBe(true);
  });

  test("rejects non-object entries", () => {
    const issues = validateOptionTypesShape([null, 42]);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// summarizeAuditIssues
// ────────────────────────────────────────────────────────────────────

describe("summarizeAuditIssues", () => {
  test("returns empty for clean audit", () => {
    expect(
      summarizeAuditIssues({
        products: 10,
        variants: 20,
        duplicateSelectionKeyGroups: 0,
        variableProductsWithoutDefault: 0,
        variantsMissingSelections: 0,
      }),
    ).toEqual([]);
  });

  test("sorts by severity (critical first)", () => {
    const result = summarizeAuditIssues({
      products: 10,
      variants: 20,
      variantsMissingSelectionKey: 2,
      duplicateSelectionKeyGroups: 1,
      variableProductsWithoutDefault: 3,
    });
    expect(result[0].severity).toBe("critical");
    expect(result[1].severity).toBe("high");
    expect(result[2].severity).toBe("low");
  });
});

// ────────────────────────────────────────────────────────────────────
// buildRepairPlan
// ────────────────────────────────────────────────────────────────────

describe("buildRepairPlan", () => {
  test("returns empty plan for clean audit", () => {
    expect(buildRepairPlan({ productsWithTypeDrift: 0, variantsMissingSelections: 0 })).toEqual([]);
  });

  test("plans type promotion before selection repair before key repair before default fix", () => {
    const plan = buildRepairPlan({
      productsWithTypeDrift: 1,
      variantsMissingSelections: 2,
      variantsMissingSelectionKey: 3,
      variableProductsWithoutDefault: 1,
    });
    expect(plan[0].action).toBe("promote_product_type");
    expect(plan[1].action).toBe("infer_selections");
    expect(plan[2].action).toBe("recompute_selection_keys");
    expect(plan[3].action).toBe("fix_default_variants");
  });

  test("marks manual-only items as not automated", () => {
    const plan = buildRepairPlan({
      variantsNeedingManualSelectionRepair: 2,
      duplicateSelectionKeyGroups: 1,
    });
    expect(plan.every((item) => !item.automated)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// generateVariantCombinations
// ────────────────────────────────────────────────────────────────────

describe("generateVariantCombinations", () => {
  test("returns empty for no option types", () => {
    expect(generateVariantCombinations([])).toEqual([]);
  });

  test("returns empty when an option type has no values", () => {
    expect(
      generateVariantCombinations([
        { id: "opt_1", name: "Color", sortOrder: 0, values: [] },
      ]),
    ).toEqual([]);
  });

  test("generates cartesian product for 2x2 options", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    expect(combos).toHaveLength(4);

    const keys = combos.map((c) => c.selectionKey);
    expect(keys).toContain("opt_color:val_red|opt_size:val_s");
    expect(keys).toContain("opt_color:val_red|opt_size:val_l");
    expect(keys).toContain("opt_color:val_blue|opt_size:val_s");
    expect(keys).toContain("opt_color:val_blue|opt_size:val_l");
  });

  test("generated variants are idempotent (same input = same output)", () => {
    const a = generateVariantCombinations(makeOptionTypes());
    const b = generateVariantCombinations(makeOptionTypes());
    expect(a.map((c) => c.selectionKey)).toEqual(b.map((c) => c.selectionKey));
    expect(a.map((c) => c.optionSummary)).toEqual(b.map((c) => c.optionSummary));
  });

  test("all generated selection keys are unique", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    const keys = combos.map((c) => c.selectionKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("generates correct titles", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    const titles = combos.map((c) => c.title);
    expect(titles).toContain("Red / Small");
    expect(titles).toContain("Blue / Large");
  });

  test("generates correct option summaries", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    const summaries = combos.map((c) => c.optionSummary);
    expect(summaries).toContain("Color: Red / Size: Small");
    expect(summaries).toContain("Color: Blue / Size: Large");
  });

  test("handles single option type", () => {
    const combos = generateVariantCombinations([
      {
        id: "opt_color",
        name: "Color",
        sortOrder: 0,
        values: [
          { id: "val_red", label: "Red", sortOrder: 0 },
          { id: "val_blue", label: "Blue", sortOrder: 1 },
        ],
      },
    ]);
    expect(combos).toHaveLength(2);
  });

  test("handles 3x3x2 option types (large cartesian)", () => {
    const combos = generateVariantCombinations([
      {
        id: "opt_color",
        name: "Color",
        sortOrder: 0,
        values: [
          { id: "v1", label: "Red", sortOrder: 0 },
          { id: "v2", label: "Blue", sortOrder: 1 },
          { id: "v3", label: "Green", sortOrder: 2 },
        ],
      },
      {
        id: "opt_size",
        name: "Size",
        sortOrder: 1,
        values: [
          { id: "v4", label: "S", sortOrder: 0 },
          { id: "v5", label: "M", sortOrder: 1 },
          { id: "v6", label: "L", sortOrder: 2 },
        ],
      },
      {
        id: "opt_material",
        name: "Material",
        sortOrder: 2,
        values: [
          { id: "v7", label: "Cotton", sortOrder: 0 },
          { id: "v8", label: "Polyester", sortOrder: 1 },
        ],
      },
    ]);
    expect(combos).toHaveLength(18);
    expect(new Set(combos.map((c) => c.selectionKey)).size).toBe(18);
  });
});

// ────────────────────────────────────────────────────────────────────
// filterNewVariantCombinations
// ────────────────────────────────────────────────────────────────────

describe("filterNewVariantCombinations", () => {
  test("filters out existing keys and summaries", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    const existingKeys = new Set(["opt_color:val_red|opt_size:val_s"]);
    const existingSummaries = new Set(["Color: Blue / Size: Large"]);
    const filtered = filterNewVariantCombinations(combos, existingKeys, existingSummaries);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.selectionKey)).not.toContain("opt_color:val_red|opt_size:val_s");
    expect(filtered.map((c) => c.optionSummary)).not.toContain("Color: Blue / Size: Large");
  });

  test("returns all when nothing exists", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    const filtered = filterNewVariantCombinations(combos, new Set(), new Set());
    expect(filtered).toHaveLength(combos.length);
  });
});

// ────────────────────────────────────────────────────────────────────
// Option rename propagation tests
// ────────────────────────────────────────────────────────────────────

describe("option rename propagation", () => {
  test("option type rename: re-validate updates optionTypeName in canonical selections", () => {
    const renamedTypes: OptionType[] = [
      {
        id: "opt_color",
        name: "Colour",
        sortOrder: 0,
        values: [
          { id: "val_red", label: "Red", sortOrder: 0 },
          { id: "val_blue", label: "Blue", sortOrder: 1 },
        ],
      },
      {
        id: "opt_size",
        name: "Size",
        sortOrder: 1,
        values: [
          { id: "val_s", label: "Small", sortOrder: 0 },
          { id: "val_l", label: "Large", sortOrder: 1 },
        ],
      },
    ];

    const oldSelections = makeSelections();
    const result = validateVariantSelectionsResult(renamedTypes, oldSelections);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0].optionTypeName).toBe("Colour");
      const newSummary = buildOptionSummaryFromSelections(result.selections);
      expect(newSummary).toBe("Colour: Red / Size: Small");
      const newKey = buildSelectionKey(result.selections);
      expect(newKey).toBe(buildSelectionKey(oldSelections));
    }
  });

  test("option value rename: re-validate updates optionValueLabel in canonical selections", () => {
    const renamedTypes: OptionType[] = [
      {
        id: "opt_color",
        name: "Color",
        sortOrder: 0,
        values: [
          { id: "val_red", label: "Crimson", sortOrder: 0 },
          { id: "val_blue", label: "Blue", sortOrder: 1 },
        ],
      },
      {
        id: "opt_size",
        name: "Size",
        sortOrder: 1,
        values: [
          { id: "val_s", label: "Small", sortOrder: 0 },
          { id: "val_l", label: "Large", sortOrder: 1 },
        ],
      },
    ];

    const oldSelections = makeSelections();
    const result = validateVariantSelectionsResult(renamedTypes, oldSelections);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selections[0].optionValueLabel).toBe("Crimson");
      const newSummary = buildOptionSummaryFromSelections(result.selections);
      expect(newSummary).toBe("Color: Crimson / Size: Small");
      // Selection key stays the same (based on IDs, not labels)
      expect(buildSelectionKey(result.selections)).toBe(buildSelectionKey(oldSelections));
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Duplicate selection key detection
// ────────────────────────────────────────────────────────────────────

describe("duplicate selection key detection", () => {
  test("identical selections produce identical keys (duplicate detectable)", () => {
    const a = makeSelections("val_red", "Red", "val_s", "Small");
    const b = makeSelections("val_red", "Red", "val_s", "Small");
    expect(buildSelectionKey(normalizeVariantSelections(a))).toBe(
      buildSelectionKey(normalizeVariantSelections(b)),
    );
  });

  test("selection key is order-independent after normalization", () => {
    const forward = makeSelections();
    const reversed: VariantSelection[] = [
      { optionTypeId: "opt_size", optionTypeName: "Size", optionValueId: "val_s", optionValueLabel: "Small", sortOrder: 1 },
      { optionTypeId: "opt_color", optionTypeName: "Color", optionValueId: "val_red", optionValueLabel: "Red", sortOrder: 0 },
    ];
    expect(buildSelectionKey(normalizeVariantSelections(forward))).toBe(
      buildSelectionKey(normalizeVariantSelections(reversed)),
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// Product type drift detection
// ────────────────────────────────────────────────────────────────────

describe("product type drift", () => {
  test("variant generation always produces non-empty results for valid options (would set variable type)", () => {
    const combos = generateVariantCombinations(makeOptionTypes());
    expect(combos.length).toBeGreaterThan(0);
  });

  test("empty option values produce no combos (would remain simple type)", () => {
    const combos = generateVariantCombinations([
      { id: "opt_1", name: "Color", sortOrder: 0, values: [] },
    ]);
    expect(combos).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// getVariantLabel (standardized fallback)
// ────────────────────────────────────────────────────────────────────

describe("getVariantLabel", () => {
  test("returns null for null/undefined variant", () => {
    expect(getVariantLabel(null)).toBeNull();
    expect(getVariantLabel(undefined)).toBeNull();
  });

  test("prefers optionSummary over title", () => {
    expect(
      getVariantLabel({
        optionSummary: "Color: Red / Size: Large",
        title: "Red / Large",
        name: "Variant A",
        sku: "SKU-1",
      }),
    ).toBe("Color: Red / Size: Large");
  });

  test("falls back to title when no optionSummary", () => {
    expect(getVariantLabel({ title: "Red / Large", name: "Variant A" })).toBe("Red / Large");
  });

  test("falls back to name when no title", () => {
    expect(getVariantLabel({ name: "Variant A", sku: "SKU-1" })).toBe("Variant A");
  });

  test("falls back to SKU when nothing else", () => {
    expect(getVariantLabel({ sku: "SKU-1" })).toBe("SKU-1");
  });

  test("returns null when all fields are empty", () => {
    expect(getVariantLabel({})).toBeNull();
    expect(getVariantLabel({ optionSummary: "", title: "", name: "", sku: "" })).toBeNull();
  });

  test("trims whitespace before comparing", () => {
    expect(getVariantLabel({ optionSummary: "  ", title: " Red / Large " })).toBe("Red / Large");
  });
});
