import { validateCanonicalTree } from "../canonicalDocuments/foundation/generated/instances";
import { assertLegacyAuthoring } from "../helpers/authoringVersionFence";
import { ConvexError, v } from "convex/values";
import type { PaginationOptions } from "convex/server";
import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
export const USAGE_PAGE_SIZE = 25;
export const usageDocumentValidator = v.object({
	_id: v.id("posts"),
	title: v.string(),
	slug: v.string(),
	type: v.union(v.literal("page"), v.literal("post")),
	status: v.string(),
	updatedAt: v.optional(v.number()),
	blockNames: v.array(v.string()),
});
export const usagePageValidator = v.object({
	page: v.array(usageDocumentValidator),
	isDone: v.boolean(),
	continueCursor: v.string(),
	splitCursor: v.optional(v.union(v.string(), v.null())),
	pageStatus: v.optional(
		v.union(
			v.literal("SplitRecommended"),
			v.literal("SplitRequired"),
			v.null(),
		),
	),
});
export function usageProjection(doc: Doc<"posts">) {
	if (doc.type !== "page" && doc.type !== "post") return null;
	const canonical = doc.blocksVersion === 2;
	if (!canonical) assertLegacyAuthoring(doc);
	const source = canonical
		? validateCanonicalTree(doc.blocks)
		: (doc.blocks ?? []);
	const names = new Set<string>();
	const pending: Array<{ blocks: unknown; depth: number }> = [
		{ blocks: source, depth: 0 },
	];
	let visited = 0;
	while (pending.length) {
		const { blocks, depth } = pending.pop()!;
		if (!Array.isArray(blocks) || depth > 64)
			throw new ConvexError({
				code: "INVALID_BLOCK_USAGE",
				message:
					"A document block tree needs repair before usage can be counted",
				postId: doc._id,
			});
		for (const value of blocks) {
			if (
				++visited > 10000 ||
				!value ||
				typeof value !== "object" ||
				typeof value.name !== "string" ||
				!value.name ||
				value.name.length > 120
			)
				throw new ConvexError({
					code: "INVALID_BLOCK_USAGE",
					message:
						"A document block tree needs repair before usage can be counted",
					postId: doc._id,
				});
			names.add(value.name);
			const children = canonical ? value.children : value.innerBlocks;
			if (children !== undefined)
				pending.push({ blocks: children, depth: depth + 1 });
		}
	}
	return {
		_id: doc._id,
		title: doc.title,
		slug: doc.slug,
		type: doc.type,
		status: doc.status,
		...(doc.updatedAt !== undefined ? { updatedAt: doc.updatedAt } : {}),
		blockNames: [...names].sort(),
	};
}
export async function readUsageRecords(
	ctx: QueryCtx,
	paginationOpts: PaginationOptions,
) {
	if (
		!Number.isSafeInteger(paginationOpts.numItems) ||
		paginationOpts.numItems < 1 ||
		paginationOpts.numItems > USAGE_PAGE_SIZE
	)
		throw new ConvexError({
			code: "VALIDATION_ERROR",
			message: `Usage page size must be an integer from 1 to ${USAGE_PAGE_SIZE}`,
		});
	// A creation-order scan intentionally includes every document, with no filtered
	// database scan. Projection drops attachments after the bounded read. An empty
	// projected page may still have a continuation cursor.
	return await ctx.db
		.query("posts")
		.order("desc")
		.paginate({
			...paginationOpts,
			maximumRowsRead: USAGE_PAGE_SIZE,
			maximumBytesRead: 2 * 1024 * 1024,
		});
}
export async function readUsagePage(
	ctx: QueryCtx,
	paginationOpts: PaginationOptions,
) {
	const result = await readUsageRecords(ctx, paginationOpts);
	return {
		...result,
		page: result.page.flatMap((doc) => {
			const item = usageProjection(doc);
			return item ? [item] : [];
		}),
	};
}
export async function readCompleteLegacyUsage(ctx: QueryCtx) {
	const result = await readUsagePage(ctx, {
		cursor: null,
		numItems: USAGE_PAGE_SIZE,
	});
	if (!result.isDone)
		throw new ConvexError({
			code: "PAGINATION_REQUIRED",
			message:
				"Usage exceeds one bounded page. Use blocks/queries:usageDocuments and continue until isDone for complete totals.",
		});
	return result.page;
}
