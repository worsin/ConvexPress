import { createElement, type ComponentType, type ReactNode } from "react";
import * as P from "../primitives";
import { SlotContext } from "../primitives/base";
import { resolveComposition, type ResolvedCompositionNode } from "../block-data/portable/composition";

/** Uses public primitives so active pack overrides and reduced-motion behavior
 * are identical to Library blocks. Resolution finishes before React renders. */
export function CompositionView({ composition, attrs, data, allowedSlots }: {
  composition: unknown;
  attrs: unknown;
  data?: unknown;
  allowedSlots?: readonly string[];
}) {
  const resolved = resolveComposition(composition, { attrs, data }, { allowedSlots });
  return <ResolvedCompositionView root={resolved} />;
}

/** Only host-prepared trees enter here; authored definitions go through the
 * shared evaluator. Local slots cannot reach unrelated template layout slots. */
export function ResolvedCompositionView({ root, slots, packId }: {
  root: ResolvedCompositionNode | null;
  slots?: Readonly<Record<string, ReactNode>>;
  packId?: string;
}) {
  const currentPack = P.usePrimitivePackId();
  if (packId !== undefined && packId !== currentPack) throw Error("Composed presentation belongs to another template pack");
  function render(node: ResolvedCompositionNode, key: string): ReactNode {
    const Primitive = P[node.el] as ComponentType<Record<string, unknown>>;
    return createElement(Primitive, { ...node.props, key }, node.text ?? node.children.map((child, index) => render(child, `${key}.${index}`)));
  }
  const result = root ? render(root, "root") : null;
  return slots ? <SlotContext.Provider value={slots}>{result}</SlotContext.Provider> : result;
}
