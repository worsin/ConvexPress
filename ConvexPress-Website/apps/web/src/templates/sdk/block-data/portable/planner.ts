import {SEARCH_QUERY_REQUEST_KEY} from "./searchContracts";
import {parseCalendarNavigation} from "./calendarContracts";
import { parsePollDefinition } from "./pollContracts";
import { blockPageRequestSchema, type BlockPageRequest } from "./postGridContracts";
import { dependencyDescriptors } from "./generated/metadata";
import { validateCanonicalTree } from "./generated/instances";
import { CanonicalTreeError } from "./generated/instance-runtime.mjs";
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
/** Bind only compiled specification values. An instance cannot provide a data descriptor. */
export function bindResolverArguments(
	value: unknown,
	attrs: Record<string, unknown>,
  blockId: string,
	path: string,
	depth = 0,
): unknown {
	if (depth > 12)
		return fail(
			"BINDING_BUDGET",
			path,
			"Resolver binding nesting exceeds its limit",
		);
  if (value === "block.id") return blockId;
	if (typeof value === "string" && value.startsWith("attrs.")) {
		let result: unknown = attrs;
		for (const part of value.slice(6).split(".")) {
			if (["__proto__", "constructor", "prototype"].includes(part))
				return fail("INVALID_BINDING", path, "Unsafe binding path");
			if (!result || typeof result !== "object" || !Object.prototype.hasOwnProperty.call(result, part))
				return undefined;
			result = (result as Record<string, unknown>)[part];
		}
		return result;
	}
	if (Array.isArray(value))
		return value.map((item, index) =>
			bindResolverArguments(item, attrs, blockId, `${path}.${index}`, depth + 1),
		);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).flatMap(([key, item]) => {
				const result = bindResolverArguments(item, attrs, blockId, `${path}.${key}`, depth + 1);
				return result === undefined ? [] : [[key, result]];
			}),
		);
	return value;
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
      let bound = bindResolverArguments(data.args, node.attrs, node.id, `${path}.data`);
      if (resolver === "commerce.productCollection") {
        // Authored group labels/cards belong to presentation, not query authority.
        // Read only validated group product IDs into the closed resolver contract.
        if (node.name === "blocks/product-collection") {
          bound = { ...(bound as object), groups: node.attrs.groups.map(group => ({productIds:group.productIds})) };
        } else if (node.name === "commerce/sale-countdown") {
          // Campaign timing is presentation; attrs cannot widen source selection
          // or request private/cart disclosures.
          bound = { mode: "sale", count: node.attrs.limit, showPrice: true, showRating: false, showAddToCart: false, groups: [] };
        } else if (node.name === "commerce/product-hero") {
          // Empty or unavailable selections remain empty, never latest products.
          bound = { mode: "manual", productIds: [node.attrs.product ?? ""], count: 1, showPrice: true, showRating: false, showAddToCart: true, groups: [] };
        } else if (node.name === "commerce/recently-viewed") {
          // History is supplied separately by the settled visitor host.
          bound = { mode: "recentlyViewed", count: node.attrs.limit, showPrice: true, showRating: false, showAddToCart: false, groups: [] };
        } else if (!definition) fail("INVALID_BINDING", path, "Unsupported collection binding");
      }
      if (requested.has(node.id)) {
        if (resolver !== "media.tagged" && resolver !== "content.search" && resolver !== "commerce.reviews" && resolver !== "content.archive" && resolver !== "content.related" && resolver !== "gallery.album" && resolver !== "lms.curriculum" && resolver !== "lms.progress" && resolver !== "lms.instructor" && resolver !== "lms.courses" && resolver !== "membership.plans" && resolver !== "content.posts" && resolver !== "content.tags" && resolver !== "events.list" && resolver !== "commerce.categoryTiles") fail("INVALID_PAGE_REQUEST", path, "This block does not support visitor pagination");
        requested.delete(node.id);
      }
      const result = resolverArgs[resolver].safeParse(resolver === "content.search" ? {...(bound as object),query:pages[SEARCH_QUERY_REQUEST_KEY]??"",cursor:pages[node.id]??null} : resolver === "events.list" ? {...(bound as object),...(pages[node.id]?parseCalendarNavigation(pages[node.id]!):{})} : (resolver === "media.tagged" || resolver === "commerce.reviews" || resolver === "content.archive" || resolver === "content.related" || resolver === "gallery.album" || resolver === "lms.curriculum" || resolver === "lms.progress" || resolver === "lms.instructor" || resolver === "lms.courses" || resolver === "membership.plans" || resolver === "content.posts" || resolver === "content.tags" || resolver === "commerce.categoryTiles") ? { ...(bound as object), cursor: pages[node.id] ?? null } : bound);
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
