import { internalQuery, query } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { canEditContent, readPublicContent } from "../helpers/publicContent";
import { getStoredBlocks, getBlocksRevision } from "./helpers";
import { migrateBlocks } from "./migrations";
import { blocksValidator, contentModeValidator, postIdArgs } from "./validators";
import { ConvexError, v } from "convex/values";
import {paginationOptsValidator} from "convex/server";
import {readUsagePage,readCompleteLegacyUsage,usagePageValidator} from "./usage";

export const getForDocument = query({
  args: postIdArgs,
  returns: v.union(v.null(), v.object({
    postId: v.id("posts"), contentMode: contentModeValidator,
    blocks: blocksValidator, blocksVersion: v.number(), blocksRevision: v.number(),
  })),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("posts", args.postId);
    if (!doc || (doc.type !== "page" && doc.type !== "post")) {
      return null;
    }

    if (!(await canEditContent(ctx, doc))) {
      const publicContent = await readPublicContent(ctx, doc);
      // This endpoint has no password exchange. Public block reads use the
      // same resource, route and visibility policy as page/post body reads.
      if (!publicContent || publicContent.isPasswordProtected || publicContent.isMembershipRestricted) return null;
    }

    return {
      postId: doc._id,
      contentMode: doc.contentMode ?? (doc.type === "page" ? "blocks" : "article"),
      blocks: migrateBlocks(getStoredBlocks(doc)),
      blocksVersion: doc.blocksVersion ?? 1,
      blocksRevision: getBlocksRevision(doc),
    };
  },
});

export const getEditableDocumentForAi = internalQuery({
  args: postIdArgs,
  returns: v.union(v.null(), v.object({
    postId: v.id("posts"), type: v.union(v.literal("page"), v.literal("post")),
    title: v.string(), blocks: blocksValidator, blocksRevision: v.number(),
  })),
  handler: async (ctx, args) => {
    await requireCan(ctx, "blocks.ai");
    const doc = await ctx.db.get("posts", args.postId);
    if (!doc || (doc.type !== "page" && doc.type !== "post")) {
      return null;
    }

    await requireCan(ctx, doc.type === "page" ? "page.update" : "post.update");
    if (!(await canEditContent(ctx, doc))) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Cannot edit this content document" });
    }

    return {
      postId: doc._id,
      type: doc.type,
      title: doc.title,
      blocks: migrateBlocks(getStoredBlocks(doc)),
      blocksRevision: getBlocksRevision(doc),
    };
  },
});

/** Bounded document projection. Accumulate unique documents until isDone. */
export const usageDocuments = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: usagePageValidator,
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");
		return await readUsagePage(ctx, args.paginationOpts);
	},
});

/** Compatibility surface for small sites; never return a truncated total. */
export const usageSummary = query({
	args: {},
	returns: v.array(v.object({ name: v.string(), count: v.number() })),
	handler: async (ctx) => {
		await requireCan(ctx, "manage_options");
		const counts = new Map<string, number>();
		for (const doc of await readCompleteLegacyUsage(ctx))
			for (const name of doc.blockNames)
				counts.set(name, (counts.get(name) ?? 0) + 1);
		return [...counts]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([name, count]) => ({ name, count }));
	},
});

/** Existing signature retained. Large-site callers must use usageDocuments. */
export const usageByBlockName = query({
	args: { name: v.string(), limit: v.optional(v.number()) },
	returns: v.object({
		name: v.string(),
		count: v.number(),
		publishedCount: v.number(),
		recent: v.array(
			v.object({
				_id: v.id("posts"),
				title: v.string(),
				slug: v.string(),
				type: v.union(v.literal("page"), v.literal("post")),
				status: v.string(),
				updatedAt: v.optional(v.number()),
			}),
		),
	}),
	handler: async (ctx, args) => {
		await requireCan(ctx, "manage_options");
		const limit = args.limit ?? 10;
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Usage limit must be an integer from 1 to 50",
			});
		if (!args.name || args.name.length > 120)
			throw new ConvexError({
				code: "VALIDATION_ERROR",
				message: "Invalid block name",
			});
		const docs = (await readCompleteLegacyUsage(ctx)).filter((doc) =>
			doc.blockNames.includes(args.name),
		);
		return {
			name: args.name,
			count: docs.length,
			publishedCount: docs.filter((doc) => doc.status === "publish").length,
			recent: docs.slice(0, limit).map(({ blockNames: _, ...doc }) => doc),
		};
	},
});
