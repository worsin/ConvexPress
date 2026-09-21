import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { SourceByteLedger } from "./sourceBudget";
import { createPublicProductCardProjector } from "./featuredProducts";
import { parseSourceOptions } from "./productOptionSource";
import { CanonicalDataError, DATA_LIMITS, encodedBytes } from "./foundation/contracts";
import { publicProductCardSchema } from "./foundation/productContracts";
import { resolvePrice } from "./foundation/commercePricing";
import { compareName, compareAttributeKey, productCompareArgsSchema, productCompareResultSchema, productCompareMatchArgs, type ProductCompareResult } from "./foundation/productCompareContracts";

type Details = Map<string, { label: string; values: string[] | null }>;
function fail(message: string): never { throw new CanonicalDataError("PRODUCT_COMPARE_INVALID", "productCompare", message); }
const clip = (value: string, length: number) => value.slice(0, length).replace(/[\uD800-\uDBFF]$/, "");
const priceInput = publicProductCardSchema.shape.pricing.unwrap();

/** Service-only: the registered canonical resolver authorizes the document and
 * supplies its saved selection. Every product is rechecked in this query snapshot. */
export async function readProductCompare(ctx: QueryCtx, rawArgs: unknown,
  budget = new RequestReadLedger(), sources = new SourceByteLedger(), now = Date.now()): Promise<ProductCompareResult> {
  const args = productCompareArgsSchema.parse(rawArgs);
  if (!Number.isSafeInteger(now) || now < 0) fail("Invalid pricing time.");
  const project = await createPublicProductCardProjector(ctx, false, budget, sources, now);
  const items: ProductCompareResult["items"] = [], details: Details[] = [];
  function effectivePrice(source: Doc<"commerce_product_variants"> | Doc<"commerce_products">) {
    const value = priceInput.parse({ price: "price" in source ? source.price : source.basePrice,
      salePrice: source.salePrice ?? null, salePriceFrom: source.salePriceFrom ?? null,
      salePriceTo: source.salePriceTo ?? null, pricedAt: now });
    const decision = resolvePrice(value.price, value.salePrice, {
      salePriceFrom: value.salePriceFrom ?? undefined, salePriceTo: value.salePriceTo ?? undefined,
    }, now);
    budget.noteAuthorizationBoundary(decision.recheckAt ?? undefined, now);
    return { amount: decision.amount, currencyCode: value.price.currencyCode };
  }
  for (const rawId of new Set(args.products)) {
    const id = ctx.db.normalizeId("commerce_products", rawId); if (!id) continue;
    sources.beforeRead(); budget.beforeRead();
    const product = budget.record(await ctx.db.get("commerce_products", id));
    const card = await project(product); if (!card || !product) continue;
    const fields: Details = new Map([
      ["type", { label: "Product type", values: [product.productType === "variable" ? "With options" : product.productType === "external" ? "External product" : "Single product"] }],
      ["format", { label: "Format", values: [product.isDownloadable ? "Downloadable" : product.isVirtual ? "Digital or service" : "Physical"] }],
      ["sku", { label: "SKU", values: product.sku?.trim() ? [clip(product.sku.trim(), 160)] : null }],
    ]);
    const prices: ReturnType<typeof effectivePrice>[] = [];
    if (product.productType === "variable") {
      const parsed = parseSourceOptions(product.optionTypes ?? []);
      if (!parsed.success) fail("Product options need repair before they can be compared.");
      const groups = parsed.data.sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(group => ({
        ...group, values: group.values.filter(value => value.active !== false).sort((a,b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
      if (new Set(groups.map(group => group.id)).size !== groups.length || new Set(groups.map(group => compareName(group.name))).size !== groups.length ||
        groups.some(group => new Set(group.values.map(value => value.id)).size !== group.values.length)) fail("Product option names or identities are ambiguous.");
      const allowed = new Map<string, Set<string>>(); let scanned = 0;
      for (const status of ["publish", undefined] as const) {
        const iterator = ctx.db.query("commerce_product_variants").withIndex("by_product_status", q => q.eq("productId", id).eq("status", status))[Symbol.asyncIterator]();
        try { while (true) {
          sources.beforeRead(); budget.beforeRead(); const next = await iterator.next(); if (next.done) break;
          const variant = budget.record(next.value); sources.record("variant", variant);
          if (++scanned > 128) fail("Product comparison exceeds the bounded variant budget; no partial price range is returned.");
          const selections = variant.selections ?? [];
          if (selections.length !== groups.length || new Set(selections.map(value => value.optionTypeId)).size !== groups.length ||
            selections.some(value => !groups.some(group => group.id === value.optionTypeId && group.values.some(option => option.id === value.optionValueId)))) continue;
          prices.push(effectivePrice(variant));
          for (const selected of selections) { const values = allowed.get(selected.optionTypeId) ?? new Set<string>(); values.add(selected.optionValueId); allowed.set(selected.optionTypeId, values); }
        }} finally { await iterator.return?.(); }
      }
      if (!prices.length) continue;
      for (const group of groups) {
        const values = [...new Set(group.values.filter(value => allowed.get(group.id)?.has(value.id)).map(value => value.label))];
        if (values.length) fields.set(`option:${compareName(group.name)}`, { label: group.name, values });
      }
    } else prices.push(effectivePrice(product));
    if (new Set(prices.map(price => price.currencyCode)).size !== 1) fail("A product has mixed variant currencies; no misleading price range is returned.");
    items.push({ id: card.id, title: card.title, href: card.href, image: card.image,
      price: { min: Math.min(...prices.map(price => price.amount)), max: Math.max(...prices.map(price => price.amount)), currencyCode: prices[0]!.currencyCode } });
    details.push(fields);
  }
  const requested = args.attributes.length ? [...new Map(args.attributes.map(label => [compareAttributeKey(label), label])).entries()] :
    [...new Map(details.flatMap(fields => [...fields].map(([key, value]) => [key, value.label] as const))).entries()];
  if (requested.length > 20) fail("These products have more than 20 public details. Choose the attributes to compare.");
  const rows = items.length ? requested.map(([key, label]) => ({ key, label: details.find(fields => fields.has(key))?.get(key)?.label ?? label,
    cells: details.map(fields => fields.get(key)?.values ?? null) })) : [];
  const result = productCompareResultSchema.parse({ items, rows });
  if (!productCompareMatchArgs(args, result)) fail("Comparison result does not match its saved selection.");
  if (encodedBytes(result) > DATA_LIMITS.resultBytes) fail("Comparison exceeds the display budget. Select fewer details; no partial comparison is returned.");
  return result;
}
