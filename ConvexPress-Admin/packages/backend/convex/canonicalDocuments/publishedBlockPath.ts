import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger, isRequestReadBudgetError } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { resolvePublishedOccurrences } from "../syncedBlocks/occurrences";
import { validateCanonicalTree } from "./foundation/generated/instances";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";
import { installation } from "../syncedBlocks/model";
import { loadPublishedComposedRegistry } from "../blockDefinitions/publishedRegistry";
import type { SyncedOccurrence } from "./foundation/syncedOccurrences";
import type { SyncedTarget } from "./foundation/syncedContent";

interface PathEntry {
  node: RuntimeCanonicalTree[number];
  authoredId: string;
}
export interface PublishedBlockPath {
  path: PathEntry[];
  tree: RuntimeCanonicalTree;
  sourceChain: SyncedTarget[];
  composed?: ComposedDataContext;
}

/** Server-only. The caller must authorize the current persisted page before
 * expanding it. Source IDs are never alternate addresses for reused children.
 * Ordinary documents need no installation/source reads. Do not expose this
 * authoring-bearing result as a public DTO. */
export async function readPublishedBlockPath(ctx: QueryCtx, authored: unknown, blockId: string, budget: RequestReadLedger, definitions?: unknown): Promise<PublishedBlockPath | null> {
  let tree: RuntimeCanonicalTree, composed: ComposedDataContext | undefined;
  try {
    if (definitions === undefined) tree = validateCanonicalTree(authored);
    else {
      const scope = await installation(ctx, budget), registry = createComposedRegistry(definitions, scope);
      tree = registry.validateTree(authored); composed = { scope, definitions: registry.snapshotFor(tree) };
    }
  } catch (error) { if (isRequestReadBudgetError(error)) throw error; return null; }
  function hasSynced(nodes: RuntimeCanonicalTree): boolean {
    return nodes.some(node => node.name === "core/synced" || !!node.children && hasSynced(node.children));
  }
  if (!hasSynced(tree)) {
    function find(nodes: RuntimeCanonicalTree, ancestors: PathEntry[]): PathEntry[] | null {
      for (const node of nodes) {
        const path = [...ancestors, { node, authoredId: node.id }];
        if (node.id === blockId) return path;
        const match = node.children && find(node.children, path);
        if (match) return match;
      }
      return null;
    }
    const path = find(tree, []);
    return path ? { path, tree, sourceChain: [], ...(composed ? { composed } : {}) } : null;
  }
  if (composed?.definitions.definitions.length) return null;
  try {
    const plan = await resolvePublishedOccurrences(ctx, validateCanonicalTree(tree), budget);
    function find(nodes: SyncedOccurrence[], ancestors: PathEntry[]): PublishedBlockPath | null {
      for (const occurrence of nodes) {
        const path = [...ancestors, { node: { ...occurrence.node, id: occurrence.id } as RuntimeCanonicalTree[number], authoredId: occurrence.node.id }];
        if (occurrence.id === blockId) return { path, tree: plan.resolverTree, sourceChain: occurrence.sourceChain };
        const match = find(occurrence.children, path);
        if (match) return match;
      }
      return null;
    }
    return find(plan.roots, []);
  } catch (error) {
    if (isRequestReadBudgetError(error)) throw error;
    return null;
  }
}

/** All ancestor wrappers remain authoritative even though they are transparent
 * to data resolvers. Preserve authored-ID rules as well as placement-ID rules;
 * moving a restricted source into a reusable group must not remove its rule. */
export async function permitsPublishedBlockPath(ctx: QueryCtx, source: PublishedBlockPath, denied: ReadonlySet<string>, signedIn: boolean, budget: RequestReadLedger): Promise<boolean> {
  const membership = createMembershipAccessEvaluator(ctx, budget);
  const checked = new Set<string>();
  for (const { node, authoredId } of source.path) {
    if (denied.has(node.name) || node.visibility === "signedIn" && !signedIn || node.visibility === "signedOut" && signedIn) return false;
    for (const key of [node.id, authoredId, node.name]) {
      if (checked.has(key)) continue;
      checked.add(key);
      if (!(await membership({ resourceType: "block", resourceIdOrKey: key })).allowed) return false;
    }
  }
  if (source.composed) {
    // A form/download under a revoked custom ancestor is unavailable, even
    // through a direct ID or retained token. Unrelated hidden siblings do not
    // grant or revoke this path's authority.
    const pathNodes = source.path.map(({ node: { children: _children, ...node } }) => node);
    try {
      const registry = createComposedRegistry(source.composed.definitions, source.composed.scope);
      const selected = registry.snapshotFor(pathNodes);
      if (selected.definitions.length) await loadPublishedComposedRegistry(ctx, pathNodes, selected, budget);
    } catch (error) { if (isRequestReadBudgetError(error)) throw error; return false; }
  }
  return true;
}
