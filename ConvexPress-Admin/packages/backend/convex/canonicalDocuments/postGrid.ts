/** Server-owned indexed reader. A cursor changes position, never query or authority. */
import { streamQuery, type IndexKey } from "convex-helpers/server/pagination";
import { z } from "zod";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { canDiscoverContent } from "../helpers/publicContent";
import { publicAuthorProfile } from "../helpers/publicAuthor";
import { SourceByteLedger, SOURCE_LIMITS } from "./sourceBudget";
import { CanonicalDataError, stableKey, type DataScope } from "./foundation/contracts";
import { postGridArgsSchema, postGridResultSchema, type PostGridResult } from "./foundation/postGridContracts";

const cursorSchema = z.strictObject({ version: z.literal(1), binding: z.string().regex(/^[a-f0-9]{64}$/u),
  key: z.array(z.union([z.string().max(256), z.number().finite(), z.boolean()])).min(4).max(9) });
const MAX_CANDIDATES = 96;
export async function readPostGrid(ctx: QueryCtx, rawArgs: unknown, scope: DataScope, documentId: string,
  budget = new RequestReadLedger(), sources = new SourceByteLedger()): Promise<PostGridResult> {
  return readPostCollection(ctx, rawArgs, scope, documentId, budget, sources, false);
}
/** Archives honor Reading Settings (up to 100), with the same read/source budgets. */
export async function readPostArchive(ctx: QueryCtx, rawArgs: unknown, scope: DataScope, documentId: string,
  budget = new RequestReadLedger()): Promise<PostGridResult> {
  return readPostCollection(ctx, rawArgs, scope, documentId, budget, new SourceByteLedger(), true);
}
const archiveArgsSchema = postGridArgsSchema.extend({ limit: z.number().int().min(1).max(100) });
const archiveResultSchema = postGridResultSchema.safeExtend({ items: z.array(postGridResultSchema.shape.items.element).max(100) });
async function readPostCollection(ctx: QueryCtx, rawArgs: unknown, scope: DataScope, documentId: string,
  budget: RequestReadLedger, sources: SourceByteLedger, archive: boolean): Promise<PostGridResult> {
  const args = (archive ? archiveArgsSchema : postGridArgsSchema).parse(rawArgs);
  const binding = sha256Hex(stableKey({ scope, documentId, query: args.query, limit: args.limit, showExcerpt: args.showExcerpt }));
  const cursor = args.cursor === null ? null : cursorSchema.parse(JSON.parse(args.cursor));
  if (cursor && cursor.binding !== binding) throw new CanonicalDataError("POST_CURSOR_SCOPE", "cursor", "Post Grid cursor belongs to another document, filter or environment");
  const empty = () => ({ items: [], cursor: args.cursor, nextCursor: null });
  const terms: Id<"terms">[] = [];
  for (const [value, taxonomy] of [[args.query.category, "category"], [args.query.tag, "post_tag"]] as const) {
    if (!value) continue;
    const id = ctx.db.normalizeId("terms", value); if (!id) return empty();
    budget.beforeRead(); const term = budget.record(await ctx.db.get("terms", id));
    if (!term || term.taxonomy !== taxonomy) return empty();
    terms.push(id);
  }
  let authorId: Id<"users"> | null = null;
  if (args.query.author) {
    authorId = ctx.db.normalizeId("users", args.query.author); if (!authorId) return empty();
    budget.beforeRead(); const user = budget.record(await ctx.db.get("users", authorId));
    if (!publicAuthorProfile(user)) return empty();
  }
  const primary = terms[0];
  if (primary) {
    for (const ready of [undefined, false]) {
      budget.beforeRead();
      const pending = budget.record(await ctx.db.query("termRelationships").withIndex("by_term_discovery_ready", q => q.eq("termId", primary).eq("discoveryReady", ready)).first());
      if (pending) throw new CanonicalDataError("POST_DISCOVERY_INITIALIZING", "query", "The selected taxonomy index is still being prepared");
    }
  }
  const prefix: IndexKey = primary ? (authorId ? [primary, authorId, true] : [primary, true]) :
    (authorId ? [authorId, "post", "publish", "public"] : ["post", "publish", "public"]);
  if (cursor && (cursor.key.length !== prefix.length + 3 || stableKey(cursor.key.slice(0, prefix.length)) !== stableKey(prefix)))
    throw new CanonicalDataError("POST_CURSOR_RANGE", "cursor", "Post Grid cursor is outside the selected index range");
  if (cursor && (typeof cursor.key[prefix.length] !== "number" || typeof cursor.key[prefix.length + 1] !== "number" ||
    typeof cursor.key[prefix.length + 2] !== "string" || !ctx.db.normalizeId(primary ? "termRelationships" : "posts", cursor.key[prefix.length + 2] as string)))
    throw new CanonicalDataError("POST_CURSOR_RANGE", "cursor", "Post Grid cursor has invalid index coordinates");
  const options = { schema, order: "desc" as const, startIndexKey: cursor?.key ?? [...prefix, Date.now()],
    startInclusive: cursor === null, endIndexKey: [...prefix, 0], endInclusive: true };
  const iterator = primary ? streamQuery(ctx, { ...options, table: "termRelationships", index: authorId ? "by_term_author_discovery_published" : "by_term_discovery_published" }) :
    streamQuery(ctx, { ...options, table: "posts", index: authorId ? "by_author_public_discovery" : "by_public_discovery" });
  const items: PostGridResult["items"] = [], seen = new Set<string>();
  const authors = new Map<string, string | null>();
  let lastKey: IndexKey | null = null, more = false, scanned = 0;
  try {
    while (true) {
      // Preserve a continuation before exhausting the shared document budget.
      if (lastKey && (scanned >= MAX_CANDIDATES || budget.queries >= budget.limits.queries - 32 || sources.usedBytes > SOURCE_LIMITS.total - SOURCE_LIMITS.post - SOURCE_LIMITS.media)) { more = true; break; }
      budget.beforeRead(); sources.beforeRead();
      const next = await iterator.next();
      if (next.done) break;
      const [source, key] = next.value;
      budget.record(source);
      if (!primary) sources.record("post", source);
      // One lookahead proves a continuation without consuming the next item.
      if (items.length >= args.limit) { more = true; break; }
      lastKey = key; scanned++;
      let post: Doc<"posts"> | null;
      if (primary) {
        sources.beforeRead(); budget.beforeRead();
        post = budget.record(await ctx.db.get("posts", (source as Doc<"termRelationships">).postId));
        if (post) sources.record("post", post);
      } else post = source as Doc<"posts">;
      if (!post || post.type !== "post" || post.status !== "publish" || post.visibility !== "public" ||
        typeof post.publishedAt !== "number" || post.publishedAt > Date.now() || seen.has(post._id) ||
        (authorId && post.authorId !== authorId)) continue;
      // Derived coordinates are never sufficient authority, including after an import.
      if (primary) {
        const relation = source as Doc<"termRelationships">;
        if (!relation.discoveryReady || relation.discoveryPublishedAt !== post.publishedAt || relation.discoveryAuthorId !== post.authorId) continue;
        // Legacy imports can contain duplicate pairs. Select the same canonical
        // relationship on every page, not just a per-page deduplication set.
        budget.beforeRead();
        const canonical = budget.record(await ctx.db.query("termRelationships").withIndex("by_post_term", q => q.eq("postId", post!._id).eq("termId", primary)).first());
        if (canonical?._id !== relation._id) continue;
      }
      let matches = true;
      for (const termId of terms.slice(1)) {
        budget.beforeRead();
        if (!budget.record(await ctx.db.query("termRelationships").withIndex("by_post_term", q => q.eq("postId", post!._id).eq("termId", termId)).first())) { matches = false; break; }
      }
      if (!matches || !(await canDiscoverContent(ctx, post, budget))) continue;
      seen.add(post._id);
      if (!authors.has(post.authorId)) {
        budget.beforeRead(); const user = budget.record(await ctx.db.get("users", post.authorId));
        authors.set(post.authorId, publicAuthorProfile(user)?.displayName ?? null);
      }
      let image: PostGridResult["items"][number]["image"] = null;
      if (post.featuredImageId) {
        sources.beforeRead(); budget.beforeRead(); const media = budget.record(await ctx.db.get("media", post.featuredImageId));
        if (media) sources.record("media", media);
        if (media?.status === "active" && media.mediaType === "image" && media.mimeType.startsWith("image/")) {
          let src: string | null = null;
          if (media.storageId) { budget.beforeRead(); src = await ctx.storage.getUrl(media.storageId); }
          src ??= media.url ?? null;
          if (src) image = { src, alt: media.altText ?? "" };
        }
      }
      items.push({ id: post._id, title: post.title, href: `/blog/${encodeURIComponent(post.slug)}`, excerpt: args.showExcerpt ? post.excerpt ?? null : null,
        publishedAt: post.publishedAt, author: authors.get(post.authorId) ?? null, image });
    }
  } finally { await iterator.return(undefined); }
  const nextCursor = more && lastKey ? JSON.stringify({ version: 1, binding, key: lastKey }) : null;
  return (archive ? archiveResultSchema : postGridResultSchema).parse({ items, cursor: args.cursor, nextCursor });
}
