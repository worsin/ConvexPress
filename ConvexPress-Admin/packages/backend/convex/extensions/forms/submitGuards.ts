/**
 * ConvexPress Forms — public-submit payload bounds (pure, additive)
 *
 * The public `submit` mutation is UNAUTHENTICATED and accepts an arbitrary
 * `values: Array<{ fieldKey, value }>`. Convex's own arg validator bounds the
 * SHAPE (each entry is `{string, string}`) but NOT the size: without an explicit
 * cap a bot can post a multi-megabyte array, a single colossal string, or a
 * deeply-nested repeater JSON blob and force the mutation to churn (a write-side
 * DoS, and downstream the events dispatcher / fieldValues store inherit the bulk).
 *
 * This module is the single, pure, unit-testable home for those bounds. The
 * mutation calls {@link checkSubmissionPayload} FIRST (after loading the form,
 * before visibility / validation / calc / writes) and rejects an abusive payload
 * with a low-detail error — exactly like the spam guard. ADDITIVE: a
 * within-bounds payload (every legitimate form) is unaffected.
 *
 * Pure module: no Convex imports, no ctx, no I/O. Trivially testable with
 * `bun test`.
 */

/**
 * Default payload limits. Chosen well above any realistic authored form so a
 * legitimate submission never trips them, while still capping the abusive case:
 *   - `maxValueEntries`   — number of `{fieldKey,value}` pairs. A huge real form
 *     is ~hundreds of fields; 1000 is comfortably above that.
 *   - `maxValueLength`    — characters in a single `value` string. A wysiwyg /
 *     long textarea is realistically < 64KB; 256KB is a generous ceiling.
 *   - `maxTotalLength`    — summed characters across ALL values, so many
 *     medium-sized values can't multiply into an enormous aggregate.
 *   - `maxFieldKeyLength` — a field key is a short slug; 256 is far above real.
 *   - `maxJsonDepth`      — nesting depth of any value that parses as JSON
 *     (a repeater's row array, a multiselect array). Bounds a hostile
 *     deeply-nested blob that could blow the stack in a later `JSON.parse`-walk.
 *   - `maxJsonNodes`      — total array/object nodes in a parsed value, bounding
 *     a wide-but-shallow `[[],[],[],…]` array.
 */
export const SUBMIT_PAYLOAD_LIMITS = {
  maxValueEntries: 1000,
  maxValueLength: 256 * 1024, // 256 KB per value
  maxTotalLength: 1024 * 1024, // 1 MB summed
  maxFieldKeyLength: 256,
  maxJsonDepth: 32,
  maxJsonNodes: 10_000,
} as const;

export type SubmitPayloadLimits = typeof SUBMIT_PAYLOAD_LIMITS;

/** Why a payload was rejected. Kept coarse — the caller throws a low-detail error. */
export type PayloadRejectReason =
  | "too_many_entries"
  | "value_too_long"
  | "total_too_long"
  | "field_key_too_long"
  | "json_too_deep"
  | "json_too_many_nodes";

export interface PayloadCheckResult {
  ok: boolean;
  reason?: PayloadRejectReason;
}

/**
 * Measure the maximum nesting depth and total node count of an already-parsed
 * JSON value WITHOUT recursion (an explicit stack), so a hostile deeply-nested
 * blob bounds-checks safely instead of blowing the call stack. Primitives have
 * depth 0 and contribute no nodes; each array/object is one node at its level.
 * Short-circuits as soon as either limit is exceeded.
 */
export function measureJson(
  value: unknown,
  maxDepth: number,
  maxNodes: number,
): { depth: number; nodes: number; exceeded: "depth" | "nodes" | null } {
  let maxSeenDepth = 0;
  let nodes = 0;
  // Explicit work stack of [value, depth]. Iterative ⇒ no native-stack overflow.
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 0 }];

  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (v === null || typeof v !== "object") continue; // primitive: no node, depth 0

    nodes += 1;
    if (nodes > maxNodes) return { depth: maxSeenDepth, nodes, exceeded: "nodes" };

    const childDepth = d + 1;
    if (childDepth > maxSeenDepth) maxSeenDepth = childDepth;
    if (childDepth > maxDepth) {
      return { depth: childDepth, nodes, exceeded: "depth" };
    }

    if (Array.isArray(v)) {
      for (const child of v) stack.push({ v: child, d: childDepth });
    } else {
      for (const key of Object.keys(v as Record<string, unknown>)) {
        stack.push({ v: (v as Record<string, unknown>)[key], d: childDepth });
      }
    }
  }
  return { depth: maxSeenDepth, nodes, exceeded: null };
}

/**
 * Bounds-check a public submission payload. Pure: takes the raw `values` array
 * (and optional overrides for the limits) and returns ok / a reject reason. The
 * mutation rejects on `!ok` BEFORE doing any DB work, so an abusive payload costs
 * one O(n) scan rather than a full validate+calc+write cycle.
 *
 * A value that does not parse as JSON is treated as a plain scalar string — only
 * its length is bounded (most field values are scalars; the JSON depth/node
 * checks apply only to values that actually parse into a container).
 */
export function checkSubmissionPayload(
  values: ReadonlyArray<{ fieldKey: string; value: string }>,
  limits: SubmitPayloadLimits = SUBMIT_PAYLOAD_LIMITS,
): PayloadCheckResult {
  if (values.length > limits.maxValueEntries) {
    return { ok: false, reason: "too_many_entries" };
  }

  let total = 0;
  for (const entry of values) {
    if (entry.fieldKey.length > limits.maxFieldKeyLength) {
      return { ok: false, reason: "field_key_too_long" };
    }
    const len = entry.value.length;
    if (len > limits.maxValueLength) {
      return { ok: false, reason: "value_too_long" };
    }
    total += len;
    if (total > limits.maxTotalLength) {
      return { ok: false, reason: "total_too_long" };
    }

    // Only values that parse into a container (array/object — e.g. a repeater's
    // rows or a multiselect) are depth/node-bounded. A scalar string that merely
    // *looks* like JSON ("42", "true") parses to a primitive and is ignored here.
    const trimmed = entry.value.trim();
    if (
      trimmed.length > 1 &&
      (trimmed[0] === "[" || trimmed[0] === "{")
    ) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = undefined; // not valid JSON → just a scalar string, already length-bounded
      }
      if (parsed !== undefined && parsed !== null && typeof parsed === "object") {
        const m = measureJson(parsed, limits.maxJsonDepth, limits.maxJsonNodes);
        if (m.exceeded === "depth") return { ok: false, reason: "json_too_deep" };
        if (m.exceeded === "nodes") {
          return { ok: false, reason: "json_too_many_nodes" };
        }
      }
    }
  }

  return { ok: true };
}
