import {SEARCH_QUERY_REQUEST_KEY} from "./searchContracts";
import { parseBoundResolverArgs, supportsResolverPagination } from "./resolverBindings";
export { bindResolverArguments } from "./resolverBindings";
import { parsePollDefinition } from "./pollContracts";
import { blockPageRequestSchema, type BlockPageRequest } from "./postGridContracts";
import { dependencyDescriptors } from "./generated/metadata";
import { validateCanonicalTree } from "./generated/instances";
import { CanonicalTreeError } from "./generated/instance_runtime.mjs";
import { createComposedRegistry, type ComposedRegistrySnapshot, type RuntimeCanonicalBlock } from "./composedRegistry";
import type { SyncedScope } from "./syncedContent";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
/** Supplied only by the authorized document host. Snapshots are not permissions. */
export interface ComposedDataContext { scope: SyncedScope; definitions: ComposedRegistrySnapshot }

import {
	CanonicalDataError,
	DATA_LIMITS,
	scopeSchema,
	resolverArgs,
	stableKey,
	type DataScope,
	type ResolverPolicy,
	type CanonicalDataPlan,
	type DataBinding,
 type ResolverName,
 type ResolverJob,
} from "./contracts";
const descriptors: Readonly<
	Record<
		string,
		{
			version: number;
			supportsChildren: boolean;
			data: unknown;
			requires: { plugins: readonly string[]; capabilities: readonly string[] };
			provenance: { kind: string; owner?: string };
		}
	>
> = dependencyDescriptors;
function fail(code: string, path: string, message: string): never {
	throw new CanonicalDataError(code, path, message);
}
export function planCanonicalData(tree: unknown, scope: DataScope, policy: ResolverPolicy, request: BlockPageRequest = {}, composed?: ComposedDataContext): CanonicalDataPlan {
  const pages = blockPageRequestSchema.parse(request);
  const requested = new Set(Object.keys(pages).filter(key=>key!==SEARCH_QUERY_REQUEST_KEY));
  const verifiedScope = scopeSchema.parse(scope);
  if (composed && (composed.scope.websiteKey !== verifiedScope.websiteKey || composed.scope.instanceKey !== verifiedScope.instanceKey))
    fail("SCOPE_MISMATCH", "scope", "Definition context belongs to another environment");
  const registry = composed ? createComposedRegistry(composed.definitions, composed.scope) : undefined;
  let blocks;
  try { blocks = registry ? registry.validateTree(tree) : validateCanonicalTree(tree); }
  catch (error) {
    if (error instanceof CanonicalTreeError) fail(error.code, error.path, error.message);
    throw error;
  }
  const snapshot = registry?.snapshotFor(blocks);
  if (snapshot && snapshot.definitions.length !== composed!.definitions.definitions.length)
    fail("DEFINITION_BINDING_MISMATCH", "definitions", "Data context must contain exactly the definitions used by this tree");
  const definitionsDigest = snapshot?.definitions.length ? sha256Hex(canonicalJson(snapshot)) : undefined;
  const bindings: DataBinding[] = [];
  const jobs = new Map<string, CanonicalDataPlan["jobs"][number]>();
  const visit = (node: RuntimeCanonicalBlock, path: string) => {
    const definition = node.name.startsWith("composed/") ? registry?.definition(node.name, node.version) : null;
    const descriptor = definition ? {
      version: definition.spec.version, supportsChildren: definition.spec.supports.children,
      data: definition.spec.data, requires: definition.spec.requires ?? { plugins: [], capabilities: [] },
      provenance: { kind: "composed" },
    } : descriptors[node.name];
    if (!descriptor) fail("UNKNOWN_BLOCK", path, "No exact block definition");
    if (node.name === "core/poll") {
      try { parsePollDefinition(node.attrs); }
      catch { fail("INVALID_POLL_DEFINITION", path, "A poll needs a question and at least two distinct, named choices."); }
    }
    if (policy.disabledBlocks.includes(node.name)) fail("DISABLED_BLOCK", path, "Block is disabled");
    const plugins = [...descriptor.requires.plugins, ...(descriptor.provenance.kind === "plugin" && descriptor.provenance.owner ? [descriptor.provenance.owner] : [])];
    if (plugins.some(plugin => !policy.enabledPlugins.includes(plugin)) || descriptor.requires.capabilities.some(capability => !policy.capabilities.includes(capability)))
      fail("MISSING_RUNTIME_POLICY", path, "Required plugin or runtime policy is unavailable");
    if (descriptor.data) {
      const data = descriptor.data as { resolver: string; args: unknown };
      if (!Object.prototype.hasOwnProperty.call(resolverArgs, data.resolver)) fail("UNSUPPORTED_RESOLVER", path, "No approved server resolver");
      const resolver = data.resolver as ResolverName;
      if (definition) {
        // A custom spec may add requirements but cannot omit the trusted policy
        // attached to this resolver by installed Library contracts.
        const owners = Object.values(descriptors).filter(item => item.data && (item.data as { resolver?: string }).resolver === resolver);
        if (!owners.length) fail("UNSUPPORTED_RESOLVER", path, "Resolver has no installed policy contract");
        for (const owner of owners) {
          const required = [...owner.requires.plugins, ...(owner.provenance.kind === "plugin" && owner.provenance.owner ? [owner.provenance.owner] : [])];
          if (required.some(plugin => !policy.enabledPlugins.includes(plugin)) || owner.requires.capabilities.some(capability => !policy.capabilities.includes(capability)))
            fail("MISSING_RUNTIME_POLICY", path, "Custom definitions cannot weaken the installed resolver policy");
        }
      }
      if (requested.has(node.id)) {
        if (!supportsResolverPagination(resolver)) fail("INVALID_PAGE_REQUEST", path, "This block does not support visitor pagination");
        requested.delete(node.id);
      }
      const result = parseBoundResolverArgs(node.name, node.attrs, node.id, data, path, pages);
      if (!result.success) fail("INVALID_RESOLVER_ARGS", path, "Bound arguments do not match the allowlisted resolver");
      const bindingKey = stableKey({ resolver, args: result.data });
      jobs.set(bindingKey, { key: bindingKey, resolver, args: result.data } as ResolverJob);
      bindings.push({ blockId: node.id, blockName: node.name, blockVersion: descriptor.version, resolver, bindingKey, args: result.data } as DataBinding);
    }
    node.children?.forEach((child, index) => visit(child, `${path}.children.${index}`));
  };
  blocks.forEach((node, index) => visit(node, `blocks.${index}`));
  if (requested.size) fail("INVALID_PAGE_REQUEST", "request", "Pagination references a missing or non-paginated block");
  if (jobs.size > DATA_LIMITS.uniqueCalls) fail("RESOLVER_BUDGET", "tree", "Maximum 8 unique data resolutions per page");
  const reservedOutput = 1024 + bindings.reduce((total, binding) => total + 2048 + (binding.resolver === "content.page" && !binding.args.page ? 16 : DATA_LIMITS.resultBytes), 0);
  if (reservedOutput > DATA_LIMITS.outputBytes) fail("OUTPUT_BUDGET", "tree", "Page data cannot fit its reserved output budget");
  return { scope: verifiedScope, bindings, jobs: [...jobs.values()], request: pages, ...(definitionsDigest ? { definitionsDigest } : {}) };
}
