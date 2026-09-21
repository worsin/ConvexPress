import { z } from "zod";
import { primitiveSchemas, type PrimitiveName } from "@backend/canonical-blocks-foundation/primitiveContracts";
import type { CompositionNode } from "@backend/canonical-blocks-foundation/composition";
import type { ComposedDefinition } from "@backend/canonical-blocks-foundation/composedDefinitions";
export type NodePath = number[];
export const containerPrimitives = new Set(["Section", "Container", "Stack", "Grid", "Columns", "Split", "Card"]);
export const textPrimitives = new Set(["Heading", "Eyebrow", "Text"]);
export const primitiveNames = Object.keys(primitiveSchemas) as PrimitiveName[];
export interface PropertySchema { type?: string; enum?: (string | number | boolean)[]; const?: string | number | boolean; anyOf?: PropertySchema[]; properties?: Record<string, PropertySchema>; required?: string[]; minimum?: number; maximum?: number; maxLength?: number }
const schemas = new Map<string, PropertySchema>();
export function primitiveProperties(name: PrimitiveName): PropertySchema {
  if (!schemas.has(name)) schemas.set(name, z.toJSONSchema(primitiveSchemas[name], { io: "input" }) as PropertySchema);
  return schemas.get(name)!;
}
/** Only the local editing shape. The full shared definition validator owns save
 * and preview; an incomplete binding remains editable instead of being dropped. */
export function visualDefinition(source: string): ComposedDefinition {
  if (new TextEncoder().encode(source).length > 480 * 1024) throw Error("The definition is too large.");
  const value = JSON.parse(source);
  if (!value?.spec || !Array.isArray(value.spec.fields) || !value.spec.fields.every((field: { id?: unknown; type?: unknown }) => field && typeof field.id === "string" && typeof field.type === "string") || typeof value.spec.supports?.children !== "boolean" || value?.composition?.version !== 1) throw Error("Correct the definition source to open the composition editor.");
  let count = 0;
  const visit = (node: CompositionNode, depth: number) => {
    if (++count > 300 || depth > 8) throw Error("Use at most 300 elements and eight levels.");
    if (!node || !Object.hasOwn(primitiveSchemas, node.el) || (node.children !== undefined && !Array.isArray(node.children))) throw Error("Correct the primitive tree in the definition source.");
    for (const child of node.children ?? []) visit(child, depth + 1);
  };
  visit(value.composition.root, 1);
  for (const treatment of Object.values(value.packTreatments ?? {}) as ComposedDefinition["composition"][]) {
    if (treatment.version !== 1) throw Error("Invalid template composition.");
    count = 0;visit(treatment.root, 1);
  }
  return value;
}
export function nodeAt(root: CompositionNode, path: NodePath): CompositionNode {
  let node = root;
  for (const index of path) {
    if (!Number.isSafeInteger(index) || index < 0 || !node.children?.[index]) throw Error("The selected element changed.");
    node = node.children[index];
  }
  return node;
}
export function compositionOutline(root: CompositionNode, path: NodePath = []): { node: CompositionNode; path: NodePath }[] {
  return [{ node: root, path }, ...(root.children ?? []).flatMap((child, index) => compositionOutline(child, [...path, index]))];
}
export function editComposition(source: string, treatment: string, change: (root: CompositionNode) => CompositionNode): string {
  const value = visualDefinition(source);
  const selected = treatment === "default" ? value.composition : value.packTreatments?.[treatment];
  if (!selected) throw Error("The selected template treatment changed.");
  selected.root = change(structuredClone(selected.root));
  const result = JSON.stringify(value, null, 2);
  visualDefinition(result); // Enforce tree/byte budgets before changing the draft.
  return result;
}
export function newPrimitive(el: PrimitiveName): CompositionNode {
  if (textPrimitives.has(el)) return { el, bind: JSON.stringify(el === "Heading" ? "A new heading" : el === "Eyebrow" ? "YOUR STORY" : "Add your text here.") };
  if (containerPrimitives.has(el)) return { el, children: [] };
  const props: Record<string, unknown> = {}, bind: Record<string, string> = {};
  const schema = primitiveProperties(el);
  for (const key of schema.required ?? []) {
    const field = schema.properties?.[key];
    if (field?.enum) props[key] = field.enum[0];
    else if (field?.const !== undefined) props[key] = field.const;
    else if (key === "href") props[key] = "/";
    else if (field?.type === "string" && key !== "src") props[key] = key === "name" ? "children" : "Your " + key;
    else bind[key] = "attrs." + key;
  }
  return { el, ...(Object.keys(props).length ? { props } : {}), ...(Object.keys(bind).length ? { bind } : {}) };
}
