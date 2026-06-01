/**
 * Conditional logic evaluator — the single canonical evaluator for
 * custom-field show/hide rules.
 *
 * BUG THIS FIXES (verified 2026-05-30):
 *   `ConditionalLogicBuilder` writes rules as `{ field, operator, value }`
 *   with NO `enabled` flag (`field` holds the sibling field's KEY). The old
 *   inline evaluator in `MetaboxRenderer` required `logic.enabled` to be
 *   truthy (so every rule was skipped — fields always showed) AND read
 *   `rule.fieldKey` (which the builder never writes). Conditional logic was
 *   dead end-to-end.
 *
 * CANONICAL SHAPE (the builder's authored shape):
 *   { action: "show" | "hide", logic: "and" | "or", rules: [{ field, operator, value }] }
 *   - Presence of `rules` = active. Removing all rules clears the JSON
 *     entirely (the builder calls onChange(undefined)), so there is no
 *     "rules present but disabled" state from the builder.
 *
 * NORMALIZER (keeps any legacy/other-source data working — no data dropped):
 *   - Reads `rule.field` OR `rule.fieldKey` (tolerates the old reader shape).
 *   - Honors `enabled` ONLY when it is explicitly `false` (legacy data may
 *     set it); the builder never writes it and presence of rules implies on.
 *
 * SHARED PATH: this module is the destination the Field Engine extraction
 * (the Forms extension's `field-engine` package) will lift verbatim, so the
 * Forms Logic & Validation system inherits the fixed evaluator rather than
 * re-deriving (and re-breaking) it.
 *
 * Manual repro of the original bug / regression guard (see conditionalLogic.test.ts):
 *   evaluateConditionalLogic(
 *     JSON.stringify({ action: "show", logic: "and",
 *       rules: [{ field: "field_plan_abc", operator: "==", value: "pro" }] }),
 *     { field_plan_abc: "pro" },
 *   ) === true   // and === false when the value is "basic"
 *   Before the fix this returned `true` unconditionally.
 */

export type ConditionalOperator =
  | "=="
  | "!="
  | ">"
  | "<"
  | "contains"
  | "empty"
  | "not_empty";

export interface ConditionalRule {
  /** Canonical: the referenced sibling field's `key`. */
  field?: string;
  /** Legacy alias tolerated by the normalizer. */
  fieldKey?: string;
  operator: ConditionalOperator;
  value: string;
  /**
   * How `value` is interpreted (Form Logic & Validation System, additive):
   * `"literal"` (default / absent) compares against the literal `value`;
   * `"field"` treats `value` as another field's KEY and compares against that
   * field's live value (cross-field operand). Absent ⇒ literal for back-compat.
   * The field-scope evaluator in THIS file ignores it (literal only); cross-field
   * resolution lives in the sibling `formLogic.ts` evaluator.
   */
  operandKind?: "literal" | "field";
}

export interface ConditionalLogicData {
  action?: "show" | "hide";
  logic?: "and" | "or";
  /** Legacy/optional. Only an explicit `false` disables; absence = active. */
  enabled?: boolean;
  rules: ConditionalRule[];
}

/** The key a rule references, tolerating both the canonical and legacy shapes. */
function ruleFieldKey(rule: ConditionalRule): string {
  return rule.field ?? rule.fieldKey ?? "";
}

function evaluateRule(rule: ConditionalRule, valueMap: Record<string, string>): boolean {
  const currentValue = valueMap[ruleFieldKey(rule)] ?? "";
  switch (rule.operator) {
    case "==":
      return currentValue === rule.value;
    case "!=":
      return currentValue !== rule.value;
    case ">":
      return Number(currentValue) > Number(rule.value);
    case "<":
      return Number(currentValue) < Number(rule.value);
    case "contains":
      return currentValue.includes(rule.value);
    case "empty":
      return currentValue === "" || currentValue === "[]" || currentValue === "{}";
    case "not_empty":
      return currentValue !== "" && currentValue !== "[]" && currentValue !== "{}";
    default:
      return true;
  }
}

/**
 * Decide whether a field is visible given its serialized conditionalLogic JSON
 * and the current `fieldKey -> value` map. Fails OPEN (visible) on missing or
 * malformed logic, matching the prior behavior for those edge cases.
 */
export function evaluateConditionalLogic(
  conditionalLogic: string | undefined | null,
  valueMap: Record<string, string>,
): boolean {
  if (!conditionalLogic) return true;

  let logic: ConditionalLogicData;
  try {
    logic = JSON.parse(conditionalLogic) as ConditionalLogicData;
  } catch {
    return true;
  }

  const rules = logic?.rules;
  if (!Array.isArray(rules) || rules.length === 0) return true;
  // Only an explicit `enabled: false` disables the rules. The builder never
  // writes `enabled`, so undefined must NOT disable (that was the bug).
  if (logic.enabled === false) return true;

  const action = logic.action ?? "show";
  const logicType = logic.logic ?? "and";

  const results = rules.map((rule) => evaluateRule(rule, valueMap));
  const matches =
    logicType === "and" ? results.every(Boolean) : results.some(Boolean);

  return action === "show" ? matches : !matches;
}
