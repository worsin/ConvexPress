/**
 * Custom Field System - Location Rule Evaluation Engine (Standalone)
 *
 * Extracted from queries.ts for reusability across the system.
 * Evaluates location rules against an editor context to determine
 * which field groups should be shown.
 *
 * Rule structure:
 *   - Top level: array of groups (OR logic between groups)
 *   - Each group: array of conditions (AND logic within group)
 *   - Each condition: { param, operator, value }
 *
 * If ANY group matches (all its conditions pass), the field group is shown.
 * Empty rules array = show nowhere.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LocationCondition {
  param: string;
  operator: "==" | "!=";
  value: string;
}

export type LocationRules = LocationCondition[][];

export interface LocationContext {
  postType?: string;
  postTemplate?: string;
  postStatus?: string;
  postCategories?: string[];
  pageTemplate?: string;
  pageType?: string;
  pageParent?: string;
  currentUserRole?: string;
  taxonomy?: string;
}

// ─── Context Value Resolver ─────────────────────────────────────────────────

/**
 * Get the context value for a location rule parameter.
 * Maps parameter names to their corresponding context values.
 */
export function getContextValue(
  param: string,
  context: LocationContext,
): string | string[] | undefined {
  switch (param) {
    case "post_type":
      return context.postType;
    case "post_template":
      return context.postTemplate;
    case "post_status":
      return context.postStatus;
    case "post_category":
      return context.postCategories;
    case "page_template":
      return context.pageTemplate;
    case "page_type":
      return context.pageType;
    case "page_parent":
      return context.pageParent;
    case "current_user_role":
      return context.currentUserRole;
    case "taxonomy":
      return context.taxonomy;
    default:
      return undefined;
  }
}

// ─── Condition Evaluation ───────────────────────────────────────────────────

/**
 * Evaluate a single location condition against a context.
 *
 * - If the context doesn't have the param, == fails and != passes
 * - Array context values use includes() for matching
 */
export function evaluateCondition(
  condition: LocationCondition,
  context: LocationContext,
): boolean {
  const contextValue = getContextValue(condition.param, context);

  // If context doesn't have the param, condition fails for == and passes for !=
  if (contextValue === undefined) {
    return condition.operator === "!=";
  }

  const matches = Array.isArray(contextValue)
    ? contextValue.includes(condition.value)
    : contextValue === condition.value;

  return condition.operator === "==" ? matches : !matches;
}

// ─── Location Rules Evaluation ──────────────────────────────────────────────

/**
 * Evaluate location rules against a context.
 *
 * Rules are OR between groups, AND within groups.
 * Empty rules array = show nowhere (returns false).
 *
 * @param rules - Array of rule groups (OR between groups, AND within each group)
 * @param context - The current editor context to evaluate against
 * @returns true if the field group should be shown in this context
 */
export function evaluateLocationRules(
  rules: LocationRules,
  context: LocationContext,
): boolean {
  if (rules.length === 0) return false;

  // OR between groups: if ANY group matches, show the field group
  return rules.some((group) => {
    // AND within group: ALL conditions must match
    return group.every((condition) => {
      return evaluateCondition(condition, context);
    });
  });
}

// ─── Rule Summary ───────────────────────────────────────────────────────────

/**
 * Generate a human-readable summary of location rules.
 * Useful for displaying in the field group list table.
 *
 * @param rules - The location rules to summarize
 * @returns A readable string like "Post Type == post AND Post Status == publish"
 */
export function summarizeLocationRules(rules: LocationRules): string {
  if (rules.length === 0) return "No rules (hidden everywhere)";

  const paramLabels: Record<string, string> = {
    post_type: "Post Type",
    post_template: "Post Template",
    post_status: "Post Status",
    post_category: "Post Category",
    page_template: "Page Template",
    page_type: "Page Type",
    page_parent: "Page Parent",
    current_user_role: "User Role",
    taxonomy: "Taxonomy",
  };

  return rules
    .map((group) =>
      group
        .map((c) => `${paramLabels[c.param] ?? c.param} ${c.operator} ${c.value}`)
        .join(" AND "),
    )
    .join(" OR ");
}
