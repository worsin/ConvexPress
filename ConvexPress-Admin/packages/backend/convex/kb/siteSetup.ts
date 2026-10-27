/**
 * Knowledge base site setup: a site's own code writes its help center's
 * starting categories and articles (CaseMedix's getting-started guides, say).
 *
 * Works like canonicalDocuments/siteSetup.ts does for pages. Repeating a write
 * with the same content changes nothing. Changed content refreshes the record
 * while nobody has edited it. A record an editor changed or removed since
 * setup last wrote it is kept as they left it. Articles are published as
 * written, without the notifications an editor's publish sends.
 */
import { ConvexError, v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";
import { sanitizeTipTapContent } from "../helpers/sanitize";
import { insertWithMediaReferences, patchWithMediaReferences } from "../media/attachmentGuard";
import { applyKbPublicCounts } from "./helpers/publicCounts";
import { calculateReadingTime, extractPlainText } from "./helpers/utils";
import { MAX_KB_EXCERPT_LENGTH, MAX_KB_TITLE_LENGTH, MAX_KEYWORDS } from "./validators";

export const kbSetupOutcomeValidator = v.union(
  v.literal("created"),
  v.literal("updated"),
  v.literal("unchanged"),
  v.literal("kept_edited"),
  v.literal("kept_removed"),
  v.literal("slug_taken"),
);
export type KbSetupOutcome = Infer<typeof kbSetupOutcomeValidator>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function refuse(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function checkSetup(setupKey: string, slug: string) {
  if (!/^[!-~]{1,200}$/u.test(setupKey)) refuse("INVALID_SETUP_KEY", "The setup key must be 1 to 200 printable characters without spaces.");
  if (!SLUG.test(slug) || slug.length > 120) refuse("INVALID_SETUP_SLUG", "Supply a lowercase slug of letters, digits and hyphens.");
}

async function requireAuthor(ctx: MutationCtx, actorId: Id<"users">) {
  const author = await ctx.db.get("users", actorId);
  if (!author || author.status !== "active" || author.authSource === "management") {
    refuse("SETUP_AUTHOR_INVALID", "The setup author must be an active site user.");
  }
  return author;
}

async function receiptFor(ctx: MutationCtx, kind: "category" | "article", setupKey: string) {
  return await ctx.db
    .query("kb_setupReceipts")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).eq("setupKey", setupKey))
    .unique();
}

async function saveReceipt(
  ctx: MutationCtx,
  existing: Doc<"kb_setupReceipts"> | null,
  row: { kind: "category" | "article"; setupKey: string; recordId: string; requestDigest: string; acceptedDigest: string },
) {
  const now = Date.now();
  if (existing) await ctx.db.patch("kb_setupReceipts", existing._id, { ...row, updatedAt: now });
  else await ctx.db.insert("kb_setupReceipts", { ...row, createdAt: now, updatedAt: now });
}

// ─── Categories ─────────────────────────────────────────────────────────────

/** What an editor can change about a category (its counts and times aren't edits). */
function categoryDigest(category: Doc<"kb_categories">): string {
  const { name, slug, description, icon, order, isActive, isPublished, parentId } = category;
  return sha256Hex(canonicalJson({ name, slug, description: description ?? null, icon: icon ?? null, order, isActive, isPublished, parentId: parentId ?? null }));
}

export const writeCategory = internalMutation({
  args: {
    setupKey: v.string(),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    order: v.number(),
    actorId: v.id("users"),
  },
  returns: v.object({ outcome: kbSetupOutcomeValidator, categoryId: v.union(v.id("kb_categories"), v.null()) }),
  handler: async (ctx, args): Promise<{ outcome: KbSetupOutcome; categoryId: Id<"kb_categories"> | null }> => {
    checkSetup(args.setupKey, args.slug);
    await requireAuthor(ctx, args.actorId);
    const name = args.name.trim();
    if (!name || name.length > 100) refuse("VALIDATION_ERROR", "A category name is 1 to 100 characters.");
    const fields = {
      name,
      slug: args.slug,
      ...(args.description ? { description: args.description.trim() } : {}),
      ...(args.icon ? { icon: args.icon } : {}),
      order: args.order,
    };
    const requestDigest = sha256Hex(canonicalJson(fields));
    const receipt = await receiptFor(ctx, "category", args.setupKey);
    const accept = async (categoryId: Id<"kb_categories">) => {
      const written = await ctx.db.get("kb_categories", categoryId);
      if (written) {
        await saveReceipt(ctx, receipt, { kind: "category", setupKey: args.setupKey, recordId: categoryId, requestDigest, acceptedDigest: categoryDigest(written) });
      }
    };

    if (receipt) {
      const recordId = ctx.db.normalizeId("kb_categories", receipt.recordId);
      const category = recordId ? await ctx.db.get("kb_categories", recordId) : null;
      if (!category) return { outcome: "kept_removed", categoryId: null };
      if (receipt.requestDigest === requestDigest) return { outcome: "unchanged", categoryId: category._id };
      if (categoryDigest(category) !== receipt.acceptedDigest) return { outcome: "kept_edited", categoryId: category._id };
      await ctx.db.patch("kb_categories", category._id, {
        name: fields.name,
        slug: fields.slug,
        description: fields.description,
        icon: fields.icon,
        order: fields.order,
        updatedAt: Date.now(),
      });
      await accept(category._id);
      return { outcome: "updated", categoryId: category._id };
    }

    const occupant = await ctx.db.query("kb_categories").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (occupant) return { outcome: "slug_taken", categoryId: occupant._id };
    const now = Date.now();
    const categoryId = await ctx.db.insert("kb_categories", {
      ...fields,
      isActive: true,
      isPublished: true,
      articleCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await accept(categoryId);
    return { outcome: "created", categoryId };
  },
});

// ─── Articles ───────────────────────────────────────────────────────────────

/** What an editor can change about an article (views, votes and search sync aren't edits). */
function articleDigest(article: Doc<"kb_articles">): string {
  const { title, slug, excerpt, content, categoryId, keywords, status, visibility, isFeatured, sortOrder, parentArticleId } = article;
  return sha256Hex(
    canonicalJson({
      title,
      slug,
      excerpt,
      content,
      categoryId: categoryId ?? null,
      keywords,
      status,
      visibility: visibility ?? null,
      isFeatured,
      sortOrder,
      parentArticleId: parentArticleId ?? null,
    }),
  );
}

export const writeArticle = internalMutation({
  args: {
    setupKey: v.string(),
    title: v.string(),
    slug: v.string(),
    excerpt: v.string(),
    /** TipTap JSON, as the editor stores it. */
    content: v.string(),
    categoryId: v.id("kb_categories"),
    keywords: v.optional(v.array(v.string())),
    sortOrder: v.number(),
    isFeatured: v.optional(v.boolean()),
    actorId: v.id("users"),
  },
  returns: v.object({ outcome: kbSetupOutcomeValidator, articleId: v.union(v.id("kb_articles"), v.null()) }),
  handler: async (ctx, args): Promise<{ outcome: KbSetupOutcome; articleId: Id<"kb_articles"> | null }> => {
    checkSetup(args.setupKey, args.slug);
    const author = await requireAuthor(ctx, args.actorId);
    const title = args.title.trim();
    if (!title || title.length > MAX_KB_TITLE_LENGTH) refuse("VALIDATION_ERROR", `A title is 1 to ${MAX_KB_TITLE_LENGTH} characters.`);
    if (args.excerpt.length > MAX_KB_EXCERPT_LENGTH) refuse("VALIDATION_ERROR", `An excerpt is at most ${MAX_KB_EXCERPT_LENGTH} characters.`);
    const keywords = args.keywords ?? [];
    if (keywords.length > MAX_KEYWORDS) refuse("VALIDATION_ERROR", `At most ${MAX_KEYWORDS} keywords.`);
    if (!(await ctx.db.get("kb_categories", args.categoryId))) refuse("CATEGORY_NOT_FOUND", "The category doesn't exist.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(args.content);
    } catch {
      refuse("INVALID_CONTENT", "Article content must be TipTap JSON.");
    }
    if (!parsed || typeof parsed !== "object" || Reflect.get(parsed, "type") !== "doc") refuse("INVALID_CONTENT", "Article content must be a TipTap document.");
    const content = sanitizeTipTapContent(args.content);
    const contentPlainText = extractPlainText(content);
    const fields = {
      title,
      slug: args.slug,
      excerpt: args.excerpt.trim(),
      content,
      contentPlainText,
      categoryId: args.categoryId,
      keywords,
      sortOrder: args.sortOrder,
      isFeatured: args.isFeatured ?? false,
      readingTimeMinutes: calculateReadingTime(contentPlainText),
    };
    const requestDigest = sha256Hex(
      canonicalJson({
        title: fields.title,
        slug: fields.slug,
        excerpt: fields.excerpt,
        content: fields.content,
        categoryId: fields.categoryId,
        keywords: fields.keywords,
        sortOrder: fields.sortOrder,
        isFeatured: fields.isFeatured,
      }),
    );
    const receipt = await receiptFor(ctx, "article", args.setupKey);
    const accept = async (articleId: Id<"kb_articles">) => {
      const written = await ctx.db.get("kb_articles", articleId);
      if (written) {
        await saveReceipt(ctx, receipt, { kind: "article", setupKey: args.setupKey, recordId: articleId, requestDigest, acceptedDigest: articleDigest(written) });
      }
    };

    if (receipt) {
      const recordId = ctx.db.normalizeId("kb_articles", receipt.recordId);
      const article = recordId ? await ctx.db.get("kb_articles", recordId) : null;
      if (!article || article.status === "archived") return { outcome: "kept_removed", articleId: article?._id ?? null };
      if (receipt.requestDigest === requestDigest) return { outcome: "unchanged", articleId: article._id };
      if (articleDigest(article) !== receipt.acceptedDigest) return { outcome: "kept_edited", articleId: article._id };
      const now = Date.now();
      const updates = { ...fields, version: article.version + 1, meilisearchSynced: false, ragSynced: false, updatedAt: now };
      await patchWithMediaReferences(ctx, "kb_articles", article._id, updates);
      await applyKbPublicCounts(ctx, article._id, article, { ...article, ...updates });
      await accept(article._id);
      return { outcome: "updated", articleId: article._id };
    }

    const occupant = await ctx.db.query("kb_articles").withIndex("by_slug", (q) => q.eq("slug", args.slug)).first();
    if (occupant) return { outcome: "slug_taken", articleId: occupant._id };
    const now = Date.now();
    const article = {
      ...fields,
      status: "published" as const,
      authorId: author._id,
      contributors: [],
      keywords,
      publishedAt: now,
      viewCount: 0,
      uniqueViewCount: 0,
      helpfulVotes: 0,
      notHelpfulVotes: 0,
      version: 1,
      meilisearchSynced: false,
      ragSynced: false,
      createdAt: now,
      updatedAt: now,
    };
    const articleId = await insertWithMediaReferences(ctx, "kb_articles", article);
    await applyKbPublicCounts(ctx, articleId, null, article);
    await accept(articleId);
    return { outcome: "created", articleId };
  },
});
