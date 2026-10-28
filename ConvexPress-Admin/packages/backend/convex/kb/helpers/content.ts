/**
 * Knowledge Base System - article content on the server
 *
 * Write side: `prepareArticleContent` turns a writer's input into the stored
 * document and its derived fields, with media and article ids resolved to
 * real ids of their tables. Read side: `renderArticleBody` renders the stored
 * document to HTML, looking up each image and each linked article, so an image
 * that left the library is dropped and a link to an article the reader can't
 * see becomes plain text.
 */

import { ConvexError } from "convex/values";

import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import { prepareKbContent, readKbDoc, renderKbDoc, type KbDoc, type KbOutlineEntry, type KbRenderMedia } from "../content";
import { kbLinkedArticleIds, kbMediaIds, kbOutline } from "../content/derive";

type DbCtx = Pick<QueryCtx, "db">;
type ReadCtx = Pick<QueryCtx, "db" | "storage">;

export type ArticleContentFields = {
  content: string;
  contentVersion: number;
  contentPlainText: string;
  outline: KbOutlineEntry[];
  linkedArticleIds: Id<"kb_articles">[];
  readingTimeMinutes: number;
};

export type PreparedArticleContent = ArticleContentFields & {
  doc: KbDoc;
  excerpt: string;
  mediaIds: Id<"media">[];
};

const MAX_LINKED_ARTICLES = 200;

export function prepareArticleContent(ctx: DbCtx, input: string | undefined | null, selfId?: Id<"kb_articles">): PreparedArticleContent {
  const prepared = prepareKbContent(input);
  const mediaIds = prepared.mediaIds.map((raw) => {
    const id = ctx.db.normalizeId("media", raw);
    if (!id) throw new ConvexError({ code: "INVALID_CONTENT", message: "An image in the article isn't in the media library. Choose it again from the library." });
    return id;
  });
  const linkedArticleIds: Id<"kb_articles">[] = [];
  for (const raw of prepared.linkedArticleIds) {
    const id = ctx.db.normalizeId("kb_articles", raw);
    if (id && id !== selfId) linkedArticleIds.push(id);
  }
  if (linkedArticleIds.length > MAX_LINKED_ARTICLES) {
    throw new ConvexError({ code: "INVALID_CONTENT", message: `An article can link to at most ${MAX_LINKED_ARTICLES} other articles.` });
  }
  return {
    doc: prepared.doc,
    content: prepared.content,
    contentVersion: prepared.contentVersion,
    contentPlainText: prepared.contentPlainText,
    outline: prepared.outline,
    linkedArticleIds,
    readingTimeMinutes: prepared.readingTimeMinutes,
    excerpt: prepared.excerpt,
    mediaIds,
  };
}

/** The stored document of an article (legacy bodies converted on the fly). */
export function articleDoc(article: Pick<Doc<"kb_articles">, "content">): KbDoc {
  return readKbDoc(article.content);
}

/** The outline, from the stored field or, for legacy rows, from the body. */
export function articleOutline(article: Pick<Doc<"kb_articles">, "content" | "outline" | "contentVersion">): KbOutlineEntry[] {
  if (article.contentVersion !== undefined && article.outline) return article.outline;
  return kbOutline(articleDoc(article));
}

export type ArticleHrefResolver = (target: Doc<"kb_articles">, anchor: string | null) => Promise<string | null> | string | null;

/**
 * Render a document for a reader. `articleHref` decides whether, and where, a
 * link to another article points; returning null renders the text unlinked.
 */
export async function renderArticleBody(ctx: ReadCtx, doc: KbDoc, articleHref: ArticleHrefResolver): Promise<string> {
  const media = new Map<string, KbRenderMedia>();
  for (const raw of kbMediaIds(doc)) {
    const id = ctx.db.normalizeId("media", raw);
    const item = id ? await ctx.db.get("media", id) : null;
    if (!item || (item.status !== "active" && item.status !== "processing")) continue;
    // The stored URL goes stale when a site moves deployments; storage knows the current one.
    const url = (item.storageId ? await ctx.storage.getUrl(item.storageId) : null) ?? item.url;
    media.set(raw, {
      url,
      mimeType: item.mimeType,
      ...(item.width !== undefined ? { width: item.width } : {}),
      ...(item.height !== undefined ? { height: item.height } : {}),
      ...(item.altText ? { altText: item.altText } : {}),
    });
  }
  const targets = new Map<string, Doc<"kb_articles">>();
  for (const raw of kbLinkedArticleIds(doc).slice(0, MAX_LINKED_ARTICLES)) {
    const id = ctx.db.normalizeId("kb_articles", raw);
    const target = id ? await ctx.db.get("kb_articles", id) : null;
    if (target) targets.set(raw, target);
  }
  // Hrefs depend on the anchor, so resolve each distinct (article, anchor) pair.
  const hrefs = new Map<string, string | null>();
  const pending: Array<{ key: string; target: Doc<"kb_articles">; anchor: string | null }> = [];
  const visit = (blocks: KbDoc["content"]) => {
    for (const block of blocks) {
      if (block.type === "paragraph" || block.type === "heading") {
        for (const node of block.content ?? []) {
          if (node.type !== "text") continue;
          for (const mark of node.marks ?? []) {
            if (mark.type !== "link" || !mark.attrs.articleId) continue;
            const target = targets.get(mark.attrs.articleId);
            const key = `${mark.attrs.articleId}#${mark.attrs.anchor ?? ""}`;
            if (target && !hrefs.has(key)) {
              hrefs.set(key, null);
              pending.push({ key, target, anchor: mark.attrs.anchor });
            }
          }
        }
      } else if (block.type === "bulletList" || block.type === "orderedList") {
        for (const item of block.content) visit(item.content);
      } else if (block.type === "blockquote" || block.type === "callout" || block.type === "details") {
        visit(block.content);
      } else if (block.type === "table") {
        for (const row of block.content) for (const cell of row.content) visit(cell.content);
      }
    }
  };
  visit(doc.content);
  for (const { key, target, anchor } of pending) hrefs.set(key, (await articleHref(target, anchor)) ?? null);

  return renderKbDoc(doc, {
    media: (id) => media.get(id) ?? null,
    articleHref: (id, anchor) => hrefs.get(`${id}#${anchor ?? ""}`) ?? null,
  });
}
