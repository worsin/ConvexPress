/**
 * Knowledge Base System - Public Count Maintenance
 *
 * Public counts include only published, non-internal articles
 * (countsAsPublicKbArticle):
 *   - kb_categories.articleCount
 *   - kb_tags.publicArticleCount
 *   - kb_collections.publicArticleCount
 *
 * Every write that changes an article's status, visibility or category calls
 * applyKbPublicCounts with the article's state before and after the write, in
 * the same transaction. Junction writes (tagging, collection membership) call
 * the per-row adjusters. kb/publicCounts:recount rebuilds all three from
 * source after an upgrade or a repair.
 */

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { patchWithMediaReferences } from "../../media/attachmentGuard";
import { countsAsPublicKbArticle } from "./visibility";

export type KbCountedState = Pick<Doc<"kb_articles">, "status" | "visibility" | "categoryId">;

/** Junction rows one transition may adjust. Larger fan-out refuses the write
 * rather than leaving counts silently wrong. */
const MAX_COUNTED_LINKS = 1000;

export async function adjustKbCategoryCount(ctx: MutationCtx, categoryId: Id<"kb_categories">, delta: number, now = Date.now()): Promise<void> {
  const category = await ctx.db.get("kb_categories", categoryId);
  if (!category) return;
  await ctx.db.patch("kb_categories", categoryId, { articleCount: Math.max(0, category.articleCount + delta), updatedAt: now });
}

/** A tag whose public count was never initialized stays unknown (hidden
 * publicly) until the recount sets it; a delta cannot fix an unknown base. */
export async function adjustKbTagPublicCount(ctx: MutationCtx, tagId: Id<"kb_tags">, delta: number, now = Date.now()): Promise<void> {
  const tag = await ctx.db.get("kb_tags", tagId);
  if (!tag || tag.publicArticleCount === undefined) return;
  await ctx.db.patch("kb_tags", tagId, { publicArticleCount: Math.max(0, tag.publicArticleCount + delta), updatedAt: now });
}

export async function adjustKbCollectionPublicCount(ctx: MutationCtx, collectionId: Id<"kb_collections">, delta: number, now = Date.now()): Promise<void> {
  const collection = await ctx.db.get("kb_collections", collectionId);
  if (!collection || collection.publicArticleCount === undefined) return;
  await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", collectionId, {
    publicArticleCount: Math.max(0, collection.publicArticleCount + delta), updatedAt: now,
  });
}

/**
 * Apply the public-count effect of one article write. `before` is null for a
 * new article and `after` is null for a deleted one. Call it before deleting
 * an article's tag or collection links.
 */
export async function applyKbPublicCounts(
  ctx: MutationCtx, articleId: Id<"kb_articles">, before: KbCountedState | null, after: KbCountedState | null,
): Promise<void> {
  const was = before !== null && countsAsPublicKbArticle(before);
  const is = after !== null && countsAsPublicKbArticle(after);
  const now = Date.now();
  const from = was ? before?.categoryId : undefined;
  const to = is ? after?.categoryId : undefined;
  if (from !== to) {
    if (from) await adjustKbCategoryCount(ctx, from, -1, now);
    if (to) await adjustKbCategoryCount(ctx, to, 1, now);
  }
  if (was === is) return;
  const delta = is ? 1 : -1;
  const tags = await ctx.db.query("kb_articleTags").withIndex("by_article", q => q.eq("articleId", articleId)).take(MAX_COUNTED_LINKS + 1);
  const collections = await ctx.db.query("kb_collectionArticles").withIndex("by_article", q => q.eq("articleId", articleId)).take(MAX_COUNTED_LINKS + 1);
  if (tags.length > MAX_COUNTED_LINKS || collections.length > MAX_COUNTED_LINKS) {
    throw new ConvexError({ code: "KB_COUNT_LIMIT", message: `This article has more than ${MAX_COUNTED_LINKS} tag or collection links. Remove some before changing its publication or visibility.` });
  }
  for (const link of tags) await adjustKbTagPublicCount(ctx, link.tagId, delta, now);
  for (const link of collections) await adjustKbCollectionPublicCount(ctx, link.collectionId, delta, now);
}
