import { z } from "zod";
import { streamQuery } from "convex-helpers/server/pagination";
import { sha256Hex } from "@convexpress/site-contract";
import schema from "../schema";
import type { QueryCtx } from "../_generated/server";
import { isPluginEnabled } from "../helpers/plugins";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { createMembershipAccessEvaluator } from "../membership/access";
import { SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError, stableKey, type DataScope } from "./foundation/contracts";
import { albumArgsSchema, albumResultSchema, type AlbumResult } from "./foundation/albumContracts";
const positionSchema = z.tuple([z.number().finite(), z.number().finite(), z.string().min(1).max(256)]);
const cursorSchema = z.strictObject({ version:z.literal(1), binding:z.string().regex(/^[a-f0-9]{64}$/), after:positionSchema });

/** A bounded public projection. Each continuation rechecks the actual album and
 * route policies; a cursor never grants access or chooses another album. */
export async function readAlbum(ctx: QueryCtx, input: unknown, scope: DataScope, documentId: string,
  budget = new RequestReadLedger(), sources = new SourceByteLedger(), now = Date.now()): Promise<AlbumResult> {
  const args = albumArgsSchema.parse(input);
  const empty = (): AlbumResult => ({ album:null, items:[], cursor:args.cursor, nextCursor:null });
  const binding = sha256Hex(stableKey({scope, documentId, album:args.album ?? null}));
  let after: z.infer<typeof positionSchema> | null = null;
  if (args.cursor) {
    let cursor: z.infer<typeof cursorSchema>;
    try { cursor = cursorSchema.parse(JSON.parse(args.cursor)); }
    catch { throw new CanonicalDataError("ALBUM_CURSOR_FORMAT", "cursor", "Invalid album cursor"); }
    if (cursor.binding !== binding || !ctx.db.normalizeId("gallery_albumItems", cursor.after[2]))
      throw new CanonicalDataError("ALBUM_CURSOR_SCOPE", "cursor", "Album cursor belongs to another album, document or environment");
    after = cursor.after;
  }
  const id = args.album ? ctx.db.normalizeId("gallery_albums", args.album) : null;
  if (!id || !await isPluginEnabled(ctx, "gallery", budget)) return empty();
  const evaluate = createMembershipAccessEvaluator(ctx, budget);
  if (!(await evaluate({resourceType:"route", resourceIdOrKey:"/gallery"})).allowed) return empty();
  sources.beforeRead(); budget.beforeRead();
  const album = budget.record(await ctx.db.get("gallery_albums", id));
  if (!album) return empty();
  sources.record("album", album);
  if (album.status !== "publish" || album.visibility !== "public") return empty();
  if (album.publishedAt !== undefined && album.publishedAt > now) {
    budget.noteAuthorizationBoundary(album.publishedAt, now); return empty();
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(album.slug) || album.slug.length > 120) return empty();
  const href = `/gallery/${album.slug}`;
  if (!(await evaluate({resourceType:"route", resourceIdOrKey:href})).allowed) return empty();
  const iterator = streamQuery(ctx, {schema, table:"gallery_albumItems", index:"by_album_sort", order:"asc",
    startIndexKey:after ? [id, ...after] : [id], startInclusive:after === null, endIndexKey:[id], endInclusive:true});
  const items: AlbumResult["items"] = [];
  let nextCursor: string | null = null;
  try {
    // At most 24 candidate rows and 12 visible images. Hidden uploads cannot
    // force an unbounded scan; even an empty page can carry a continuation.
    for (let visited = 0; visited <= 24; visited++) {
      sources.beforeRead(); budget.beforeRead();
      const next = await iterator.next();
      if (next.done) break;
      const [item, key] = next.value;
      budget.record(item); sources.record("albumItem", item);
      if (visited === 24 || items.length === 12) {
        nextCursor = JSON.stringify({version:1, binding, after}); break;
      }
      after = positionSchema.parse(key.slice(1));
      sources.beforeRead(); budget.beforeRead();
      const media = budget.record(await ctx.db.get("media", item.mediaId));
      if (!media) continue;
      sources.record("media", media);
      if (media.status !== "active" || media.mediaType !== "image" || !media.mimeType.startsWith("image/")) continue;
      let src: string | null = null;
      if (media.storageId) { budget.beforeRead(); src = await ctx.storage.getUrl(media.storageId); }
      src ??= media.url ?? null;
      if (!src) continue;
      items.push({id:item._id, image:{src, alt:item.altText ?? media.altText ?? media.title ?? album.title,
        ...(media.width ? {width:media.width} : {}), ...(media.height ? {height:media.height} : {})},
        caption:album.captionsEnabled ? item.caption ?? media.caption ?? null : null, href:item.linkUrl ?? null});
    }
  } finally { await iterator.return(undefined); }
  return albumResultSchema.parse({album:{id:album._id, title:album.title, slug:album.slug, href,
    description:album.description ?? album.excerpt ?? null,
    lightboxEnabled:album.lightboxEnabled, downloadEnabled:album.downloadEnabled, captionsEnabled:album.captionsEnabled},
    items, cursor:args.cursor, nextCursor});
}
