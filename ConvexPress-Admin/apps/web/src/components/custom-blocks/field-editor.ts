import { z } from "zod";
import { copyBlockSpecJson, createBlockSpecCompiler, type BlockField, type SpecJson } from "@backend/canonical-blocks-foundation/generated/spec-runtime.mjs";
import { visualDefinition } from "./composition-editor";

export type FieldPath = (number | "item")[];
export const fieldTypes = createBlockSpecCompiler(z).fieldTypeNames;
export function fieldDefinition(source: string) {
  const value = visualDefinition(source);
  copyBlockSpecJson(value.spec);
  let count = 0;
  function visit(fields: BlockField[], depth: number) {
    if (depth > 8 || fields.length > 100) throw Error("Use at most eight field levels and 100 fields per group.");
    for (const field of fields) {
      if (++count > 500) throw Error("Use at most 500 fields in a definition.");
      if (!field || typeof field.id !== "string" || !fieldTypes.includes(field.type)) throw Error("Correct the field structure in advanced source.");
      if (field.title !== undefined && typeof field.title !== "string" || field.description !== undefined && typeof field.description !== "string") throw Error("Invalid field label or help text.");
      if (field.type === "select" && (!Array.isArray(field.options) || field.options.some(option => typeof option !== "string" && (typeof option !== "number" || !Number.isFinite(option))))) throw Error("Correct the choice list in advanced source.");
      if (field.type === "link" && field.protocols !== undefined && (!Array.isArray(field.protocols) || field.protocols.some(protocol => typeof protocol !== "string"))) throw Error("Invalid link types.");
      if ("fields" in field && field.fields !== undefined) { if (!Array.isArray(field.fields)) throw Error("Invalid field group.");visit(field.fields, depth + 1); }
      if (field.type === "repeater" && field.item) visit([field.item], depth + 1);
    }
  }
  visit(value.spec.fields, 0);
  return value;
}
export function fieldAt(fields: BlockField[], path: FieldPath): BlockField {
  if (!path.length || typeof path[0] !== "number") throw Error("Choose a field.");
  let field: BlockField | undefined = fields[path[0]];
  for (const part of path.slice(1)) {
    if (!field) throw Error("The selected field changed.");
    field = part === "item" ? (field.type === "repeater" ? field.item : undefined) : ("fields" in field ? field.fields?.[part] : undefined);
  }
  if (!field) throw Error("The selected field changed.");
  return field;
}
export function editFields(source: string, change: (fields: BlockField[]) => void): string {
  const value = fieldDefinition(source);
  change(value.spec.fields);
  const next = JSON.stringify(value, null, 2);
  fieldDefinition(next);
  return next;
}
export function newField(type: BlockField["type"], siblings: BlockField[]): BlockField {
  let n = 1;while (siblings.some(field => field.id === `field${n}`)) n++;
  const base = { id: `field${n}`, title: `Field ${n}` };
  if (type === "select") return { ...base, type, options: ["First choice", "Second choice"] };
  if (type === "reference") return { ...base, type, of: "page", storage: "id" };
  if (type === "object" || type === "repeater") return { ...base, type, fields: [{ id: "text", title: "Text", type: "text" }] };
  return { ...base, type };
}
export function changeFieldType(field: BlockField, type: BlockField["type"]): BlockField {
  const next = newField(type, []);
  return { ...next, id: field.id, ...(field.title === undefined ? {} : { title: field.title }), ...(field.description === undefined ? {} : { description: field.description }), ...(field.required === undefined ? {} : { required: field.required }), ...(field.nullable === undefined ? {} : { nullable: field.nullable }), ...(Object.hasOwn(field, "default") ? { default: field.default as SpecJson } : {}) };
}
export function fieldList(fields: BlockField[], parent: FieldPath | null) {
  if (parent === null) return fields;
  const field = fieldAt(fields, parent);
  if (!("fields" in field) || !field.fields) throw Error("Choose a field group.");
  return field.fields;
}

export function defaultForField(field: BlockField): SpecJson {
  if (field.type === "boolean") return false;
  if (field.type === "number") return field.min ?? 0;
  if (field.type === "select") return field.options[0] ?? "";
  if (field.type === "object") return {};
  if (field.type === "repeater") return [];
  if (field.type === "richtext") return { type: "doc", content: [{ type: "paragraph", content: [] }] };
  if (field.type === "media" && field.storage !== "id") return { id: "", alt: "" };
  if (field.type === "link") return field.storage === "href" ? "/" : { label: "Link", href: "/" };
  if (field.type === "color-role") return "primary";
  return "";
}
