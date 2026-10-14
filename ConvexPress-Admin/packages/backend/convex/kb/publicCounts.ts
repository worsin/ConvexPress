/**
 * Knowledge Base System - Public Count Rebuild
 *
 * recount rebuilds every public count from source:
 *   kb_categories.articleCount, kb_tags.publicArticleCount and
 *   kb_collections.publicArticleCount
 * counting only published, non-internal articles (countsAsPublicKbArticle).
 *
 * Run it once after deploying article visibility, where tags and collections
 * have no public count yet (public reads hide those tags and report 0 for
 * those collections until then), and any time counts need repair:
 *
 *   npx convex run kb/publicCounts:recount '{}'
 *
 * It scans published articles a page at a time, then writes the three tables
 * a page at a time, each step in its own scheduled transaction. If any article
 * changed while it ran, it starts over (up to MAX_RESTARTS times), so a
 * visibility change during the rebuild can never leave an internal article
 * counted. It is idempotent.
 */

import { makeFunctionReference, type RegisteredMutation } from "convex/server";
import { v, type Infer } from "convex/values";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { patchWithMediaReferences } from "../media/attachmentGuard";
import { countsAsPublicKbArticle } from "./helpers/visibility";

const SCAN_PAGE = 100;
/** Same bound as applyKbPublicCounts, which refuses transitions beyond it. */
const MAX_LINKS_PER_ARTICLE = 1000;
const WRITE_PAGE = 100;
const MAX_RESTARTS = 5;
const STATUSES = ["draft", "review", "published", "archived"] as const;

const countsValidator = v.object({
  categories: v.record(v.string(), v.number()),
  tags: v.record(v.string(), v.number()),
  collections: v.record(v.string(), v.number()),
});
const tableValidator = v.union(v.literal("kb_categories"), v.literal("kb_tags"), v.literal("kb_collections"));
const recountArgs = v.object({
  phase: v.optional(v.union(v.literal("scan"), v.literal("write"))),
  table: v.optional(tableValidator),
  cursor: v.optional(v.union(v.string(), v.null())),
  startedAt: v.optional(v.number()),
  restarts: v.optional(v.number()),
  counts: v.optional(countsValidator),
});
type RecountArgs = Infer<typeof recountArgs>;
type Counts = Infer<typeof countsValidator>;
type CountTable = Infer<typeof tableValidator>;
type RecountResult = { phase: "scan" | "write" | "done"; restarts: number };

const recountRef = makeFunctionReference<"mutation", RecountArgs, RecountResult>("kb/publicCounts:recount");
const NEXT_TABLE: Record<CountTable, CountTable | null> = { kb_categories: "kb_tags", kb_tags: "kb_collections", kb_collections: null };

function increment(map: Record<string, number>, id: string): void {
  map[id] = (map[id] ?? 0) + 1;
}

/** Count one page of published articles into `counts`. */
async function scanPage(ctx: MutationCtx, cursor: string | null, counts: Counts) {
  const page = await ctx.db.query("kb_articles").withIndex("by_status_updated", q => q.eq("status", "published"))
    .paginate({ numItems: SCAN_PAGE, cursor, maximumBytesRead: 4 * 1024 * 1024 });
  for (const article of page.page) {
    if (!countsAsPublicKbArticle(article)) continue;
    if (article.categoryId) increment(counts.categories, article.categoryId);
    const tags = await ctx.db.query("kb_articleTags").withIndex("by_article", q => q.eq("articleId", article._id)).take(MAX_LINKS_PER_ARTICLE);
    for (const link of tags) increment(counts.tags, link.tagId);
    const collections = await ctx.db.query("kb_collectionArticles").withIndex("by_article", q => q.eq("articleId", article._id)).take(MAX_LINKS_PER_ARTICLE);
    for (const link of collections) increment(counts.collections, link.collectionId);
  }
  return page;
}

/** Write one page of one table's counts; returns the next cursor or null. */
async function writePage(ctx: MutationCtx, table: CountTable, cursor: string | null, counts: Counts): Promise<string | null> {
  const now = Date.now();
  if (table === "kb_categories") {
    const page = await ctx.db.query("kb_categories").paginate({ numItems: WRITE_PAGE, cursor });
    for (const row of page.page) {
      const count = counts.categories[row._id] ?? 0;
      if (row.articleCount !== count) await ctx.db.patch("kb_categories", row._id, { articleCount: count, updatedAt: now });
    }
    return page.isDone ? null : page.continueCursor;
  }
  if (table === "kb_tags") {
    const page = await ctx.db.query("kb_tags").paginate({ numItems: WRITE_PAGE, cursor });
    for (const row of page.page) {
      const count = counts.tags[row._id] ?? 0;
      if (row.publicArticleCount !== count) await ctx.db.patch("kb_tags", row._id, { publicArticleCount: count, updatedAt: now });
    }
    return page.isDone ? null : page.continueCursor;
  }
  const page = await ctx.db.query("kb_collections").paginate({ numItems: WRITE_PAGE, cursor });
  for (const row of page.page) {
    const count = counts.collections[row._id] ?? 0;
    if (row.publicArticleCount !== count) await patchWithMediaReferences<"kb_collections">(ctx, "kb_collections", row._id, { publicArticleCount: count, updatedAt: now });
  }
  return page.isDone ? null : page.continueCursor;
}

async function changedSince(ctx: MutationCtx, startedAt: number): Promise<boolean> {
  for (const status of STATUSES) {
    if (await ctx.db.query("kb_articles").withIndex("by_status_updated", q => q.eq("status", status).gte("updatedAt", startedAt)).first()) return true;
  }
  return false;
}

export const recount: RegisteredMutation<"internal", RecountArgs, RecountResult> = internalMutation({
  args: recountArgs,
  returns: v.object({ phase: v.union(v.literal("scan"), v.literal("write"), v.literal("done")), restarts: v.number() }),
  handler: async (ctx, args): Promise<RecountResult> => {
    const startedAt = args.startedAt ?? Date.now();
    const restarts = args.restarts ?? 0;
    const counts: Counts = args.counts ?? { categories: {}, tags: {}, collections: {} };

    if ((args.phase ?? "scan") === "scan") {
      const page = await scanPage(ctx, args.cursor ?? null, counts);
      const next: RecountArgs = page.isDone
        ? { phase: "write", table: "kb_categories", cursor: null, startedAt, restarts, counts }
        : { phase: "scan", cursor: page.continueCursor, startedAt, restarts, counts };
      await ctx.scheduler.runAfter(0, recountRef, next);
      return { phase: "scan", restarts };
    }

    const table = args.table ?? "kb_categories";
    const cursor = await writePage(ctx, table, args.cursor ?? null, counts);
    const nextTable = cursor === null ? NEXT_TABLE[table] : table;
    if (nextTable) {
      await ctx.scheduler.runAfter(0, recountRef, { phase: "write", table: nextTable, cursor, startedAt, restarts, counts });
      return { phase: "write", restarts };
    }
    if (restarts < MAX_RESTARTS && await changedSince(ctx, startedAt)) {
      // Something changed under the rebuild; count again from a fresh start.
      await ctx.scheduler.runAfter(0, recountRef, { restarts: restarts + 1 });
      return { phase: "scan", restarts: restarts + 1 };
    }
    return { phase: "done", restarts };
  },
});

