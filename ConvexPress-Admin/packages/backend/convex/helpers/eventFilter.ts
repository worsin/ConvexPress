/**
 * Event Dispatcher System - Filter Evaluation
 *
 * Provides shallow JSON matching for event listener filter conditions.
 * A listener can specify a filterCondition (JSON string) that must match
 * the event payload for the listener to fire.
 *
 * Matching rules (shallow, top-level only):
 *   - Each key in the filter must exist in the payload
 *   - Each value in the filter must strictly equal the payload value
 *   - Payload may have additional keys not in the filter (they are ignored)
 *   - Empty filter or missing filter always matches
 *   - Nested objects are compared by reference (JSON.stringify equality)
 *
 * Example:
 *   Filter:  { "postType": "page", "status": "published" }
 *   Payload: { "postType": "page", "status": "published", "authorId": "123" }
 *   Result:  true (all filter keys match; extra key "authorId" is ignored)
 */

/**
 * Evaluate whether an event payload matches a listener's filter condition.
 *
 * @param payload - The parsed event payload object
 * @param filterConditionJson - JSON string of the filter condition, or undefined/null
 * @returns true if the payload matches (or if no filter is set)
 */
export function evaluateFilter(
  payload: Record<string, unknown>,
  filterConditionJson: string | undefined | null,
): boolean {
  // No filter = always matches
  if (!filterConditionJson) return true;

  let filter: Record<string, unknown>;
  try {
    filter = JSON.parse(filterConditionJson);
  } catch {
    // If the filter JSON is malformed, treat as non-matching for safety.
    // A bad filter should never silently pass all events through.
    return false;
  }

  // Empty object filter = matches everything
  if (typeof filter !== "object" || filter === null) return false;
  if (Object.keys(filter).length === 0) return true;

  // Shallow match: every key in the filter must exist and match in the payload
  for (const [key, expectedValue] of Object.entries(filter)) {
    if (!(key in payload)) return false;

    const actualValue = payload[key];

    // For primitives, use strict equality
    if (
      typeof expectedValue !== "object" ||
      expectedValue === null ||
      typeof actualValue !== "object" ||
      actualValue === null
    ) {
      if (actualValue !== expectedValue) return false;
      continue;
    }

    // For objects/arrays, compare via JSON serialization
    // This is intentionally simple - deep matching is not supported
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate that a filter condition string is well-formed JSON
 * and represents a plain object (not array, null, primitive).
 *
 * @param filterConditionJson - The filter condition to validate
 * @returns true if valid filter, false otherwise
 */
export function isValidFilterCondition(filterConditionJson: string): boolean {
  try {
    const parsed = JSON.parse(filterConditionJson);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}
