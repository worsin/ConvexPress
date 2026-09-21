import { z } from "./schema.mjs";
import { createCanonicalNodeSchema } from "./instance-runtime.mjs";
// Convex validates finite storage shape. Full generated tree validation still
// enforces recursive attrs, names, versions, URLs, limits and cross-field policy.
function emit(shape) {
  if (shape.const !== undefined) return `v.literal(${JSON.stringify(shape.const)})`;
  if (shape.enum) return shape.enum.length === 1 ? `v.literal(${JSON.stringify(shape.enum[0])})` : `v.union(${shape.enum.map(value=>`v.literal(${JSON.stringify(value)})`).join(",")})`;
  if (shape.anyOf) return `v.union(${shape.anyOf.map(emit).join(",")})`;
  if (!shape.type) return "v.any()";
  if (shape.type === "string") return "v.string()";
  if (shape.type === "number" || shape.type === "integer") return "v.number()";
  if (shape.type === "boolean") return "v.boolean()";
  if (shape.type === "null") return "v.null()";
  if (shape.type === "array") return `v.array(${emit(shape.items)})`;
  if (shape.type === "object") {
    if (!shape.properties && shape.additionalProperties && typeof shape.additionalProperties === "object") return `v.record(v.string(),${emit(shape.additionalProperties)})`;
    if (shape.additionalProperties !== false) throw Error("Storage objects must be closed or explicit records");
    return `v.object({${Object.entries(shape.properties??{}).map(([key,value])=>`${JSON.stringify(key)}:${shape.required?.includes(key)?emit(value):`v.optional(${emit(value)})`}`).join(",")}})`;
  }
  throw Error(`Unsupported storage schema type: ${shape.type}`);
}
export function canonicalStorageValidatorSource() { return emit(z.toJSONSchema(createCanonicalNodeSchema(z))); }
