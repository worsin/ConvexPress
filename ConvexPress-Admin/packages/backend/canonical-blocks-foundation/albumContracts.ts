import { z } from "zod";
import { renderMediaSchema } from "./renderResources";
import { safeLinkSchema } from "./generated/field-runtime.mjs";
const id = z.string().min(1).max(256);
const cursor = z.string().min(1).max(4096).nullable();
export const albumArgsSchema = z.strictObject({ album: id.optional(), cursor: cursor.default(null) });
export const albumItemSchema = z.strictObject({
  id, image: renderMediaSchema, caption: z.string().max(4000).nullable(),
  href: safeLinkSchema(z, ["http", "https", "relative"]).max(2048).nullable(),
});
export const albumResultSchema = z.strictObject({
  album: z.strictObject({
    id, title: z.string().min(1).max(500),
    slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    href: z.string().max(256), description: z.string().max(12000).nullable(),
    lightboxEnabled: z.boolean(), downloadEnabled: z.boolean(), captionsEnabled: z.boolean(),
  }).nullable(),
  items: z.array(albumItemSchema).max(12), cursor, nextCursor: cursor,
}).superRefine((value, ctx) => {
  if (!value.album && (value.items.length || value.nextCursor)) ctx.addIssue({code:"custom",message:"Unavailable albums cannot disclose images or continuation"});
  if (value.album && value.album.href !== `/gallery/${value.album.slug}`) ctx.addIssue({code:"custom",message:"Album route mismatch"});
  if (value.nextCursor !== null && value.nextCursor === value.cursor) ctx.addIssue({code:"custom",message:"Album pagination must advance"});
  if (new Set(value.items.map(item => item.id)).size !== value.items.length) ctx.addIssue({code:"custom",message:"Duplicate album images"});
});
export type AlbumArgs = z.infer<typeof albumArgsSchema>;
export type AlbumResult = z.infer<typeof albumResultSchema>;
export function albumMatchesArgs(args: AlbumArgs, result: AlbumResult) {
  return args.cursor === result.cursor && (!result.album || result.album.id === args.album);
}
