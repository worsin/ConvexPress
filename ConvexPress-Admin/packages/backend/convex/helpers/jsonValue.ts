/**
 * Exact transport for untyped JSON (event payloads, stored settings blobs).
 *
 * Convex validators cannot recurse, so JSON is described by unrolling its shape
 * `depth` container levels deep: level 0 accepts only scalars, every further
 * level adds arrays and records of the level below. The TypeScript type stays
 * recursive; every unrolled level is checked against the same `JsonValue`.
 *
 * The validator doubles in size per level (depth 4 is ~5 KB, depth 7 ~39 KB),
 * so pick the smallest depth the data needs. A value deeper than the bound is
 * brought inside it with `toBoundedJson`, which keeps a too-deep container as
 * its JSON text instead of dropping it.
 *
 * Record keys follow Convex's rules (non-empty ASCII, no leading "$" or "_");
 * entries under other keys cannot be returned through a record validator and
 * are left out.
 */
import { v, type Validator } from "convex/values";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

const jsonScalarValidator = v.union(v.null(), v.boolean(), v.number(), v.string());

/** Validator for JSON nested at most `depth` arrays/objects deep. */
export function boundedJsonValidator(depth: number): Validator<JsonValue, "required", string> {
  let value: Validator<JsonValue, "required", string> = jsonScalarValidator;
  for (let level = 0; level < depth; level++) {
    value = v.union(v.null(), v.boolean(), v.number(), v.string(), v.array(value), v.record(v.string(), value));
  }
  return value;
}

/** Validator for a JSON object whose own nesting counts toward `depth`. */
export function boundedJsonObjectValidator(depth: number): Validator<JsonObject, "required", string> {
  return v.record(v.string(), boundedJsonValidator(Math.max(0, depth - 1)));
}

/** A key Convex accepts in a record value. */
export function isConvexRecordKey(key: string): boolean {
  return key.length > 0 && !key.startsWith("$") && !key.startsWith("_") && /^[\x20-\x7e]+$/.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof ArrayBuffer);
}

/** JSON text for a value that does not fit the bound; never throws. */
function jsonText(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, entry: unknown) => (typeof entry === "bigint" ? entry.toString() : entry)) ?? "null";
  } catch {
    return "null";
  }
}

/**
 * Bring an untyped value inside `boundedJsonValidator(depth)`.
 * Returns undefined only for values JSON has no form for (undefined,
 * functions, symbols, bytes), so callers can omit them.
 */
export function toBoundedJson(value: unknown, depth: number): JsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) {
    if (depth <= 0) return jsonText(value);
    return value.map((entry) => toBoundedJson(entry, depth - 1) ?? null);
  }
  if (isPlainObject(value)) {
    if (depth <= 0) return jsonText(value);
    return toBoundedJsonObject(value, depth);
  }
  return undefined;
}

/** Bring an untyped object inside `boundedJsonObjectValidator(depth)`. */
export function toBoundedJsonObject(value: Record<string, unknown>, depth: number): JsonObject {
  const out: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isConvexRecordKey(key)) continue;
    const json = toBoundedJson(entry, depth - 1);
    if (json !== undefined) out[key] = json;
  }
  return out;
}

/**
 * The value at `path` inside parsed, untyped JSON (string keys step into
 * objects, number keys into arrays), or undefined when any step is missing.
 */
export function jsonAt(value: unknown, ...path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") current = Array.isArray(current) ? current[key] : undefined;
    else current = isPlainObject(current) ? current[key] : undefined;
    if (current === undefined) return undefined;
  }
  return current;
}

/** Parse JSON text into a bounded value; undefined when the text is not JSON. */
export function parseBoundedJson(text: string, depth: number): JsonValue | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return toBoundedJson(parsed, depth);
}

/** Parse JSON text that must hold an object; undefined otherwise. */
export function parseBoundedJsonObject(text: string, depth: number): JsonObject | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return isPlainObject(parsed) ? toBoundedJsonObject(parsed, depth) : undefined;
}
