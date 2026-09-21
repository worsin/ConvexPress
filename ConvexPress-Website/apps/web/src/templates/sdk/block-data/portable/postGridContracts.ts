import {SEARCH_QUERY_REQUEST_KEY,searchQuerySchema} from "./searchContracts";
import { z } from "zod";
import { safeLinkSchema } from "./generated/field-runtime.mjs";

/** Visitor state is deliberately separate from saved block attributes. */
const blockIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/u)
  .refine(value => !["__proto__", "constructor", "prototype"].includes(value));
export const blockPageRequestSchema = z.preprocess((value, ctx) => {
  // Some object validators omit __proto__ while copying. Inspect input keys first.
  if (value && typeof value === "object" && Object.keys(value).some(key => key !== SEARCH_QUERY_REQUEST_KEY && !blockIdSchema.safeParse(key).success)) {
    ctx.addIssue({ code: "custom", message: "Invalid paginated block identity" });
    return z.NEVER;
  }
  return value;
}, z.record(
  z.union([blockIdSchema,z.literal(SEARCH_QUERY_REQUEST_KEY)]),
  z.string().min(1).max(4096),
).refine(value => Object.keys(value).filter(key=>key!==SEARCH_QUERY_REQUEST_KEY).length <= 8, "At most eight grids may be paginated").superRefine((value,ctx)=>{if(value[SEARCH_QUERY_REQUEST_KEY]!==undefined&&!searchQuerySchema.safeParse(value[SEARCH_QUERY_REQUEST_KEY]).success)ctx.addIssue({code:"custom",message:"Invalid search query"});}));
export type BlockPageRequest = z.infer<typeof blockPageRequestSchema>;

const reference = z.string().min(1).max(256);
export const postGridArgsSchema = z.strictObject({
  query: z.strictObject({ category: reference.optional(), tag: reference.optional(), author: reference.optional() }).default({}),
  limit: z.number().int().min(1).max(48).default(6),
  showExcerpt: z.boolean().default(true),
  cursor: z.string().min(1).max(4096).nullable().default(null),
});
const card = z.strictObject({
  id: reference,
  title: z.string().max(512),
  href: safeLinkSchema(z, ["relative"]).max(2048),
  excerpt: z.string().max(8192).nullable(),
  publishedAt: z.number().int().nonnegative(),
  author: z.string().max(256).nullable(),
  image: z.strictObject({ src: safeLinkSchema(z, ["http", "https", "relative"]).max(4096), alt: z.string().max(1000) }).nullable(),
});
export const postGridResultSchema = z.strictObject({
  items: z.array(card).max(48),
  cursor: z.string().min(1).max(4096).nullable(),
  nextCursor: z.string().min(1).max(4096).nullable(),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  let previous = Infinity;
  for (const [index, item] of value.items.entries()) {
    if (ids.has(item.id)) ctx.addIssue({ code: "custom", path: ["items", index], message: "Duplicate post identity" });
    ids.add(item.id);
    if (item.publishedAt > previous) ctx.addIssue({ code: "custom", path: ["items", index], message: "Posts must be ordered newest first" });
    previous = item.publishedAt;
  }
  if (value.nextCursor !== null && value.nextCursor === value.cursor)
    ctx.addIssue({ code: "custom", path: ["nextCursor"], message: "Pagination must advance" });
});
export type PostGridArgs = z.infer<typeof postGridArgsSchema>;
export type PostGridResult = z.infer<typeof postGridResultSchema>;
export function postGridMatchesArgs(args: PostGridArgs, result: PostGridResult): boolean {
  return args.cursor === result.cursor && result.items.length <= args.limit &&
    result.items.every(item => args.showExcerpt || item.excerpt === null);
}

/** URL values round-trip through one bounded JSON field without changing other search state. */
export const BLOCK_PAGE_SEARCH_KEY = "blockPages";
export function parseBlockPageSearch(value: unknown): BlockPageRequest {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string" || value.length > 34_000) throw new Error("Invalid block pagination search value");
  return blockPageRequestSchema.parse(JSON.parse(value));
}
export function blockPageHref(href: string, blockId: string, cursor: string | null): string {
  blockIdSchema.parse(blockId);
  if (!/^\/(?!\/)[^\s\\]*$/u.test(href)) throw new Error("Pagination requires a local page URL");
  const url = new URL(href, "https://pagination.invalid");
  const state = parseBlockPageSearch(url.searchParams.get(BLOCK_PAGE_SEARCH_KEY));
  if (cursor === null) delete state[blockId];
  else state[blockId] = cursor;
  const checked = blockPageRequestSchema.parse(state);
  if (Object.keys(checked).length) url.searchParams.set(BLOCK_PAGE_SEARCH_KEY, JSON.stringify(checked));
  else url.searchParams.delete(BLOCK_PAGE_SEARCH_KEY);
  return url.pathname + url.search + url.hash;
}
