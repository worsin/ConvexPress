import type { CanonicalTree } from "./generated/types";
import type { RuntimeCanonicalTree } from "./composedRegistry";
import { canonicalJson } from "./shared/fingerprints";

/** Reusable display bodies are always redacted, including editor previews.
 * Editing their private fields belongs to the separately authorized source editor. */
export function publicCanonicalTree(nodes: CanonicalTree): CanonicalTree;
export function publicCanonicalTree(nodes: RuntimeCanonicalTree): RuntimeCanonicalTree;
export function publicCanonicalTree(nodes: RuntimeCanonicalTree): RuntimeCanonicalTree {
  return nodes.map(node => {
    const { lock: _lock, children, ...visible } = node;
    return { ...visible,
      ...(node.name === "core/contact-form" ? { attrs: { ...node.attrs, recipientEmail: "" } } : {}),
      ...(children ? { children: publicCanonicalTree(children) } : {}),
    } as RuntimeCanonicalTree[number];
  });
}
export function assertPublicCanonicalTree(nodes: RuntimeCanonicalTree): void {
  if (canonicalJson(nodes) !== canonicalJson(publicCanonicalTree(nodes))) throw new Error("Private authoring fields are forbidden in public display");
}
