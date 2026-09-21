import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { RequestReadLedger } from "../helpers/requestReadLedger";

/** Product tags own a separate namespace from editorial post tags. */
export function normalizeProductTags(names: string[]): {name:string;slug:string}[] {
  if (names.length > 32)
    throw new ConvexError({code:"PRODUCT_TAG_LIMIT",message:"A product supports up to 32 tags."});
  const tags = new Map<string,{name:string;slug:string}>();
  for (const raw of names) {
    const name = raw.normalize("NFKC").trim().replace(/\s+/gu," ");
    const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/gu,"");
    if (!name || name.length > 80 || !slug || slug.length > 160)
      throw new ConvexError({code:"PRODUCT_TAG_INVALID",message:"Use tag names of 1 to 80 characters containing letters or numbers."});
    if (!tags.has(slug)) tags.set(slug,{name,slug});
  }
  return [...tags.values()];
}

/** Called only after product authoring permission checks, in its transaction. */
export async function resolveProductTags(ctx: Pick<MutationCtx,"db">, names: string[]): Promise<Id<"commerce_product_tags">[]> {
  const tags = normalizeProductTags(names);
  const ids: Id<"commerce_product_tags">[] = [];
  for (const tag of tags) {
    const existing = await ctx.db.query("commerce_product_tags").withIndex("by_slug",q=>q.eq("slug",tag.slug)).unique();
    if (existing) {
      if (!existing.isVisible)
        throw new ConvexError({code:"PRODUCT_TAG_UNAVAILABLE",message:`The product tag “${existing.name}” is unavailable.`});
      ids.push(existing._id);
    } else {
      const now = Date.now();
      ids.push(await ctx.db.insert("commerce_product_tags",{...tag,isVisible:true,createdAt:now,updatedAt:now}));
    }
  }
  return ids;
}

/** Admin detail keeps assignment order; missing terms are not silently removed. */
export async function readProductTagAssignments(ctx: Pick<QueryCtx,"db">, ids: Id<"commerce_product_tags">[] = []): Promise<{names:string[];missingIds:Id<"commerce_product_tags">[]}> {
  if (ids.length > 32)
    throw new ConvexError({code:"PRODUCT_TAG_LIMIT",message:"This product exceeds the supported tag count."});
  const names: string[] = [];
  const missingIds: Id<"commerce_product_tags">[] = [];
  for (const id of new Set(ids)) {
    const tag = await ctx.db.get("commerce_product_tags",id);
    if (!tag) missingIds.push(id);
    else names.push(tag.name);
  }
  return {names,missingIds};
}

/** Collection source lookup never falls back to the post-tag table. */
export async function findVisibleProductTag(ctx: Pick<QueryCtx,"db">, slug: string, ledger?: RequestReadLedger) {
  ledger?.beforeRead();
  const tag = await ctx.db.query("commerce_product_tags").withIndex("by_slug",q=>q.eq("slug",slug)).unique();
  ledger?.record(tag);
  return tag?.isVisible ? tag : null;
}
