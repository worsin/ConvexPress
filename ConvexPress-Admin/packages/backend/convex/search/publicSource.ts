import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { createExtensionSearchSourceReader } from "./extensionSources";
import { ConvexError } from "convex/values";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canDiscoverContent } from "../helpers/publicContent";
import { publicAuthorProfile } from "../helpers/publicAuthor";
import { isPluginEnabled } from "../helpers/plugins";
import { createMembershipAccessEvaluator } from "../membership/access";
import { createCategoryVisibilityReader } from "../commerce/categoryVisibility";
import { createPublicProductAccessReader } from "../commerce/publicProductAccess";
import { stripContentForSearch } from "./helpers";

export type PublicSearchSource = Pick<Doc<"searchIndex">,
  "contentType" | "contentId" | "title" | "content" | "excerpt" | "url" |
  "authorName" | "publishedAt" | "categoryNames" | "tagNames" | "mimeType">;

const MAX_TAXONOMY = 64;
function bounded<T>(items: T[]): T[] {
  if (items.length > MAX_TAXONOMY) throw new ConvexError({code: "SEARCH_SOURCE_BUDGET", message: "Search source taxonomy exceeds its read budget."});
  return items;
}
function postUrl(post: Doc<"posts">): string {
  if (post.type === "post") return `/blog/${encodeURIComponent(post.slug)}`;
  // A stored path is still untrusted input to the visitor's navigation.
  return post.path && /^\/(?!\/)/.test(post.path) && !/[\\\u0000-\u0020]/.test(post.path)
    ? post.path : `/${encodeURIComponent(post.slug)}`;
}

/** The index supplies candidate identities and ranking only. Display values and
 * authority come from the same current database snapshot. Never copy cache text,
 * legacy v2 bodies, account emails, or canonical block payloads into a result. */
export function createPublicSearchSourceReader(ctx: QueryCtx, now = Date.now(), budget?: RequestReadLedger) {
  const read = async <T extends TableNames>(table:T,id:Id<T>):Promise<Doc<T>|null> => {budget?.beforeRead();return budget ? budget.record(await ctx.db.get(table,id)) : ctx.db.get(table,id);};
  const evaluate = createMembershipAccessEvaluator(ctx,budget);
  const readExtension = createExtensionSearchSourceReader(ctx, budget);
  const productAccess = createPublicProductAccessReader(ctx, budget, undefined, now);
  const categoryVisible = createCategoryVisibilityReader(ctx,[],id=>read("commerce_product_categories",id));
  const authors = new Map<Id<"users">, string>();
  const plugins = new Map<"commerce" | "lms", boolean>();
  const enabled = async (plugin: "commerce" | "lms") => {
    if (!plugins.has(plugin)) plugins.set(plugin, await isPluginEnabled(ctx, plugin,budget));
    return plugins.get(plugin)!;
  };
  const authorName = async (id: Id<"users">) => {
    if (!authors.has(id)) authors.set(id, publicAuthorProfile(await read("users", id))?.displayName ?? "");
    return authors.get(id)!;
  };
  const publishedPost = async (post: Doc<"posts"> | null) => !!post &&
    (post.publishedAt === undefined || post.publishedAt <= now) && await canDiscoverContent(ctx, post,budget);
  const termNames = async (rawIds: string[]) => {
    const names: string[] = [];
    for (const rawId of bounded([...new Set(rawIds)])) {
      const id = ctx.db.normalizeId("terms", rawId);
      const term = id ? await read("terms", id) : null;
      if (term) names.push(term.name);
    }
    return names;
  };
  return async (row: Pick<Doc<"searchIndex">, "contentType" | "contentId">): Promise<PublicSearchSource | null> => {
    const base = {contentType: row.contentType, contentId: row.contentId};
    if (row.contentType === "post" || row.contentType === "page") {
      const id = ctx.db.normalizeId("posts", row.contentId);
      const post = id ? await read("posts", id) : null;
      if (!post || post.type !== row.contentType || !await publishedPost(post)) return null;
      const categoryNames: string[] = [], tagNames: string[] = [];
      budget?.beforeRead();
      const relations = await ctx.db.query("termRelationships").withIndex("by_post", q => q.eq("postId", post._id)).take(MAX_TAXONOMY + 1);
      for (const relation of bounded(relations)) {
        budget?.record(relation);
        const term = await read("terms", relation.termId);
        if (term?.taxonomy === "category") categoryNames.push(term.name);
        if (term?.taxonomy === "post_tag") tagNames.push(term.name);
      }
      return {...base, title: post.title, content: post.blocksVersion === 2 ? "" : stripContentForSearch(post.content ?? ""),
        excerpt: post.excerpt ?? "", url: postUrl(post), authorName: await authorName(post.authorId), publishedAt: post.publishedAt, categoryNames, tagNames};
    }
    if (row.contentType === "product") {
      if (!await enabled("commerce")) return null;
      const id = ctx.db.normalizeId("commerce_products", row.contentId);
      const product = id ? await read("commerce_products", id) : null;
      if (!product || !await productAccess(product)) return null;
      // Bundle-owned products have a different public document and URL.
      budget?.beforeRead();
      const bundle = await ctx.db.query("commerce_bundles").withIndex("by_product", q => q.eq("productId", product._id)).first();
      budget?.record(bundle);
      if(bundle) return null;
      const categoryNames: string[] = [], tagNames: string[] = [];
      for (const categoryId of bounded([...new Set(product.categoryIds)])) {
        const category = await read("commerce_product_categories", categoryId);
        if (category && await categoryVisible(category)) categoryNames.push(category.name);
      }
      for (const tagId of bounded([...new Set(product.tagIds ?? [])])) {
        const tag = await read("commerce_product_tags", tagId);
        if (tag?.isVisible) tagNames.push(tag.name);
      }
      return {...base, title: product.title, content: stripContentForSearch(product.description ?? ""), excerpt: product.excerpt ?? "",
        url: `/products/${encodeURIComponent(product.slug)}`, authorName: await authorName(product.authorId), publishedAt: product.publishedAt, categoryNames, tagNames};
    }
    if (row.contentType === "course") {
      if (!await enabled("lms")) return null;
      const id = ctx.db.normalizeId("lms_courses", row.contentId);
      const course = id ? await read("lms_courses", id) : null;
      if (!course || course.status !== "published" || (course.publishedAt !== undefined && course.publishedAt > now)) return null;
      const url = `/courses/${encodeURIComponent(course.slug)}`;
      for (const target of [
        {resourceType: "course" as const, resourceIdOrKey: row.contentId},
        {resourceType: "route" as const, resourceIdOrKey: "/courses"},
        {resourceType: "route" as const, resourceIdOrKey: url},
      ]) if (!(await evaluate(target)).allowed) return null;
      return {...base, title: course.title, content: "", excerpt: course.excerpt ?? "", url,
        authorName: await authorName(course.authorId), publishedAt: course.publishedAt,
        categoryNames: await termNames(course.categoryIds ?? []), tagNames: await termNames(course.tagIds ?? [])};
    }
    if (row.contentType === "event") return readExtension(row);
    if (row.contentType === "comment") {
      const id = ctx.db.normalizeId("comments", row.contentId);
      const comment = id ? await read("comments", id) : null;
      if (!comment || comment.status !== "approved") return null;
      const post = await read("posts", comment.postId);
      if (!post || !await publishedPost(post)) return null;
      return {...base, title: `Comment on "${post.title}"`, excerpt: "", content: stripContentForSearch(comment.content),
        url: `${postUrl(post)}#comment-${encodeURIComponent(comment._id)}`, authorName: comment.authorName || "Anonymous", publishedAt: comment.createdAt};
    }
    if (row.contentType === "media") {
      const id = ctx.db.normalizeId("media", row.contentId);
      const media = id ? await read("media", id) : null;
      if (!media || media.status !== "active") return null;
      if (media.attachedTo && !await publishedPost(await read("posts", media.attachedTo))) return null;
      return {...base, title: media.title, content: stripContentForSearch(media.description ?? ""), excerpt: media.caption ?? media.altText ?? "",
        url: `/media/${encodeURIComponent(media._id)}`, authorName: "", publishedAt: media.createdAt, mimeType: media.mimeType};
    }
    return null;
  };
}
