import { planCanonicalData, type ComposedDataContext } from "./foundation/planner";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { resolvePublishedOccurrences } from "../syncedBlocks/occurrences";
import { validateCanonicalTree } from "./foundation/generated/instances";
import type { CanonicalTree } from "./foundation/generated/types";
import { CanonicalDataError, type DataScope, type ResolverPolicy } from "./foundation/contracts";
import { containsSyncedContent, projectSyncedDisplay, type SyncedDisplay } from "./foundation/syncedDisplay";
import { planSyncedOccurrenceData, type SyncedOccurrence } from "./foundation/syncedOccurrences";
import { publicCanonicalTree } from "./foundation/publicTree";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import { installation } from "../syncedBlocks/model";

interface Projection<Tree> { blocks: Tree; resolverTree: Tree; authoringTree: Tree; synced?: SyncedDisplay; composed?: ComposedDataContext }
interface ProjectionOptions {
  validateAuthoringPolicy?: boolean;
  composed?: ComposedDataContext;
  /** Server-owned visibility policy, applied before retaining an occurrence.
   * A rejected ancestor prunes its entire subtree, including reusable sources. */
  isVisible?: (node: RuntimeCanonicalTree[number]) => boolean;
}

/** Called only after current page access. Authorization is evaluated before
 * any selected block's dynamic data/media is loaded or serialized. Cache one
 * decision per exact key within this read-only snapshot, preserving its lease
 * deadline in the same request ledger. No customer-supplied visibility mask. */
export function projectPublicBlocks(ctx: QueryCtx, input: unknown, scope: DataScope, policy: ResolverPolicy, budget: RequestReadLedger, options?: ProjectionOptions & { composed?: undefined }): Promise<Projection<CanonicalTree>>;
export function projectPublicBlocks(ctx: QueryCtx, input: unknown, scope: DataScope, policy: ResolverPolicy, budget: RequestReadLedger, options: ProjectionOptions): Promise<Projection<RuntimeCanonicalTree>>;
export async function projectPublicBlocks(ctx: QueryCtx, input: unknown, scope: DataScope, policy: ResolverPolicy, budget: RequestReadLedger, options: ProjectionOptions = {}): Promise<Projection<RuntimeCanonicalTree>> {
  // The host loads authorized immutable definitions; a snapshot itself is not
  // activation or ownership authority. Rebind it to this database before any
  // membership/data/media work so a foreign installation cannot be projected.
  const composed = options.composed;
  const registry = composed ? createComposedRegistry(composed.definitions, composed.scope) : undefined;
  const authored = registry ? registry.validateTree(input) : validateCanonicalTree(input);
  if (composed) {
    const current = await installation(ctx, budget);
    if (current.websiteKey !== scope.websiteKey || current.instanceKey !== scope.instanceKey || current.websiteKey !== composed.scope.websiteKey || current.instanceKey !== composed.scope.instanceKey || current.deploymentOrigin !== composed.scope.deploymentOrigin)
      throw new CanonicalDataError("SCOPE_MISMATCH", "scope", "Custom blocks belong to another site installation");
    if (registry!.snapshotFor(authored).definitions.length !== composed.definitions.definitions.length)
      throw new CanonicalDataError("DEFINITION_BINDING_MISMATCH", "definitions", "Projection requires exactly the authored definitions");
  }
  const membership = createMembershipAccessEvaluator(ctx, budget);
  const decisions = new Map<string, Promise<boolean>>();
  const permitted = async (keys: string[]) => {
    for (const key of keys) {
      let decision = decisions.get(key);
      if (!decision) { decision = membership({ resourceType: "block", resourceIdOrKey: key }).then(value => value.allowed);decisions.set(key, decision); }
      if (!await decision) return false;
    }
    return true;
  };
  if (!containsSyncedContent(authored)) {
    if (options.validateAuthoringPolicy) planCanonicalData(authored, scope, policy, {}, composed);
    const filter = async (nodes: RuntimeCanonicalTree): Promise<RuntimeCanonicalTree> => {
      const result: RuntimeCanonicalTree = [];
      for (const node of nodes) if ((!options.isVisible || options.isVisible(node)) && await permitted([node.id, node.name])) result.push({ ...node, ...(node.children ? { children: await filter(node.children) } : {}) });
      return result;
    };
    const filtered = await filter(authored);
    const resolverTree = registry ? registry.validateTree(filtered) : validateCanonicalTree(filtered);
    const definitions = registry?.snapshotFor(resolverTree);
    const visibleContext = definitions?.definitions.length ? { scope: composed!.scope, definitions } : undefined;
    // Plan only visible nodes for display. Hidden custom definitions and their
    // reference/resolver arguments never become public dependencies.
    if (composed) planCanonicalData(resolverTree, scope, policy, {}, visibleContext);
    return { blocks: publicCanonicalTree(resolverTree), resolverTree, authoringTree: authored, ...(visibleContext ? { composed: visibleContext } : {}) };
  }
  if (registry?.snapshotFor(authored).definitions.length)
    throw new CanonicalDataError("COMPOSED_SYNCED_UNAVAILABLE", "document", "Custom reusable occurrences require definition-aware snapshots");
  const plan = await resolvePublishedOccurrences(ctx, validateCanonicalTree(authored), budget), visible = new Set<string>();
  if (options.validateAuthoringPolicy) planSyncedOccurrenceData(plan, scope, policy);
  const visit = async (nodes: SyncedOccurrence[]) => {
    for (const node of nodes) if ((!options.isVisible || options.isVisible(node.node)) && await permitted([node.id, node.node.id, node.node.name])) { visible.add(node.id);await visit(node.children); }
  };
  await visit(plan.roots);
  const projected = projectSyncedDisplay(plan, visible);
  planSyncedOccurrenceData(projected.displayPlan, scope, policy);
  return { blocks: projected.blocks, resolverTree: projected.resolverTree, authoringTree: plan.resolverTree, ...(containsSyncedContent(projected.blocks) ? { synced: projected.synced } : {}) };
}
