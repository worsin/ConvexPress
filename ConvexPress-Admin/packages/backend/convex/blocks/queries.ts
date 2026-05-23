import { query } from "../_generated/server";
import { currentUserCan, requireCan } from "../helpers/permissions";
import { getStoredBlocks, getBlocksRevision } from "./helpers";
import { migrateBlocks } from "./migrations";
import { postIdArgs } from "./validators";
import { v } from "convex/values";

export const getForDocument = query({
  args: postIdArgs,
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("posts", args.postId);
    if (!doc || (doc.type !== "page" && doc.type !== "post")) {
      return null;
    }

    const canRead =
      doc.status === "publish" ||
      (doc.type === "page"
        ? await currentUserCan(ctx, "page.update")
        : await currentUserCan(ctx, "post.update"));

    if (!canRead) return null;

    return {
      postId: doc._id,
      contentMode: doc.contentMode ?? (doc.type === "page" ? "blocks" : "article"),
      blocks: migrateBlocks(getStoredBlocks(doc)),
      blocksVersion: doc.blocksVersion ?? 1,
      blocksRevision: getBlocksRevision(doc),
    };
  },
});

function countBlockUsage(blocks: ReturnType<typeof getStoredBlocks>, counts: Map<string, number>) {
  for (const block of blocks) {
    counts.set(block.name, (counts.get(block.name) ?? 0) + 1);
    if (block.innerBlocks) countBlockUsage(block.innerBlocks, counts);
  }
}

function hasBlock(blocks: ReturnType<typeof getStoredBlocks>, name: string): boolean {
  for (const block of blocks) {
    if (block.name === name) return true;
    if (block.innerBlocks && hasBlock(block.innerBlocks, name)) return true;
  }
  return false;
}

export const usageSummary = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, "manage_options");
    const counts = new Map<string, number>();
    const docs = await ctx.db.query("posts").collect();
    for (const doc of docs) {
      if (doc.type !== "page" && doc.type !== "post") continue;
      countBlockUsage(getStoredBlocks(doc), counts);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  },
});

export const usageByBlockName = query({
  args: {
    name: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const docs = await ctx.db.query("posts").collect();
    const matches = [];
    let count = 0;
    let publishedCount = 0;
    for (const doc of docs) {
      if (doc.type !== "page" && doc.type !== "post") continue;
      if (!hasBlock(getStoredBlocks(doc), args.name)) continue;
      count += 1;
      if (doc.status === "publish") publishedCount += 1;
      if (matches.length < limit) {
        matches.push({
          _id: doc._id,
          title: doc.title,
          slug: doc.slug,
          type: doc.type,
          status: doc.status,
          updatedAt: doc.updatedAt,
        });
      }
    }
    return { name: args.name, count, publishedCount, recent: matches };
  },
});
