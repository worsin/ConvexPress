import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

export const PRODUCT_DISCOVERY_FIELDS = ["status", "categoryIds", "tagIds", "isFeatured", "createdAt", "collectionIndexVersion"] as const;
const MAX_CATEGORIES = 64;
const MAX_TAGS = 32;
const MAX_ENTRIES = MAX_CATEGORIES + MAX_TAGS + 2;
type Entry = Pick<Doc<"commerce_product_discovery">, "kind" | "key" | "createdAt">;

/** Future publication remains a candidate; source authorization checks the clock. */
export function productDiscoveryEntries(product: Record<string, unknown> | null): Entry[] {
  if (!product || product.status !== "publish") return [];
  if (!Number.isSafeInteger(product.createdAt) || (product.createdAt as number) < 0)
    throw new ConvexError({code:"PRODUCT_DISCOVERY_DATE",message:"Product creation date must be a nonnegative whole timestamp."});
  const categories = product.categoryIds ?? [];
  if (!Array.isArray(categories) || categories.some(id => typeof id !== "string" || !id))
    throw new ConvexError({code:"PRODUCT_DISCOVERY_CATEGORY",message:"Product category references are invalid."});
  const unique = [...new Set(categories as string[])];
  if (unique.length > MAX_CATEGORIES)
    throw new ConvexError({code:"PRODUCT_CATEGORY_LIMIT",message:"A product supports up to 64 category assignments."});
  const tags = product.tagIds ?? [];
  if (!Array.isArray(tags) || tags.some(id => typeof id !== "string" || !id))
    throw new ConvexError({code:"PRODUCT_DISCOVERY_TAG",message:"Product tag references are invalid."});
  const uniqueTags = [...new Set(tags as string[])];
  if (uniqueTags.length > MAX_TAGS)
    throw new ConvexError({code:"PRODUCT_TAG_LIMIT",message:"A product supports up to 32 tags."});
  const createdAt = product.createdAt as number;
  const entries: Entry[] = [{kind:"recent",key:"",createdAt}];
  for (const key of unique) entries.push({kind:"category",key,createdAt});
  for (const key of uniqueTags) entries.push({kind:"tag",key,createdAt});
  if (product.isFeatured === true) entries.push({kind:"featured",key:"",createdAt});
  return entries;
}

/** The source and all collection coordinates change in the same transaction. */
export async function syncProductDiscovery(ctx: Pick<MutationCtx,"db">, productId: Id<"commerce_products">,
  product: Record<string, unknown> | null, ledger?: RequestReadLedger): Promise<void> {
  const desired = productDiscoveryEntries(product);
  ledger?.beforeRead();
  const previous = await ctx.db.query("commerce_product_discovery").withIndex("by_product",q=>q.eq("productId",productId)).take(MAX_ENTRIES + 1);
  for (const row of previous) ledger?.record(row);
  if (previous.length > MAX_ENTRIES)
    throw new ConvexError({code:"PRODUCT_DISCOVERY_LIMIT",message:"Product collection index needs repair before this change."});
  const remaining = new Map(desired.map(row=>[`${row.kind}:${row.key}`,row]));
  for (const row of previous) {
    const key = `${row.kind}:${row.key}`;
    const target = remaining.get(key);
    if (!target) await ctx.db.delete("commerce_product_discovery",row._id);
    else {
      if (row.createdAt !== target.createdAt) await ctx.db.patch("commerce_product_discovery",row._id,{createdAt:target.createdAt});
      remaining.delete(key);
    }
  }
  for (const row of remaining.values()) await ctx.db.insert("commerce_product_discovery",{productId,...row});

}

export async function productDiscoveryIsReady(ctx: Pick<QueryCtx,"db">, ledger?: RequestReadLedger): Promise<boolean> {
  ledger?.beforeRead();
  const pending = await ctx.db.query("commerce_products")
    .withIndex("by_collection_index_version",q=>q.eq("collectionIndexVersion",undefined)).first();
  ledger?.record(pending);
  return pending === null;
}

/** A bounded candidate window, not Convex pagination: one document can resolve
 * several collections, and publication validates the same tree more than once.
 * Convex permits only one paginate() call per transaction. The extra coordinate
 * detects overflow; source authorization still decides which cards are public. */
export const MAX_PRODUCT_DISCOVERY_CANDIDATES = 160;
export async function readProductDiscoveryCandidates(ctx: Pick<QueryCtx,"db">,
  kind: Entry["kind"], key: string, ledger?: RequestReadLedger) {
  if (!(await productDiscoveryIsReady(ctx,ledger)))
    throw new ConvexError({code:"PRODUCT_DISCOVERY_NOT_READY",message:"Product collections are being indexed. Retry after the catalog rebuild completes."});
  ledger?.beforeRead();
  const candidates = await ctx.db.query("commerce_product_discovery")
    .withIndex("by_selection_created",q=>q.eq("kind",kind).eq("key",key))
    .order("desc").take(MAX_PRODUCT_DISCOVERY_CANDIDATES + 1);
  for (const row of candidates) ledger?.record(row);
  return candidates;
}
