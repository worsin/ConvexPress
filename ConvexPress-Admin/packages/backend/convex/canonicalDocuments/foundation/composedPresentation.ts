import type { BlockField } from "./generated/spec_runtime.mjs";
import type { ComposedDefinition } from "./composedDefinitions";
import { copyCompositionJson } from "./compositionExpressions";
import { resolveComposition, type ResolvedCompositionNode } from "./composition";
import { mediaSchema, renderMediaSchema } from "./renderResources";
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
export const COMPOSED_PRESENTATION_LIMITS = Object.freeze({ pageNodes: 2400, pageBytes: 512 * 1024 });

/** Convert validated authored media references to host-authorized public media.
 * Resolver args and stored attrs keep their original IDs; only presentation uses
 * this copy. The callback never grants access and must not resolve arbitrary URLs. */
export function composedPresentationAttrs(fields: readonly BlockField[], attrs: unknown, readMedia: (id: string) => unknown): Record<string, unknown> {
  const source = copyCompositionJson(attrs) as Record<string, unknown>;
  function fieldValue(field: BlockField, value: unknown): unknown {
    if (value === undefined || value === null || value === "") return value;
    if (field.type === "media") {
      const authored = typeof value === "string" ? { id: value } : value as { id: string; alt?: string; focalPoint?: { x: number; y: number } };
      const media = readMedia(authored.id);
      if (!media || typeof media !== "object") throw Error("Composed block media has no authorized public resource");
      const resolved = renderMediaSchema.parse(media);
      const focalPoint = authored.focalPoint ?? resolved.focalPoint;
      return mediaSchema.parse({ src: resolved.src, alt: authored.alt ?? resolved.alt,
        ...(resolved.width === undefined ? {} : { width: resolved.width }),
        ...(resolved.height === undefined ? {} : { height: resolved.height }),
        ...(focalPoint === undefined ? {} : { focalPoint }) });
    }
    if (field.type === "object") return project(field.fields, value as Record<string, unknown>);
    if (field.type === "repeater") return (value as unknown[]).map(item => field.fields ? project(field.fields, item as Record<string, unknown>) : fieldValue(field.item!, item));
    return value;
  }
  function project(items: readonly BlockField[], input: Record<string, unknown>) {
    const result = { ...input };
    for (const field of items) if (hasOwn(input, field.id)) result[field.id] = fieldValue(field, input[field.id]);
    return result;
  }
  return project(fields, source);
}

/** Fully resolve before rendering so anchors, budgets and child consumption are
 * checked for the whole page before any React component can produce output. */
export function resolveComposedPresentation(definition: ComposedDefinition, attrs: unknown, options: {
  packId: string; readMedia: (id: string) => unknown; data?: unknown; childCount?: number;
}): { root: ResolvedCompositionNode | null; anchors: string[]; nodes: number; bytes: number } {
  const composition = hasOwn(definition.packTreatments ?? {}, options.packId)
    ? definition.packTreatments![options.packId] : definition.composition;
  const root = resolveComposition(composition, { attrs: composedPresentationAttrs(definition.spec.fields, attrs, options.readMedia), data: options.data },
    { allowedSlots: definition.spec.supports.children ? ["children"] : [] });
  const anchors: string[] = [];
  let childrenSlots = 0;
  let nodes = 0;
  function visit(node: ResolvedCompositionNode) {
    nodes++;
    if (typeof node.props.anchor === "string") anchors.push(node.props.anchor);
    if (node.el === "Slot") childrenSlots++;
    node.children.forEach(visit);
  }
  if (root) visit(root);
  if (childrenSlots > 1 || ((options.childCount ?? 0) > 0 && childrenSlots !== 1)) throw Error("Composed blocks must render authored children in exactly one children slot");
  return { root, anchors, nodes, bytes: new TextEncoder().encode(JSON.stringify(root)).length };
}
