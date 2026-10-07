import { dependencyDescriptors } from "./generated/metadata";
import { validateCanonicalTree } from "./generated/instances";
import { createComposedRegistry, type RuntimeCanonicalBlock, type RuntimeCanonicalTree } from "./composedRegistry";
import { planCanonicalData, type ComposedDataContext } from "./planner";
import type { CanonicalDataPlan, DataScope, ResolverPolicy } from "./contracts";
import type { BlockPageRequest } from "./postGridContracts";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { resolveSyncedContent, resolveSyncedContentSnapshot, syncedScopeSchema, SyncedContentError, type SyncedScope, type SyncedRequest, type SyncedTarget, type SyncedResolution } from "./syncedContent";

export interface SyncedOccurrence {
  /** Root-document IDs stay unchanged. Reusable descendants get a stable,
   * placement-specific ID; this does not change the saved source document. */
  id: string;
  path: string[];
  node: RuntimeCanonicalBlock;
  owner: SyncedTarget | null;
  /** Every surrounding source, outermost first. Revisions identify this read;
   * source IDs participate in stable identity across edits/restores. */
  sourceChain: SyncedTarget[];
  /** Present only on core/synced; null is the shared unavailable state. */
  reference?: SyncedTarget | null;
  children: SyncedOccurrence[];
}
export interface SyncedOccurrencePlan {
  scope: SyncedScope;
  resolution: SyncedResolution;
  roots: SyncedOccurrence[];
  byId: ReadonlyMap<string, SyncedOccurrence>;
  /** Canonical resolver/navigation input. Transparent reusable wrappers are
   * replaced by their children; their full presentation remains in roots.
   * This is never a replacement authored document or a public transport. */
  resolverTree: RuntimeCanonicalTree;
  composed?: ComposedDataContext;
  digest: string;
}
function fail(code: string, message: string): never { throw new SyncedContentError(code, message); }
function placementId(path: string[], sourceChain: SyncedTarget[]): string {
  if (!sourceChain.length) return path[path.length - 1]!;
  // JSON framing avoids ambiguous path separators. Include source identities so
  // replacing a reference cannot inherit another source's interactive identity.
  return `synced_${sha256Hex(canonicalJson({ contract: "synced-placement-v1", path, sources: sourceChain.map(source => source.id) }))}`;
}
/** Resolve the published graph once, then derive identities for the complete
 * page. Callers still own document authorization, public redaction, policy and
 * shared database budgets. Do not expose this authoring-bearing plan to clients. */
export async function resolveSyncedOccurrences(
  input: unknown,
  scope: SyncedScope,
  read: (request: SyncedRequest) => Promise<unknown>,
  options: { requireAvailable?: boolean; composed?: ComposedDataContext } = {},
): Promise<SyncedOccurrencePlan> {
  const checkedScope = syncedScopeSchema.parse(scope);
  const registry = options.composed ? createComposedRegistry(options.composed.definitions, checkedScope) : undefined;
  const resolution = await resolveSyncedContent(input, checkedScope, read, { ...options, rootRegistry: registry });
  return buildOccurrencePlan(checkedScope, resolution, options.composed);
}
export function resolveSyncedOccurrencesSnapshot(input: unknown, scope: SyncedScope, read: (request: SyncedRequest) => unknown, options: { requireAvailable?: boolean; composed?: ComposedDataContext } = {}): SyncedOccurrencePlan {
  const checkedScope = syncedScopeSchema.parse(scope);
  const registry = options.composed ? createComposedRegistry(options.composed.definitions, checkedScope) : undefined;
  return buildOccurrencePlan(checkedScope, resolveSyncedContentSnapshot(input, checkedScope, read, { ...options, rootRegistry: registry }), options.composed);
}
function buildOccurrencePlan(checkedScope: SyncedScope, resolution: SyncedResolution, composed?: ComposedDataContext): SyncedOccurrencePlan {
  const bindings = new Map(resolution.bindings.map(binding => [JSON.stringify(binding.path), binding.target]));
  const revisions = new Map(resolution.revisions.map(source => [JSON.stringify([source.id, source.revision, source.digest]), source]));
  const byId = new Map<string, SyncedOccurrence>();
  function visit(nodes: RuntimeCanonicalTree, parent: string[], sourceChain: SyncedTarget[]): SyncedOccurrence[] {
    return nodes.map(node => {
      const path = [...parent, node.id], id = placementId(path, sourceChain);
      if (byId.has(id)) fail("SYNCED_OCCURRENCE_COLLISION", "An authored ID conflicts with a reusable placement. Rename the authored block ID.");
      const { children, ...own } = node;
      const occurrence: SyncedOccurrence = { id, path, node: own as RuntimeCanonicalBlock, owner: sourceChain[sourceChain.length - 1] ?? null, sourceChain: [...sourceChain], children: [] };
      byId.set(id, occurrence);
      if (node.name === "core/synced") {
        const pathKey = JSON.stringify(path);
        if (!bindings.has(pathKey)) fail("SYNCED_BINDING_MISSING", "A reusable placement has no reviewed revision binding.");
        const target = bindings.get(pathKey)!;
        occurrence.reference = target;
        if (target) {
          const source = revisions.get(JSON.stringify([target.id, target.revision, target.digest]));
          if (!source) fail("SYNCED_BINDING_MISSING", "The reviewed reusable revision is unavailable.");
          occurrence.children = visit(source.blocks, path, [...sourceChain, target]);
        }
      } else if (children) occurrence.children = visit(children, path, sourceChain);
      return occurrence;
    });
  }
  const roots = visit(resolution.blocks, [], []);
  const rawTree = occurrenceResolverTree(roots);
  const registry = composed ? createComposedRegistry(composed.definitions, checkedScope) : undefined;
  const resolverTree = registry ? registry.validateTree(rawTree) : validateCanonicalTree(rawTree);
  const digest = sha256Hex(canonicalJson({ contract: "synced-occurrences-v1", scope: checkedScope, roots }));
  return { scope: checkedScope, resolution, roots, byId, resolverTree, digest, ...(composed ? { composed } : {}) };
}
/** Preflight the entire expanded page before any dynamic resolver runs. The
 * ordinary planner owns its aggregate job/binding limits and visitor cursors;
 * reusable wrappers additionally retain their own plugin/capability policies. */
export function planSyncedOccurrenceData(plan: SyncedOccurrencePlan, scope: DataScope, policy: ResolverPolicy, request: BlockPageRequest = {}): CanonicalDataPlan {
  if (scope.websiteKey !== plan.scope.websiteKey || scope.instanceKey !== plan.scope.instanceKey) fail("SCOPE_MISMATCH", "The reusable plan belongs to another website environment.");
  for (const occurrence of plan.byId.values()) {
    const node = occurrence.node;
    if (node.name !== "core/synced") continue;
    if (policy.disabledBlocks.includes(node.name)) fail("DISABLED_BLOCK", "Synced content is disabled in this website.");
    const descriptor = dependencyDescriptors[node.name];
    if (descriptor.requires.plugins.some(plugin => !policy.enabledPlugins.includes(plugin)) || descriptor.requires.capabilities.some(capability => !policy.capabilities.includes(capability)))
      fail("MISSING_RUNTIME_POLICY", "Synced content requires the current website's runtime capabilities.");
  }
  return planCanonicalData(plan.resolverTree, scope, policy, request, plan.composed);
}

export function occurrenceResolverTree(occurrences: SyncedOccurrence[]): RuntimeCanonicalTree {
  return occurrences.flatMap(occurrence => {
    const children = occurrenceResolverTree(occurrence.children);
    if (occurrence.node.name === "core/synced") return children;
    return [{ ...occurrence.node, id: occurrence.id, ...(children.length ? { children } : {}) } as RuntimeCanonicalBlock];
  });
}
