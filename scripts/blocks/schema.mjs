import { createRequire } from "node:module";
import { createBlockSpecCompiler } from "./spec-runtime.mjs";
// Reuse the Admin workspace's pinned Zod dependency.
const require = createRequire(new URL("../../ConvexPress-Admin/package.json", import.meta.url));
export const { z } = require("zod");
export const { fieldSchema, fieldTypeNames, treatmentAxisSchema, blockSpecSchema, attrsSchema, parseBlockSpec } = createBlockSpecCompiler(z);
export const blockSpecJsonSchema = z.toJSONSchema(blockSpecSchema, { target: "draft-2020-12", cycles: "ref" });

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const q = value => JSON.stringify(canonical(value));
export function zodField(field) {
  let code;
  switch (field.type) {
    case "text": code = (field.format ? `formattedTextSchema(z,${q(field.format)})` : "z.string()") + (field.max !== undefined ? `.max(${field.max})` : "") + (field.min !== undefined ? `.min(${field.min})` : ""); break;
    case "number": code = "z.number()" + (field.integer ? ".int()" : "") + (field.min !== undefined ? `.min(${field.min})` : "") + (field.max !== undefined ? `.max(${field.max})` : ""); break;
    case "boolean": code = "z.boolean()"; break;
    case "select": code = field.options.length === 1 ? `z.literal(${q(field.options[0])})` : `z.union([${field.options.map(option => `z.literal(${q(option)})`).join(",")}])`; break;
    case "color-role": code = 'z.enum(["primary","accent","muted"])'; break;
    case "icon": code = field.options ? `z.enum(${q(field.options)})` : 'z.string().max(100).regex(/^[a-z][a-z0-9-]*$/)'; break;
    case "date": code = "dateSchema(z)"; break;
    case "link": code = field.storage === "href" ? `safeLinkSchema(z,${q(field.protocols) ?? "undefined"})${field.max !== undefined ? `.max(${field.max})` : ""}${field.allowEmpty ? '.or(z.literal(""))' : ""}` : `z.object({label:z.string().max(160),href:safeLinkSchema(z,${q(field.protocols) ?? "undefined"}),newTab:z.boolean().optional()}).strict()`; break;
    case "media": code = field.storage === "id" ? `z.string()${field.allowEmpty ? "" : ".min(1)"}${field.max !== undefined ? `.max(${field.max})` : ""}` : 'z.object({id:z.string().min(1).max(256),alt:z.string().max(1000).optional(),focalPoint:z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1)}).strict().optional()}).strict()'; break;
    case "reference": code = `z.string()${field.allowEmpty ? "" : ".min(1)"}${field.max !== undefined ? `.max(${field.max})` : ""}`; break;
    case "menu": case "form": code = 'z.string().min(1).max(256)'; break;
    case "richtext": code = `createRichTextSchema(z,${field.max ?? 100000},${field.inline === true})`; break;
    case "object": code = zodObject(field.fields, field.constraints); break;
    case "repeater": code = `z.array(${field.item ? zodField(field.item) : zodObject(field.fields, field.constraints)})` + (field.max !== undefined ? `.max(${field.max})` : "") + (field.min !== undefined ? `.min(${field.min})` : ""); break;
    default: throw new Error(`Unknown field type ${field.type}`);
  }
  if (field.nullable) code += ".nullable()";
  // Prefault parses the default through nested schemas, so an object default
  // cannot skip its children's validation/defaults or lie about its output type.
  if (Object.hasOwn(field, "default")) code += `.prefault(${q(field.default)})`;
  else if (!field.required) code += ".optional()";
  return code;
}
export const zodObject = (fields, constraints) => {
  const object = `z.object({${fields.map(field => `${q(field.id)}:${zodField(field)}`).join(",")}}).strict()`;
  return constraints?.length ? `constrainObject(${object},${q(constraints)})` : object;
};
