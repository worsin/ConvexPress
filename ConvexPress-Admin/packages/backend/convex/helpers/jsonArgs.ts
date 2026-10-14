/**
 * JSON-encoded arguments for genuinely open-ended payloads (integrator
 * metadata, workflow input and results, order-change details).
 *
 * A public function never accepts `v.any()`. When no validator can describe a
 * value because its shape belongs to whoever calls the API, the value crosses
 * the boundary as JSON text (`metadataJson: v.string()`) and is parsed and
 * checked here instead:
 *
 * - it must be valid JSON (and a JSON object where the caller asks for one);
 * - every object key must be one Convex can store and return through a record
 *   validator (`isConvexRecordKey`);
 * - it may nest at most `maxDepth` arrays/objects deep, counted the same way as
 *   `boundedJsonValidator(depth)`, so the stored value always fits that
 *   validator should its column be tightened later.
 *
 * A value that breaks any rule is refused with a VALIDATION_ERROR naming the
 * argument. Nothing is silently dropped or rewritten.
 */
import { ConvexError } from "convex/values";

import { isConvexRecordKey, type JsonObject, type JsonValue } from "./jsonValue";

/** Default container depth for open-ended JSON arguments. */
export const JSON_ARGUMENT_MAX_DEPTH = 8;

function refuse(argument: string, problem: string): never {
  throw new ConvexError({ code: "VALIDATION_ERROR", message: `${argument} ${problem}` });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Check parsed JSON against the key and depth rules; `depth` is the container budget left. */
function checked(value: unknown, argument: string, depth: number, maxDepth: number): JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (depth <= 0) refuse(argument, `nests deeper than ${maxDepth} levels.`);
    return value.map((entry) => checked(entry, argument, depth - 1, maxDepth));
  }
  if (isPlainObject(value)) return checkedObject(value, argument, depth, maxDepth);
  return refuse(argument, "is not JSON.");
}

function checkedObject(value: Record<string, unknown>, argument: string, depth: number, maxDepth: number): JsonObject {
  if (depth <= 0) refuse(argument, `nests deeper than ${maxDepth} levels.`);
  const out: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isConvexRecordKey(key)) refuse(argument, `has an unsupported key ${JSON.stringify(key)}: keys must be non-empty printable ASCII and must not start with "$" or "_".`);
    out[key] = checked(entry, argument, depth - 1, maxDepth);
  }
  return out;
}

function parse(text: string, argument: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return refuse(argument, "is not valid JSON.");
  }
}

/** Parse JSON text holding any JSON value. */
export function parseJsonArgument(text: string, argument: string, maxDepth = JSON_ARGUMENT_MAX_DEPTH): JsonValue {
  return checked(parse(text, argument), argument, maxDepth, maxDepth);
}

/** Parse JSON text that must hold a JSON object. */
export function parseJsonObjectArgument(text: string, argument: string, maxDepth = JSON_ARGUMENT_MAX_DEPTH): JsonObject {
  const parsed = parse(text, argument);
  if (!isPlainObject(parsed)) refuse(argument, "must be a JSON object.");
  return checkedObject(parsed, argument, maxDepth, maxDepth);
}

/** `parseJsonObjectArgument` for an optional argument: absent stays absent. */
export function parseOptionalJsonObjectArgument(
  text: string | undefined,
  argument: string,
  maxDepth = JSON_ARGUMENT_MAX_DEPTH,
): JsonObject | undefined {
  return text === undefined ? undefined : parseJsonObjectArgument(text, argument, maxDepth);
}

/** `parseJsonArgument` for an optional argument: absent stays absent. */
export function parseOptionalJsonArgument(
  text: string | undefined,
  argument: string,
  maxDepth = JSON_ARGUMENT_MAX_DEPTH,
): JsonValue | undefined {
  return text === undefined ? undefined : parseJsonArgument(text, argument, maxDepth);
}
