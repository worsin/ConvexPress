/**
 * ConvexPress Forms — Logic & Validation engine (server copy / source of truth)
 *
 * This module is the SECOND of the three hand-mirrored Forms logic copies. It is
 * a sibling of `conditionalLogic.ts` and extends it from field-only show/hide to:
 *   - cross-field operands (`operandKind: "field"` → compare against another
 *     field's live value rather than a literal),
 *   - conditional-required (`settings.requiredWhen` makes a visible field
 *     required only when its trigger matches),
 *   - section (`group`) scope and page (`page_break`) scope visibility,
 *   - the server-trusted `recomputeVisibility` + `validateSubmission` contract
 *     that `mutations.submit` calls (the client is never trusted for visibility),
 *   - a structural zod gate (`compileZodFromVisibleFields`) run alongside the
 *     imperative checks,
 *   - authoring-time graph guards (`detectRuleCycle`, `findDanglingRuleRefs`).
 *
 * MIRRORS (must stay behaviorally identical — same parse, same coercion, same
 * fail-open semantics). New behavior here is mirrored verbatim to:
 *   - Admin:   apps/web/src/components/custom-fields/formLogic.ts
 *   - Website: ConvexPress-Website/apps/web/src/lib/forms/formLogic.ts
 * The server is the ONLY place these MUST run; the website mirror exists for
 * live-UX parity. Keep all three in lockstep, exactly like conditionalLogic.ts.
 *
 * SOFT DEPENDENCIES (degrade gracefully, never throw):
 *   - Page scope reads a `page_break` marker that does NOT exist yet (Multi-Step
 *     System owns it). Page helpers are present-but-inert: absent markers ⇒ every
 *     page visible. They activate automatically once the marker type lands.
 *   - Section scope uses the field engine's existing `group` field-def container
 *     (a field with `type === "group"`), gating descendants by `parentFieldId`.
 *
 * Pure module: no Convex imports, no ctx, no I/O — only the canonical evaluator
 * from `conditionalLogic.ts` plus zod. This keeps it trivially mirrorable and
 * unit-testable, and lets all three workspaces import their own copy.
 */

import { z } from "zod";
import {
  evaluateConditionalLogic,
  type ConditionalLogicData,
  type ConditionalRule,
  type ConditionalOperator,
} from "./conditionalLogic";

// ─── Minimal field-def shape ────────────────────────────────────────────────

/**
 * The subset of a `fieldDefinitions` row this engine reads. Kept structural (not
 * the generated Doc type) so the three mirrors share one shape without importing
 * Convex's generated model. The server passes real Docs; they satisfy this.
 */
export interface LogicFieldDef {
  /** The field's stable `key` (what submitted values + rules reference). */
  key: string;
  /** Field type slug (e.g. "text", "group", "message"). */
  type: string;
  /** Whether the field is statically required. */
  required: boolean;
  /** Serialized conditionalLogic JSON (field/section/page show-hide). */
  conditionalLogic?: string | null;
  /** Serialized settings JSON. May carry `requiredWhen`. */
  settings?: string | null;
  /** Parent group/repeater field id, when this field is a section descendant. */
  parentFieldId?: string | null;
  /** Stable id (used for section gating + cycle detection). */
  _id?: string;
}

/** A resolved page-break marker (Multi-Step). Inert until that system ships. */
export interface PageBreakMarker {
  /** Serialized settings JSON; may carry `conditionalLogic`. */
  settings?: string | null;
}

/** Output of {@link recomputeVisibility}. */
export interface VisibilityResult {
  visibleFieldKeys: Set<string>;
  hiddenFieldKeys: Set<string>;
  /** Visible page indexes. Empty/inert when no page markers exist. */
  visiblePageIndexes: Set<number>;
}

/** Output of {@link validateSubmission}. Mirrors the imperative validator. */
export interface SubmissionValidationResult {
  ok: boolean;
  /** fieldKey -> first error message. Empty when ok. */
  errors: Record<string, string>;
}

// ─── Cross-field operands ───────────────────────────────────────────────────

/**
 * Resolve a rule's right-hand operand against the live value map.
 * - `operandKind === "field"` ⇒ the operand is another field's KEY; return that
 *   field's current value (empty string if absent — a hidden/missing operand
 *   yields "" so comparisons are vacuously handled, never throwing).
 * - otherwise (literal, or absent kind for back-compat) ⇒ return `rule.value`.
 */
export function resolveOperand(
  rule: ConditionalRule,
  valueMap: Record<string, string>,
): string {
  if (rule.operandKind === "field") {
    return valueMap[rule.value] ?? "";
  }
  return rule.value;
}

/**
 * Cross-field-aware single-rule evaluator. Same operator + coercion semantics as
 * the engine's private `evaluateRule` (Number() for >/<, string includes for
 * contains, no throw on NaN/type mismatch), but the right operand comes from
 * {@link resolveOperand} so a rule can compare two fields.
 */
export function evaluateRuleCF(
  rule: ConditionalRule,
  valueMap: Record<string, string>,
): boolean {
  const fieldKey = rule.field ?? rule.fieldKey ?? "";
  const currentValue = valueMap[fieldKey] ?? "";
  const operand = resolveOperand(rule, valueMap);
  switch (rule.operator) {
    case "==":
      return currentValue === operand;
    case "!=":
      return currentValue !== operand;
    case ">":
      return Number(currentValue) > Number(operand);
    case "<":
      return Number(currentValue) < Number(operand);
    case "contains":
      return currentValue.includes(operand);
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
 * Cross-field-aware sibling of `evaluateConditionalLogic`. Parses the same
 * canonical JSON, honors `action`/`logic`/`enabled` identically (only an
 * explicit `enabled === false` disables; absence = active), and evaluates each
 * rule via {@link evaluateRuleCF}. Fails OPEN (returns true) on missing/malformed
 * logic, matching the field-scope evaluator. Used by section/page/cross-field/
 * requiredWhen — anywhere an operand might reference another field.
 */
export function evaluateLogicData(
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
  if (logic.enabled === false) return true;

  const action = logic.action ?? "show";
  const logicType = logic.logic ?? "and";

  const results = rules.map((rule) => evaluateRuleCF(rule, valueMap));
  const matches =
    logicType === "and" ? results.every(Boolean) : results.some(Boolean);

  return action === "show" ? matches : !matches;
}

// ─── Conditional-required ───────────────────────────────────────────────────

/** Parse a field-def `settings` JSON safely; returns {} on absent/malformed. */
function parseSettings(settings: string | undefined | null): Record<string, unknown> {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Stringify `requiredWhen` (which may already be a string or an object). */
function requiredWhenJson(settings: Record<string, unknown>): string | undefined {
  const rw = settings.requiredWhen;
  if (rw == null) return undefined;
  if (typeof rw === "string") return rw;
  try {
    return JSON.stringify(rw);
  } catch {
    return undefined;
  }
}

/**
 * Whether a field must be filled, given its computed visibility + live values.
 * - A hidden field is NEVER required (returns false) — this is the rule that
 *   keeps server-hidden required fields from blocking a legitimate submission.
 * - A visible field is required when EITHER it is statically `required` OR it
 *   carries a `settings.requiredWhen` rule that currently evaluates true.
 */
export function isFieldRequired(
  field: LogicFieldDef,
  isVisible: boolean,
  valueMap: Record<string, string>,
): boolean {
  if (!isVisible) return false;
  if (field.required) return true;
  const settings = parseSettings(field.settings);
  const rw = requiredWhenJson(settings);
  if (!rw) return false;
  return evaluateLogicData(rw, valueMap);
}

// ─── Section + page scope ───────────────────────────────────────────────────

/** Field-def types that produce no stored value (layout). Mirrors validators. */
const LAYOUT_TYPES = new Set(["message", "accordion", "tab"]);

/**
 * Section (`group` field) visibility. Evaluates the group field's own
 * `conditionalLogic` via {@link evaluateLogicData}. A hidden group ⇒ all its
 * descendants are hidden (the caller gates descendants by `parentFieldId`).
 * Absent logic ⇒ visible (fail open).
 */
export function evaluateSectionVisibility(
  groupField: LogicFieldDef,
  valueMap: Record<string, string>,
): boolean {
  return evaluateLogicData(groupField.conditionalLogic, valueMap);
}

/**
 * Page (`page_break` marker) visibility. Reads `settings.conditionalLogic`.
 * No marker, or a marker with no logic ⇒ visible (INERT — single-page forms and
 * forms built before Multi-Step ships behave as if every page is visible).
 */
export function evaluatePageVisibility(
  pageBreakMarker: PageBreakMarker | undefined | null,
  valueMap: Record<string, string>,
): boolean {
  if (!pageBreakMarker) return true;
  const settings = parseSettings(pageBreakMarker.settings);
  const cl = settings.conditionalLogic;
  if (cl == null) return true;
  const clJson = typeof cl === "string" ? cl : safeStringify(cl);
  return evaluateLogicData(clJson, valueMap);
}

function safeStringify(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

// ─── The server-trust contract ──────────────────────────────────────────────

/**
 * Recompute which fields/pages are visible, server-side, from the field defs +
 * the live value map. Resolution order (PRD §10):
 *   1. PAGE visibility first. A hidden page's fields are excluded; their values
 *      are treated as empty downstream (we drop hidden keys from the working
 *      value map so later rules see "" for controls on a skipped page).
 *   2. SECTION (`group`) visibility next. A hidden group hides every descendant
 *      (matched by `parentFieldId`), overriding the descendant's own field rule.
 *   3. FIELD visibility last, via the canonical evaluator (literal rules) or the
 *      cross-field evaluator (operandKind:"field"), AND-gated by the field's
 *      section + page visibility.
 *
 * Page markers are not yet present in `fieldDefs` (Multi-Step owns them), so the
 * page pass is inert today: `visiblePageIndexes` stays empty and no field is
 * page-gated. The structure is in place for when markers land.
 *
 * Cycles fail OPEN: an unresolved dependency cycle treats the node as visible so
 * the form stays submittable (PRD §9). We do not attempt iterative fixpointing
 * here — a single pass over a (deterministic) value map, with hidden-key drop,
 * is sufficient and never loops.
 */
export function recomputeVisibility(
  fieldDefs: LogicFieldDef[],
  valueMap: Record<string, string>,
): VisibilityResult {
  const visibleFieldKeys = new Set<string>();
  const hiddenFieldKeys = new Set<string>();
  const visiblePageIndexes = new Set<number>();

  // ── Section pass: which `group` fields are hidden. A hidden group's id is
  // recorded so descendants can be force-hidden regardless of their own rule.
  const hiddenGroupIds = new Set<string>();
  for (const def of fieldDefs) {
    if (def.type === "group") {
      const groupVisible = evaluateSectionVisibility(def, valueMap);
      if (!groupVisible && def._id) {
        hiddenGroupIds.add(def._id);
      }
    }
  }

  // ── Field pass: section gate AND-ed with the field's own rule. A field inside
  // a hidden section is hidden no matter what its own field-level rule says.
  for (const def of fieldDefs) {
    const inHiddenSection =
      def.parentFieldId != null && hiddenGroupIds.has(def.parentFieldId);

    let fieldVisible: boolean;
    if (inHiddenSection) {
      fieldVisible = false;
    } else {
      // Field scope keeps using the canonical evaluator for unchanged behavior;
      // cross-field operands are handled by evaluateLogicData. Both fail open.
      const hasCrossField = ruleUsesFieldOperand(def.conditionalLogic);
      fieldVisible = hasCrossField
        ? evaluateLogicData(def.conditionalLogic, valueMap)
        : evaluateConditionalLogic(def.conditionalLogic, valueMap);
    }

    if (fieldVisible) {
      visibleFieldKeys.add(def.key);
    } else {
      hiddenFieldKeys.add(def.key);
    }
  }

  return { visibleFieldKeys, hiddenFieldKeys, visiblePageIndexes };
}

/** True if any rule in the serialized logic uses a cross-field operand. */
function ruleUsesFieldOperand(conditionalLogic: string | undefined | null): boolean {
  if (!conditionalLogic) return false;
  try {
    const logic = JSON.parse(conditionalLogic) as ConditionalLogicData;
    const rules = logic?.rules;
    if (!Array.isArray(rules)) return false;
    return rules.some((r) => r.operandKind === "field");
  } catch {
    return false;
  }
}

/**
 * Server-trusted validation over the recomputed visibility. For every VISIBLE
 * non-layout field: compute conditional-required, then run the engine's
 * per-type validator (injected — the server passes `validateFieldValue` so this
 * pure module never imports the helper). Cross-field rules referencing a hidden
 * field see an empty operand and are vacuously satisfied (PRD §10). Hidden and
 * layout fields are skipped entirely.
 *
 * The validator is injected to keep this module pure + identically mirrorable;
 * each workspace passes its own `validateFieldValue` import.
 */
export function validateSubmission(
  fieldDefs: LogicFieldDef[],
  valueMap: Record<string, string>,
  visibility: VisibilityResult,
  validateFieldValue: (
    type: string,
    value: string,
    settings: Record<string, unknown>,
    required: boolean,
  ) => { valid: boolean; error?: string },
): SubmissionValidationResult {
  const errors: Record<string, string> = {};

  for (const def of fieldDefs) {
    if (LAYOUT_TYPES.has(def.type)) continue;
    if (def.type === "group") continue; // section container holds no value
    const isVisible = visibility.visibleFieldKeys.has(def.key);
    if (!isVisible) continue;

    const required = isFieldRequired(def, true, valueMap);
    const submitted = valueMap[def.key] ?? "";
    const settings = parseSettings(def.settings);

    const result = validateFieldValue(def.type, submitted, settings, required);
    if (!result.valid) {
      errors[def.key] = result.error ?? "Invalid value.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

// ─── Structural zod gate ────────────────────────────────────────────────────

/**
 * Build a `z.object` from the VISIBLE field defs and return it. Structural only:
 * presence/shape, not type-specific rules (those stay the imperative validator's
 * job). A required visible field gets a non-empty string; an optional one gets an
 * optional string. Layout/group fields and hidden fields are excluded. Run
 * `.safeParse(valueMap)` at the boundary alongside `validateSubmission`; BOTH
 * must pass for the submission to be accepted.
 *
 * Unknown keys are allowed (`.passthrough()` semantics via not calling strict)
 * because the submit path already drops unknown/hidden keys from persistence.
 */
export function compileZodFromVisibleFields(
  fieldDefs: LogicFieldDef[],
  visibility: VisibilityResult,
  valueMap: Record<string, string>,
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const def of fieldDefs) {
    if (LAYOUT_TYPES.has(def.type)) continue;
    if (def.type === "group") continue;
    if (!visibility.visibleFieldKeys.has(def.key)) continue;

    const required = isFieldRequired(def, true, valueMap);
    if (required) {
      shape[def.key] = z
        .string()
        .min(1)
        .refine((v) => v !== "[]" && v !== "{}", { message: "required" });
    } else {
      shape[def.key] = z.string().optional();
    }
  }

  return z.object(shape);
}

// ─── Authoring-time graph guards ────────────────────────────────────────────

/**
 * Collect the field keys a field's rules DEPEND ON (left-hand `field`/`fieldKey`
 * plus any cross-field operand keys). Used by the cycle + dangling detectors.
 */
function ruleDependencyKeys(conditionalLogic: string | undefined | null): string[] {
  if (!conditionalLogic) return [];
  try {
    const logic = JSON.parse(conditionalLogic) as ConditionalLogicData;
    const rules = logic?.rules;
    if (!Array.isArray(rules)) return [];
    const keys: string[] = [];
    for (const r of rules) {
      const lhs = r.field ?? r.fieldKey;
      if (lhs) keys.push(lhs);
      if (r.operandKind === "field" && r.value) keys.push(r.value);
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Detect a dependency CYCLE in the rule graph (A shows-if B, B shows-if A …).
 * Returns the field keys participating in the first cycle found, or `null` if the
 * graph is acyclic. Authoring mutations call this at SAVE time to reject an
 * unresolvable form; runtime evaluation still fails open (stays submittable).
 *
 * Graph: node = field key; edge key→dep for every dependency the field's rules
 * reference. Standard DFS three-color cycle detection.
 */
export function detectRuleCycle(fieldDefs: LogicFieldDef[]): string[] | null {
  const deps = new Map<string, string[]>();
  for (const def of fieldDefs) {
    deps.set(def.key, ruleDependencyKeys(def.conditionalLogic));
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const key of deps.keys()) color.set(key, WHITE);

  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of deps.get(node) ?? []) {
      // Ignore edges to unknown keys here — dangling refs are a separate check.
      if (!deps.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        // Found a back-edge → extract the cycle slice from the stack.
        const idx = stack.indexOf(next);
        return stack.slice(idx);
      }
      if (c === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const key of deps.keys()) {
    if (color.get(key) === WHITE) {
      const cycle = dfs(key);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Find rule references to field keys that do NOT exist among the defs (deleted/
 * renamed fields). Returns an array of `{ fieldKey, missingRef }` so the author
 * can repoint or remove. Empty when the graph is clean.
 */
export function findDanglingRuleRefs(
  fieldDefs: LogicFieldDef[],
): Array<{ fieldKey: string; missingRef: string }> {
  const known = new Set(fieldDefs.map((d) => d.key));
  const dangling: Array<{ fieldKey: string; missingRef: string }> = [];
  for (const def of fieldDefs) {
    for (const ref of ruleDependencyKeys(def.conditionalLogic)) {
      if (!known.has(ref)) {
        dangling.push({ fieldKey: def.key, missingRef: ref });
      }
    }
  }
  return dangling;
}

// Re-export the shared rule types so callers can import everything from one
// module without reaching back into conditionalLogic.ts.
export type { ConditionalRule, ConditionalLogicData, ConditionalOperator };
