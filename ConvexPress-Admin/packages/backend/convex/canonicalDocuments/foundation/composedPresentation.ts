import { dependencyFields, type BlockField } from "./generated/spec_runtime.mjs";
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
  /** Internal search projection of authored copy outside recursive result branches. */
  omitDataDependentNodes?: boolean;
}): { root: ResolvedCompositionNode | null; anchors: string[]; nodes: number; bytes: number } {
  const composition = hasOwn(definition.packTreatments ?? {}, options.packId)
    ? definition.packTreatments![options.packId] : definition.composition;
  const root = resolveComposition(composition, { attrs: composedPresentationAttrs(definition.spec.fields, attrs, options.readMedia), data: options.data },
    { allowedSlots: definition.spec.supports.children ? ["children"] : [], omitDataDependentNodes: options.omitDataDependentNodes });
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
  if (childrenSlots > 1 || (!options.omitDataDependentNodes && (options.childCount ?? 0) > 0 && childrenSlots !== 1)) throw Error("Composed blocks must render authored children in exactly one children slot");
  return { root, anchors, nodes, bytes: new TextEncoder().encode(JSON.stringify(root)).length };
}

/** Shared by the actual renderer and text projection. A reference field must
 * belong to this exact installed resolver binding, even when its primitive does
 * not read the value. Media has its separate authorized-resource path. */
export function assertComposedReferenceBindings(definition: ComposedDefinition, attrs: unknown, args: unknown, hasData: boolean): void {
  const bound = new Set<string>();
  const collect = (value: unknown) => {
    if (typeof value === "string") bound.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(args);
  const valuesAt = (value: unknown, path: readonly string[]): unknown[] => {
    if (!path.length) return [value];
    const [head, ...tail] = path;
    if (head === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, tail)) : [];
    return value && typeof value === "object" && hasOwn(value, head) ? valuesAt((value as Record<string, unknown>)[head], tail) : [];
  };
  for (const field of dependencyFields(definition.spec.fields)) {
    if (field.type === "media") continue;
    for (const value of valuesAt(attrs, field.path).flatMap(item => valuesAt(item, field.valuePath))) {
      if (value === undefined || value === null || (value === "" && field.allowEmpty)) continue;
      if (!hasData || typeof value !== "string" || !bound.has(value)) throw Error("Custom reference must belong to the installed resolver binding");
    }
  }
}
