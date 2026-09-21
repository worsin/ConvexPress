import { streamQuery, type IndexKey } from "convex-helpers/server/pagination";
import schema from "../schema";
import { catalogSnapshotBinding, openCatalogContinuation, sealCatalogContinuation, type CatalogContext, type CatalogContinuation } from "../commerce/catalogContinuation";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { requireCommerceEnabled } from "../commerce/helpers";
import { createCategoryVisibilityReader } from "../commerce/categoryVisibility";
import { createPublicProductAccessReader } from "../commerce/publicProductAccess";
import { createMembershipAccessEvaluator } from "../membership/access";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { CanonicalDataError } from "./foundation/contracts";
import { categoryTilesArgsSchema, categoryTilesResultSchema, type CategoryTilesResult } from "./foundation/categoryTilesContracts";

/** Exact visitor-visible counts across bounded, signed snapshot continuations.
 * Partial discovery stays hidden and partial counts are never displayed. */
export async function readCategoryTiles(ctx: QueryCtx, rawArgs: unknown,
  budget = new RequestReadLedger(), sources = new SourceByteLedger(), now = Date.now(), context?: CatalogContext): Promise<CategoryTilesResult> {
  const args = categoryTilesArgsSchema.parse(rawArgs);
  await requireCommerceEnabled(ctx, budget);
  const {cursor, ...selection} = args;
  let binding = cursor && context ? await catalogSnapshotBinding(ctx,context,selection,budget) : null;
  let previous: CatalogContinuation | null = cursor ? await openCatalogContinuation(cursor) : null;
  if (previous && (!binding || previous.binding !== binding || previous.expiresAt <= now || previous.startedAt > now)) previous = null;
  if (previous) budget.noteAuthorizationBoundary(previous.expiresAt, now);
  let phase: "ready" | "discovering" | "counting" = previous?.phase ?? "discovering";
  let key: IndexKey | null = previous?.key ?? null;
  let scanned = 0;
  // Leave room for one product's policy/ancestry and the selected card projection.
  const shouldYield = () => scanned >= 64 || budget.queries >= budget.limits.queries - 96 || sources.usedBytes >= 1024*1024;

  const categories = new Map<Id<"commerce_product_categories">, Doc<"commerce_product_categories"> | null>();
  const recordCategory = (row: Doc<"commerce_product_categories"> | null) => {
    budget.record(row); if (row) { sources.record("category", row); categories.set(row._id, row); } return row;
  };
  const getCategory = async (id: Id<"commerce_product_categories">) => {
    if (!categories.has(id)) {
      sources.beforeRead(); budget.beforeRead();
      categories.set(id, recordCategory(await ctx.db.get("commerce_product_categories", id)));
    }
    return categories.get(id) ?? null;
  };
  const ancestry = createCategoryVisibilityReader(ctx, [], getCategory);
  const access = createMembershipAccessEvaluator(ctx, budget);
  const selected: Doc<"commerce_product_categories">[] = [];
  const append = async (row: Doc<"commerce_product_categories"> | null) => {
    if (row && await ancestry(row) && (await access({resourceType:"route", resourceIdOrKey:`/categories/${encodeURIComponent(row.slug)}`})).allowed) selected.push(row);
  };
  if (previous) {
    for (const value of previous.categories) {
      const id = ctx.db.normalizeId("commerce_product_categories",value);
      if (!id) throw new CanonicalDataError("CATALOG_CURSOR_INVALID","cursor","Invalid category identity");
      await append(await getCategory(id));
    }
  }
  if (!previous && args.categorySlugs.length) {
    for (const slug of new Set(args.categorySlugs.map(value => value.trim().toLowerCase()))) {
      if (selected.length >= args.count) break;
      if (!slug) continue;
      sources.beforeRead(); budget.beforeRead();
      await append(recordCategory(await ctx.db.query("commerce_product_categories").withIndex("by_slug", q => q.eq("slug", slug)).unique()));
    }
    phase = "counting"; key = null;
  } else if (phase === "discovering") {
    const iterator = streamQuery(ctx,{schema,table:"commerce_product_categories",index:"by_sort",order:"asc",startIndexKey:key ?? [],startInclusive:key===null});
    try {
      while (selected.length < args.count) {
        if (shouldYield()) break;
        sources.beforeRead(); budget.beforeRead();
        const next = await iterator.next(); if (next.done) { phase="counting"; key=null; break; }
        const [row, position] = next.value;
        await append(recordCategory(row)); key=position; scanned++;

      }
    } finally { await iterator.return?.(undefined); }
    if (selected.length >= args.count) { phase="counting"; key=null; }
  }
  const counts = new Map(selected.map(row => [row._id, previous?.counts[previous.categories.indexOf(row._id)] ?? 0]));
  if (phase === "counting" && (!args.showCounts || !selected.length)) phase="ready";
  if (phase === "counting") {
    const readAccess = createPublicProductAccessReader(ctx, budget, sources, now);
    const iterator = streamQuery(ctx,{schema,table:"commerce_products",index:"by_status",order:"asc",startIndexKey:key ?? ["publish"],startInclusive:key===null,endIndexKey:["publish"],endInclusive:true});
    try {
      while (true) {
        if (shouldYield()) break;
        sources.beforeRead(); budget.beforeRead();
        const next = await iterator.next(); if (next.done) { phase="ready"; key=null; break; }
        const [row, position] = next.value;
        const product = budget.record(row); sources.record("product", product);
        key=position; scanned++;
        const matched = new Set<Id<"commerce_product_categories">>();
        for (const id of product.categoryIds) {
          const category = await getCategory(id); if (!category) continue;
          const parents = await ancestry(category); if (!parents) continue;
          for (const candidate of [category, ...parents]) if (counts.has(candidate._id)) matched.add(candidate._id);
        }
        if (!matched.size || !(await readAccess(product))) continue;
        budget.beforeRead();
        if (budget.record(await ctx.db.query("commerce_bundles").withIndex("by_product", q=>q.eq("productId",product._id)).first())) continue;
        for (const id of matched) counts.set(id, counts.get(id)! + 1);
      }
    } finally { await iterator.return?.(undefined); }
  }
  let nextCursor: string | null = null;
  if (phase !== "ready") {
    if (!binding && context) binding = await catalogSnapshotBinding(ctx,context,selection,budget);
    if (!binding) throw new CanonicalDataError("CATALOG_CURSOR_UNCONFIGURED","cursor","A trusted document and installation are required for catalog continuation");
    nextCursor = await sealCatalogContinuation({version:1,binding,startedAt:previous?.startedAt ?? now,
      expiresAt:Math.min(previous?.expiresAt ?? now+30*60*1000,budget.authorizationRecheckAt ?? Infinity),
      phase,key:key as CatalogContinuation["key"],categories:selected.map(row=>row._id),counts:selected.map(row=>counts.get(row._id)!)});
  }
  const items: CategoryTilesResult["items"] = [];
  if (phase === "discovering") return categoryTilesResultSchema.parse({items,state:phase,cursor,nextCursor});
  for (const category of selected) {
    let image: CategoryTilesResult["items"][number]["image"] = null;
    if (category.thumbnailMediaId) {
      sources.beforeRead(); budget.beforeRead();
      const media = budget.record(await ctx.db.get("media", category.thumbnailMediaId));
      if (media) sources.record("media", media);
      if (media?.status === "active" && media.mediaType === "image" && media.mimeType.startsWith("image/")) {
        let src = media.url;
        if (media.storageId) { budget.beforeRead(); src = await ctx.storage.getUrl(media.storageId) ?? src; }
        if (src) image = {src,alt:media.altText ?? ""};
      }
    }
    items.push({id:category._id,slug:category.slug,name:category.name,href:`/categories/${encodeURIComponent(category.slug)}`,
      description:args.showDescriptions ? category.description ?? null : null,image,productCount:args.showCounts && phase==="ready" ? counts.get(category._id)! : null});
  }
  return categoryTilesResultSchema.parse({items,state:phase,cursor,nextCursor});
}
