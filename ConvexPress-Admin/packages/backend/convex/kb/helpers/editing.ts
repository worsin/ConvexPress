/**
 * Knowledge Base System - editing rules shared by the article mutations
 *
 *   requireArticleEditor  kb.edit for any article; kb.editOwn is enough for
 *                         the author's own (either capability serves the author)
 *   resolveArticleSlug    slugs follow the title only until first publication;
 *                         after that they change only when an editor sets one
 *   recordPublishedSlug   keeps the slug a published article leaves behind
 *   snapshotArticle       the version history: one snapshot per saved change
 */

import { ConvexError } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { currentUserCan, getCurrentUser, requireCan } from "../../helpers/permissions";
import { deleteWithMediaReferences, insertWithMediaReferences } from "../../media/attachmentGuard";
import { generateArticleSlug, slugify } from "./utils";

/** Snapshots kept per article; older ones are pruned as new ones arrive. */
export const KB_VERSIONS_KEPT = 50;

export async function requireArticleEditor(ctx: MutationCtx, article: Doc<"kb_articles">): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new ConvexError({ code: "UNAUTHORIZED", message: "Authentication required" });
  if (article.authorId === user._id && (await currentUserCan(ctx, "kb.editOwn"))) return user;
  return await requireCan(ctx, "kb.edit");
}

/** An editor's slug, made URL-safe, which must not belong to another article. */
async function explicitSlug(ctx: MutationCtx, requested: string, articleId?: Id<"kb_articles">): Promise<string> {
  if (!/[a-z0-9]/i.test(requested)) {
    throw new ConvexError({ code: "VALIDATION_ERROR", message: "A slug needs at least one letter or number." });
  }
  const slug = slugify(requested);
  const owner = await ctx.db.query("kb_articles").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
  if (owner && owner._id !== articleId) {
    throw new ConvexError({ code: "SLUG_TAKEN", message: `Another article already uses the address "${slug}".` });
  }
  return slug;
}

export async function resolveArticleSlug(
  ctx: MutationCtx,
  args: { title?: string; slug?: string },
  article?: Doc<"kb_articles">,
): Promise<string | undefined> {
  if (args.slug !== undefined) return await explicitSlug(ctx, args.slug, article?._id);
  if (!article) return await generateArticleSlug(ctx, args.title || "untitled");
  // A published article keeps its address when its title changes.
  if (args.title !== undefined && article.publishedAt === undefined) return await generateArticleSlug(ctx, args.title, article._id);
  return undefined;
}

export async function recordPublishedSlug(ctx: MutationCtx, article: Doc<"kb_articles">, nextSlug: string): Promise<void> {
  if (nextSlug === article.slug) return;
  // The article reclaims an address it used before: that row is no longer history.
  const reclaimed = await ctx.db.query("kb_articleSlugHistory").withIndex("by_slug", (q) => q.eq("slug", nextSlug)).take(20);
  for (const row of reclaimed) if (row.articleId === article._id) await ctx.db.delete("kb_articleSlugHistory", row._id);
  if (article.publishedAt === undefined) return;
  await ctx.db.insert("kb_articleSlugHistory", { articleId: article._id, slug: article.slug, createdAt: Date.now() });
}

export async function snapshotArticle(
  ctx: MutationCtx,
  article: Doc<"kb_articles">,
  authorId: Id<"users">,
  changeSummary: string,
): Promise<Id<"kb_articleVersions">> {
  const versionId = await insertWithMediaReferences<"kb_articleVersions">(ctx, "kb_articleVersions", {
    articleId: article._id,
    version: article.version,
    title: article.title,
    content: article.content,
    ...(article.contentVersion !== undefined ? { contentVersion: article.contentVersion } : {}),
    changeSummary,
    authorId,
    createdAt: Date.now(),
  });
  const kept = await ctx.db
    .query("kb_articleVersions")
    .withIndex("by_article_version", (q) => q.eq("articleId", article._id))
    .order("desc")
    .take(KB_VERSIONS_KEPT + 10);
  for (const old of kept.slice(KB_VERSIONS_KEPT)) await deleteWithMediaReferences<"kb_articleVersions">(ctx, "kb_articleVersions", old._id);
  return versionId;
}
