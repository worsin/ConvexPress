/**
 * Conditional logic evaluator — PUBLIC (Website) copy.
 *
 * This is a verbatim re-implementation of the Admin's canonical evaluator at
 * `ConvexPress-Admin/apps/web/src/components/custom-fields/conditionalLogic.ts`
 * AND the backend copy at
 * `ConvexPress-Admin/packages/backend/convex/extensions/forms/conditionalLogic.ts`.
 * The Website is a separate workspace and does NOT import Admin code, so the
 * evaluator is duplicated here. It MUST stay byte-for-byte equivalent in
 * behavior to the Admin/backend version so client-side show/hide matches the
 * server-side visibility recompute performed in `forms.mutations.submit`.
 *
 * CANONICAL SHAPE (the builder's authored shape):
 *   { action: "show" | "hide", logic: "and" | "or", rules: [{ field, operator, value }] }
 *   - `field` holds the referenced sibling field's `key`.
 *   - Presence of `rules` = active. The builder clears the JSON entirely when
 *     all rules are removed, so there is no "rules present but disabled" state.
 *
 * NORMALIZER (keeps any legacy/other-source data working — no data dropped):
 *   - Reads `rule.field` OR `rule.fieldKey` (tolerates the old reader shape).
 *   - Honors `enabled` ONLY when it is explicitly `false`; the builder never
 *     writes it and presence of rules implies on.
 *
 * Fails OPEN (visible) on missing/malformed logic, matching the Admin behavior.
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

function evaluateRule(
  rule: ConditionalRule,
  valueMap: Record<string, string>,
): boolean {
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
 * malformed logic.
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
  // Only an explicit `enabled: false` disables the rules.
  if (logic.enabled === false) return true;

  const action = logic.action ?? "show";
  const logicType = logic.logic ?? "and";

  const results = rules.map((rule) => evaluateRule(rule, valueMap));
  const matches =
    logicType === "and" ? results.every(Boolean) : results.some(Boolean);

  return action === "show" ? matches : !matches;
}
