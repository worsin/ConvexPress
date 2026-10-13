/**
 * Exact transport for depth-bounded trees.
 *
 * Convex validators cannot recurse, so a tree is described by unrolling its node
 * shape `levels` times; a node on the last level accepts only an empty child
 * array. A query returning such a tree must cap it to the same `levels`
 * (`capTreeDepth` for nodes whose child key is `children`), so the returned
 * value always matches. The node's TypeScript type stays recursive: every level
 * of the unrolled validator is checked against the same `Node` shape.
 */
import { v, type Validator } from "convex/values";

/**
 * `shape` builds one node from the validator of its child array, and places
 * that array under whatever key the node uses (`children`, `replies`, ...).
 */
export function boundedTreeValidator<Node>(
  levels: number,
  shape: (children: Validator<Node[], "required", string>) => Validator<Node, "required", string>,
): Validator<Node, "required", string> {
  // An empty union accepts no element values, so the deepest array must be empty.
  let node = shape(v.array(v.union()));
  for (let level = 1; level < levels; level++) node = shape(v.array(node));
  return node;
}

/** Remove descendants below `levels` levels so the tree fits `boundedTreeValidator`. */
export function capTreeDepth<Node extends { children: Node[] }>(nodes: Node[], levels: number): Node[] {
  for (const node of nodes) {
    if (levels <= 1) node.children = [];
    else capTreeDepth(node.children, levels - 1);
  }
  return nodes;
}
