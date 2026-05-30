/**
 * ConvexPress Forms — server-trusted conditional logic evaluator
 *
 * This is a PURE backend mirror of the FIXED frontend evaluator at
 *   apps/web/src/components/custom-fields/conditionalLogic.ts
 * Keep the two in lockstep: same canonical shape, same normalizer, same
 * fail-open behavior. The Forms submit mutation imports this to recompute
 * field visibility on the server, so a hidden field is treated as
 * not-required and its submitted value is ignored — the client is never
 * trusted to tell us which fields were visible.
 *
 * CANONICAL SHAPE (authored by ConditionalLogicBuilder):
 *   { action: "show" | "hide", logic: "and" | "or",
 *     rules: [{ field, operator, value }] }
 *   - `field` holds the referenced sibling field's KEY.
 *   - Presence of `rules` = active. The builder clears the JSON entirely
 *     when all rules are removed (onChange(undefined)), so there is no
 *     "rules present but disabled" state from the builder.
 *
 * NORMALIZER (tolerates legacy/other-source data — drops nothing):
 *   - Reads `rule.field` OR `rule.fieldKey` (the old reader shape).
 *   - Honors `enabled` ONLY when explicitly `false`. The builder never
 *     writes `enabled`; absence MUST mean active (the original bug treated
 *     absence as disabled, so every field always showed).
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
      return (
        currentValue === "" || currentValue === "[]" || currentValue === "{}"
      );
    case "not_empty":
      return (
        currentValue !== "" && currentValue !== "[]" && currentValue !== "{}"
      );
    default:
      return true;
  }
}

/**
 * Decide whether a field is visible given its serialized conditionalLogic JSON
 * and the current `fieldKey -> value` map. Fails OPEN (visible) on missing or
 * malformed logic, matching the frontend evaluator for those edge cases.
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
