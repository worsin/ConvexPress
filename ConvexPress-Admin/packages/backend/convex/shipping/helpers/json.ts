/**
 * Reading carrier API JSON without `any`.
 *
 * Carrier responses are untrusted, loosely documented JSON. Every value is read
 * as `unknown` and narrowed where it is used: `at` walks a path, `str`/`num`
 * accept only the primitive the caller needs, and `list` yields an array.
 */

export type JsonObject = { readonly [key: string]: unknown };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value at `path` (object keys and array indexes), or undefined. */
export function at(value: unknown, ...path: ReadonlyArray<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!isJsonObject(current)) return undefined;
      current = current[key];
    }
  }
  return current;
}

/** A string (numbers are rendered as strings, as carriers mix the two), else undefined. */
export function str(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/** A finite number (numeric strings are parsed), else undefined. */
export function num(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** An array, else an empty array. */
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Parses a response body; a non-object body reads as an empty object. */
export async function readJson(response: Response): Promise<JsonObject> {
  const body: unknown = await response.json();
  return isJsonObject(body) ? body : {};
}

/** Parses a JSON string; a non-object document reads as an empty object. */
export function parseJsonObject(text: string): JsonObject {
  const body: unknown = JSON.parse(text);
  return isJsonObject(body) ? body : {};
}

/** Epoch ms for a truthy carrier timestamp (ISO string or epoch number), else undefined. */
export function timeOf(value: unknown): number | undefined {
  if ((typeof value === "string" || typeof value === "number") && value) return new Date(value).getTime();
  return undefined;
}
