import { z } from "zod";
import { SEARCH_QUERY_REQUEST_KEY } from "./searchContracts";
import { parseCalendarNavigation } from "./calendarContracts";
import type { BlockPageRequest } from "./postGridContracts";
import { dependencyDescriptors } from "./generated/metadata";
import { CanonicalDataError, resolverArgs, type ResolverName } from "./contracts";

const paginatedResolvers = new Set<ResolverName>([
  "media.tagged", "content.search", "commerce.reviews", "content.archive", "content.related",
  "gallery.album", "lms.curriculum", "lms.progress", "lms.instructor", "lms.courses",
  "membership.plans", "content.posts", "content.tags", "events.list", "commerce.categoryTiles",
]);
export const supportsResolverPagination = (resolver: ResolverName): boolean => paginatedResolvers.has(resolver);

export interface ResolverDescriptor { resolver: string; args: unknown }
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

/** The same binding and request normalization is used by authoring and execution.
 * This is shape validation only: it never fetches data or grants access. */
export function parseBoundResolverArgs(name: string, attrs: Record<string, unknown>, blockId: string, data: ResolverDescriptor, path: string, pages: BlockPageRequest = {}) {
  if (!Object.prototype.hasOwnProperty.call(resolverArgs, data.resolver)) fail("UNSUPPORTED_RESOLVER", path, "No approved server resolver");
  const resolver = data.resolver as ResolverName;
  let bound = bindResolverArguments(data.args, attrs, blockId, `${path}.data`);
  if (resolver === "commerce.productCollection") {
    // Authored group labels/cards belong to presentation, not query authority.
    // Read only validated group product IDs into the closed resolver contract.
    if (name === "blocks/product-collection") {
      bound = { ...(bound as object), groups: (attrs.groups as { productIds: unknown }[]).map(group => ({productIds:group.productIds})) };
    } else if (name === "commerce/sale-countdown") {
      // Campaign timing is presentation; attrs cannot widen source selection
      // or request private/cart disclosures.
      bound = { mode: "sale", count: attrs.limit, showPrice: true, showRating: false, showAddToCart: false, groups: [] };
    } else if (name === "commerce/product-hero") {
      // Empty or unavailable selections remain empty, never latest products.
      bound = { mode: "manual", productIds: [attrs.product ?? ""], count: 1, showPrice: true, showRating: false, showAddToCart: true, groups: [] };
    } else if (name === "commerce/recently-viewed") {
      // History is supplied separately by the settled visitor host.
      bound = { mode: "recentlyViewed", count: attrs.limit, showPrice: true, showRating: false, showAddToCart: false, groups: [] };
    } else if (!name.startsWith("composed/")) fail("INVALID_BINDING", path, "Unsupported collection binding");
  }
  if (resolver === "content.search") {
    bound = { ...(bound as object), query: pages[SEARCH_QUERY_REQUEST_KEY] ?? "", cursor: pages[blockId] ?? null };
  } else if (resolver === "events.list") {
    bound = { ...(bound as object), ...(pages[blockId] ? parseCalendarNavigation(pages[blockId]!) : {}) };
  } else if (supportsResolverPagination(resolver)) {
    bound = { ...(bound as object), cursor: pages[blockId] ?? null };
  }
  return resolverArgs[resolver].safeParse(bound);
}

/** Translate a resolver argument error to the bound editor field, including
 * nested/array bindings. Constant argument errors belong to the block itself. */
function attributePath(binding: unknown, path: readonly PropertyKey[]): (string | number)[] {
  if (typeof binding === "string" && binding.startsWith("attrs."))
    return [...binding.slice(6).split("."), ...path.filter((part): part is string | number => typeof part !== "symbol")];
  if (!path.length || !binding || typeof binding !== "object") return [];
  const [key, ...rest] = path;
  if (!Object.prototype.hasOwnProperty.call(binding, key!)) return [];
  return attributePath((binding as Record<PropertyKey, unknown>)[key!], rest);
}

/** Write-time only. Stored attrs keep their original schema so historical
 * invalid values remain readable for repair and draft revision recovery. */
export function assertAuthoringResolverArgs(name: string, attrs: Record<string, unknown>, descriptor?: ResolverDescriptor | null): void {
  const data = descriptor === undefined
    ? (dependencyDescriptors as Record<string, { data: ResolverDescriptor | null }>)[name]?.data
    : descriptor;
  if (!data) return;
  // Reusable content is expanded and revision-authorized by the document
  // service before query planning. It is not a public data resolver.
  if (name === "core/synced" && data.resolver === "content.syncedBlock") return;
  const result = parseBoundResolverArgs(name, attrs, "authoring-block", data, "data");
  if (result.success) return;
  throw new z.ZodError(result.error.issues.map(issue => {
    let path = attributePath(data.args, issue.path);
    // These Library bindings deliberately discard presentation fields and use
    // trusted query defaults; map only their authored inputs back to the editor.
    if (data.resolver === "commerce.productCollection") {
      if (name === "blocks/product-collection" && issue.path[0] === "groups")
        path = issue.path.filter((part): part is string | number => typeof part !== "symbol");
      else if (["commerce/sale-countdown", "commerce/recently-viewed"].includes(name) && issue.path[0] === "count") path = ["limit"];
      else if (name === "commerce/product-hero" && issue.path[0] === "productIds") path = ["product"];
    }
    return { code: "custom" as const, path, message: issue.message };
  }));
}
