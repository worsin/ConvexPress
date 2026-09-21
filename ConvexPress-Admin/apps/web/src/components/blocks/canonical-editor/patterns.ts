import { editorDefinitions, type EditorField } from "../../../../../../../blocks/.generated/editor-metadata";
import { collectCanonicalAnchors, validateCanonicalTree } from "../../../../../../../blocks/.generated/instances";
import { anchorDescriptors } from "../../../../../../../blocks/.generated/metadata";
import type { CanonicalTree } from "../../../../../../../blocks/.generated/types";

/** Clone authored content only. Each insertion owns its IDs and semantic anchors;
 * intra-pattern links follow the new anchors, other links remain untouched. */
export function instantiatePattern(input: CanonicalTree): CanonicalTree {
  const tree = structuredClone(validateCanonicalTree(input));
  const anchors = new Map<string, string>();
  const collect = (nodes: CanonicalTree) => { for (const node of nodes) {
    for (const { value } of collectCanonicalAnchors(node.attrs, anchorDescriptors[node.name]))
      anchors.set(value, `${value.slice(0, 36)}_${crypto.randomUUID()}`);
    if (node.anchor) anchors.set(node.anchor, `${node.anchor.slice(0, 36)}_${crypto.randomUUID()}`);
    collect(node.children ?? []);
  } };
  collect(tree);
  const link = (href: string) => href.startsWith("#") && anchors.has(href.slice(1)) ? `#${anchors.get(href.slice(1))}` : href;
  const fieldValue = (field: EditorField, value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (field.domId && typeof value === "string") return anchors.get(value) ?? value;
    if (field.type === "link") {
      if (typeof value === "string") return link(value);
      const record = value as Record<string, unknown>;
      return { ...record, ...(typeof record.href === "string" ? { href: link(record.href) } : {}) };
    }
    if (field.type === "richtext") {
      const visit = (item: unknown): unknown => {
        if (Array.isArray(item)) return item.map(visit);
        if (!item || typeof item !== "object") return item;
        const record = item as Record<string, unknown>;
        if (record.type === "link" && record.attrs && typeof record.attrs === "object") {
          const attrs = record.attrs as Record<string, unknown>;
          return { ...record, attrs: { ...attrs, ...(typeof attrs.href === "string" ? { href: link(attrs.href) } : {}) } };
        }
        return Object.fromEntries(Object.entries(record).map(([key, nested]) => [key, visit(nested)]));
      };
      return visit(value);
    }
    if (field.type === "object") return fields(field.fields ?? [], value as Record<string, unknown>);
    if (field.type === "repeater" && Array.isArray(value)) return value.map(item => field.item ? fieldValue(field.item, item) : fields(field.fields ?? [], item));
    return value;
  };
  const fields = (definitions: readonly EditorField[], attrs: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(attrs).map(([key, value]) => {
    const field = definitions.find(item => item.id === key);
    return [key, field ? fieldValue(field, value) : value];
  }));
  const visit = (nodes: CanonicalTree): CanonicalTree => nodes.map(node => ({
    ...node, id: `block_${crypto.randomUUID()}`,
    attrs: fields(editorDefinitions[node.name].fields, node.attrs),
    ...(node.anchor ? { anchor: anchors.get(node.anchor) } : {}),
    ...(node.children ? { children: visit(node.children) } : {}),
  })) as CanonicalTree;
  return validateCanonicalTree(visit(tree));
}
