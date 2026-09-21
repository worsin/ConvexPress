// @ts-nocheck
/**
 * Demo shop seeder.
 *
 * Turns one of the hand-authored catalogs (Northstar Coffee, Ridgeline
 * Cycles) into a complete, distinct storefront on the site this backend is
 * deployed to: site identity, brand doc, colour palette, commerce settings,
 * assistant settings, categories, 20 products with images, and the relation
 * graph the assistant reasons over.
 *
 * Images are generated outside Convex (scripts/seed-demo-shop.ts) and passed
 * in as media ids keyed by product slug. Re-running is idempotent: products
 * and categories are matched by slug and updated in place.
 */

import { deleteWithMediaReferences, insertWithMediaReferences, patchWithMediaReferences , deleteDynamicWithMediaReferences} from "../media/attachmentGuard";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { syncProductSearch } from "../search/products";
import { northstarCoffee } from "./catalogs/northstarCoffee";
import { ridgelineCycles } from "./catalogs/ridgelineCycles";
import type { DemoShop } from "./catalogs/types";

const SHOPS: Record<string, DemoShop> = {
  [northstarCoffee.key]: northstarCoffee,
  [ridgelineCycles.key]: ridgelineCycles,
};

export function getDemoShop(key: string): DemoShop {
  const shop = SHOPS[key];
  if (!shop) throw new Error(`Unknown demo shop "${key}". Known: ${Object.keys(SHOPS).join(", ")}`);
  return shop;
}

async function pickAuthor(ctx: any) {
  const admins = await ctx.db.query("users").take(50);
  const preferred =
    admins.find((user: any) => /admin|owner/i.test(user.email ?? "")) ??
    admins.find((user: any) => user.status === "active") ??
    admins[0];
  if (!preferred) throw new Error("No user exists on this site to own seeded products.");
  return preferred;
}

async function upsertSettings(ctx: any, section: string, values: Record<string, unknown>, userId: any) {
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", section))
    .unique();
  const now = Date.now();
  if (existing) {
    await patchWithMediaReferences<"settings">(ctx, "settings", existing._id, { values: { ...(existing.values ?? {}), ...values }, updatedAt: now, updatedBy: userId });
  } else {
    await insertWithMediaReferences<"settings">(ctx, "settings", { section, values, updatedAt: now, updatedBy: userId });
  }
}

async function activatePalette(ctx: any, shop: DemoShop, userId: any) {
  const slug = `demo-${shop.key}`;
  const now = Date.now();
  const themes = await ctx.db.query("themes").take(200);
  for (const theme of themes) {
    if (theme.isActive && theme.slug !== slug) await patchWithMediaReferences<"themes">(ctx, "themes", theme._id, { isActive: false, updatedAt: now });
  }
  const existing = themes.find((theme: any) => theme.slug === slug);
  const doc = {
    name: `${shop.siteTitle} palette`,
    slug,
    description: `Seeded colour tokens for the ${shop.siteTitle} demo storefront.`,
    type: "custom" as const,
    colorPalette: shop.palette,
    isActive: true,
    createdBy: userId,
    updatedAt: now,
  };
  if (existing) await patchWithMediaReferences<"themes">(ctx, "themes", existing._id, doc);
  else await insertWithMediaReferences<"themes">(ctx, "themes", { ...doc, createdAt: now });
}

export const listShops = internalQuery({
  args: {},
  handler: async () =>
    Object.values(SHOPS).map((shop) => ({
      key: shop.key,
      siteTitle: shop.siteTitle,
      products: shop.products.map((product) => ({
        slug: product.slug,
        title: product.title,
        imagePrompt: `${shop.imageStyle}. ${product.imagePrompt}`,
      })),
    })),
});

export const seedShop = internalMutation({
  args: {
    shop: v.string(),
    /** product slug → media id of its generated image */
    media: v.record(v.string(), v.id("media")),
    /** OpenRouter/OpenAI key to store in Settings > AI (optional). */
    aiApiKey: v.optional(v.string()),
    aiModel: v.optional(v.string()),
    /** Public site address for General settings, e.g. http://127.0.0.1:4201 */
    siteUrl: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const shop = getDemoShop(args.shop);
    const author = await pickAuthor(ctx);
    const now = Date.now();

    // ── Identity, brand, commerce, assistant ────────────────────────────
    await upsertSettings(ctx, "general", {
      siteTitle: shop.siteTitle,
      tagline: shop.tagline,
      ...(args.siteUrl ? { siteUrl: args.siteUrl, homeUrl: args.siteUrl } : {}),
    }, author._id);
    await upsertSettings(ctx, "plugins", { commerceEnabled: true, commerceReviewsEnabled: true, commerceWishlistsEnabled: true }, author._id);
    await upsertSettings(ctx, "commerce.general", {
      storeName: shop.storeName,
      storeEmail: shop.storeEmail,
      currencyCode: shop.currencyCode,
      currencySymbol: shop.currencySymbol,
      allowGuestCheckout: true,
    }, author._id);
    await upsertSettings(ctx, "brand", {
      moodPrompt: shop.brand.moodPrompt,
      voice: shop.brand.voice,
      industry: shop.brand.industry,
      hardRules: shop.brand.hardRules,
      typography: shop.brand.typography,
      density: shop.brand.density,
      radius: shop.brand.radius,
    }, author._id);
    await upsertSettings(ctx, "commerce.assistant", {
      enabled: true,
      displayName: shop.assistant.displayName,
      tagline: shop.assistant.tagline,
      tone: shop.assistant.tone,
      starterPrompts: shop.assistant.starterPrompts,
      disclosureText: shop.assistant.disclosureText,
      ...(args.aiModel ? { model: args.aiModel } : {}),
    }, author._id);
    if (args.aiApiKey) {
      await upsertSettings(ctx, "ai", { provider: "openrouter", apiKey: args.aiApiKey }, author._id);
    }
    await activatePalette(ctx, shop, author._id);

    // ── Categories ──────────────────────────────────────────────────────
    const categoryIds = new Map<string, any>();
    for (const category of shop.categories) {
      const existing = await ctx.db
        .query("commerce_product_categories")
        .withIndex("by_slug", (q: any) => q.eq("slug", category.slug))
        .unique();
      const doc = {
        name: category.name,
        slug: category.slug,
        description: category.description,
        depth: 0,
        path: [],
        sortOrder: category.sortOrder,
        isVisible: true,
        isFeatured: category.sortOrder <= 3,
        showInNav: true,
        updatedAt: now,
      };
      if (existing) {
        await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", existing._id, doc);
        categoryIds.set(category.slug, existing._id);
      } else {
        const id: import("../_generated/dataModel").Id<"commerce_product_categories"> = await insertWithMediaReferences<"commerce_product_categories">(ctx, "commerce_product_categories", { ...doc, productCount: 0, createdAt: now });
        categoryIds.set(category.slug, id);
      }
    }

    // ── Products ────────────────────────────────────────────────────────
    const productIds = new Map<string, any>();
    for (const product of shop.products) {
      const categoryId = categoryIds.get(product.category);
      const mediaId = args.media[product.slug];
      const existing = await ctx.db
        .query("commerce_products")
        .withIndex("by_slug", (q: any) => q.eq("slug", product.slug))
        .unique();
      const doc = {
        title: product.title,
        slug: product.slug,
        description: product.description,
        excerpt: product.excerpt,
        status: "publish",
        productType: "simple",
        sku: product.sku,
        authorId: author._id,
        featuredMediaId: mediaId ?? existing?.featuredMediaId,
        galleryMediaIds: mediaId ? [mediaId] : existing?.galleryMediaIds ?? [],
        categoryIds: categoryId ? [categoryId] : [],
        basePrice: { amount: product.priceMinor, currencyCode: shop.currencyCode },
        salePrice: product.compareAtMinor
          ? { amount: product.priceMinor, currencyCode: shop.currencyCode }
          : undefined,
        trackInventory: true,
        stockQuantity: product.stock,
        allowBackorders: false,
        isVirtual: false,
        shippingWeightOz: product.weightOz,
        isDownloadable: false,
        isTaxable: true,
        conversationalAttributes: product.attributes,
        assistantSummary: product.summary,
        publishedAt: existing?.publishedAt ?? now,
        updatedAt: now,
      };
      if (product.compareAtMinor) {
        // Show the compare-at price as the base and the real price as the sale.
        doc.basePrice = { amount: product.compareAtMinor, currencyCode: shop.currencyCode };
      }
      let id;
      if (existing) {
        await patchWithMediaReferences<"commerce_products">(ctx, "commerce_products", existing._id, doc);
        id = existing._id;
      } else {
        id = await insertWithMediaReferences<"commerce_products">(ctx, "commerce_products", { ...doc, createdAt: now });
      }
      productIds.set(product.slug, id);
      await syncProductSearch(ctx, id);
    }

    // Category counts.
    for (const [slug, categoryId] of categoryIds) {
      const count = shop.products.filter((product) => product.category === slug).length;
      await patchWithMediaReferences<"commerce_product_categories">(ctx, "commerce_product_categories", categoryId, { productCount: count, totalProductCount: count, updatedAt: now });
    }

    // ── Relations ───────────────────────────────────────────────────────
    let relations = 0;
    for (const relation of shop.relations) {
      const fromId = productIds.get(relation.from);
      const toId = productIds.get(relation.to);
      if (!fromId || !toId) continue;
      const existing = await ctx.db
        .query("commerce_product_relations")
        .withIndex("by_pair", (q: any) => q.eq("fromProductId", fromId).eq("toProductId", toId).eq("type", relation.type))
        .unique();
      const doc = {
        fromProductId: fromId,
        toProductId: toId,
        type: relation.type,
        weight: relation.weight,
        source: "seed",
        evidence: relation.evidence,
        status: "active",
        updatedAt: now,
      };
      if (existing) await patchWithMediaReferences<"themes">(ctx, "themes", existing._id, doc);
      else await ctx.db.insert("commerce_product_relations", { ...doc, createdAt: now });
      relations += 1;
    }

    return {
      shop: shop.key,
      siteTitle: shop.siteTitle,
      categories: categoryIds.size,
      products: productIds.size,
      relations,
      imagesAttached: Object.keys(args.media).length,
    };
  },
});

/** Remove every product, category and relation the demo shop created. */
export const clearShop = internalMutation({
  args: { shop: v.string() },
  handler: async (ctx: any, args: any) => {
    const shop = getDemoShop(args.shop);
    let removed = 0;
    for (const product of shop.products) {
      const existing = await ctx.db
        .query("commerce_products")
        .withIndex("by_slug", (q: any) => q.eq("slug", product.slug))
        .unique();
      if (!existing) continue;
      const edges = [
        ...(await ctx.db.query("commerce_product_relations").withIndex("by_from", (q: any) => q.eq("fromProductId", existing._id)).collect()),
        ...(await ctx.db.query("commerce_product_relations").withIndex("by_to", (q: any) => q.eq("toProductId", existing._id)).collect()),
      ];
      for (const edge of edges) await deleteDynamicWithMediaReferences(ctx, edge._id);
      await deleteWithMediaReferences<"commerce_products">(ctx, "commerce_products", existing._id);
      await syncProductSearch(ctx, existing._id);
      removed += 1;
    }
    for (const category of shop.categories) {
      const existing = await ctx.db
        .query("commerce_product_categories")
        .withIndex("by_slug", (q: any) => q.eq("slug", category.slug))
        .unique();
      if (existing) await deleteWithMediaReferences<"commerce_product_categories">(ctx, "commerce_product_categories", existing._id);
    }
    return { removed };
  },
});
