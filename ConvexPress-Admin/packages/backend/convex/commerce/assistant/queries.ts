import { visibleMessages } from "./history";
import { assistantScope } from "./scope";
/**
 * Shopping assistant - queries.
 *
 * Public, session-scoped reads for the storefront rail plus the internal
 * context bundle the action uses to ground a turn.
 */

import { ConvexError, v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "../../_generated/server";
import { relatedGroups, toProductCard, publicCartLines, visibleCategories, type ProductCard } from "../storefront";
import { storedBlocks } from "./blocks";
import { readAssistantSettings, readSettingsValues, stringSetting } from "../settingsInternals";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function memoryFor(ctx: Pick<QueryCtx, "db">, subjectKey: string) {
  const now = Date.now();
  const rows = await ctx.db
    .query("commerce_shopper_memory")
    .withIndex("by_subject", (q) => q.eq("subjectKey", subjectKey))
    .take(41);
  if (rows.length > 40) throw new ConvexError({ code: "MEMORY_LIMIT", message: "Please clear saved preferences before continuing." });
  return rows.filter((row) => !row.expiresAt || row.expiresAt > now);
}

export const getThread = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  returns: v.object({
    session: v.union(v.null(), v.object({
      id: v.string(),
      lastQuery: v.union(v.null(), v.string()),
      lastRoute: v.union(v.null(), v.string()),
      messageCount: v.number(),
    })),
    messages: v.array(v.object({
      id: v.string(),
      role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
      text: v.union(v.null(), v.string()),
      blocks: v.array(v.union(v.object({
        type: v.literal("cart_proposal"),
        id: v.string(),
        productId: v.string(),
        variantId: v.optional(v.string()),
        quantity: v.number(),
        title: v.string(),
        added: v.boolean(),
      }), v.object({ type: v.literal("text"), markdown: v.string() }), v.object({
        type: v.literal("product_group"),
        title: v.string(),
        reason: v.optional(v.string()),
        items: v.array(v.object({ productId: v.string(), rationale: v.optional(v.string()) })),
        seeMoreQuery: v.optional(v.string()),
      }), v.object({
        type: v.literal("compare_table"),
        columns: v.array(v.string()),
        rows: v.array(v.object({ productId: v.string(), values: v.array(v.string()) })),
      }), v.object({
        type: v.literal("callout"),
        tone: v.union(v.literal("note"), v.literal("warning"), v.literal("tip")),
        markdown: v.string(),
      }), v.object({
        type: v.literal("action_result"),
        action: v.union(v.literal("cart_add"), v.literal("remember"), v.literal("forget")),
        ok: v.boolean(),
        summary: v.string(),
        productId: v.optional(v.string()),
      }), v.object({ type: v.literal("chips"), items: v.array(v.string()) }), v.object({
        type: v.literal("facets"),
        items: v.array(v.object({ label: v.string(), query: v.optional(v.string()), categorySlug: v.optional(v.string()) })),
      }))),
      feedback: v.union(v.null(), v.literal("up"), v.literal("down")),
      error: v.union(v.null(), v.string()),
      model: v.union(v.null(), v.string()),
      latencyMs: v.union(v.null(), v.number()),
      createdAt: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const { session } = await assistantScope(ctx, args.sessionToken);
    const messages = session ? await visibleMessages(ctx, session, Math.min(60, Math.max(1, args.limit ?? 30))) : [];
    messages.reverse();
    return {
      session: session
        ? {
            id: String(session._id),
            lastQuery: session.lastQuery ?? null,
            lastRoute: session.lastRoute ?? null,
            messageCount: session.messageCount,
          }
        : null,
      messages: messages.map((message) => ({
        id: String(message._id),
        role: message.role,
        text: message.text ?? null,
        blocks: storedBlocks(message.blocks),
        feedback: message.feedback ?? null,
        error: message.error ?? null,
        model: message.model ?? null,
        latencyMs: message.latencyMs ?? null,
        createdAt: message.createdAt,
      })),
    };
  },
});

export const listMemory = query({
  args: { sessionToken: v.string() },
  returns: v.array(v.object({
    id: v.string(),
    kind: v.union(v.literal("other"), v.literal("constraint"), v.literal("preference"), v.literal("household"), v.literal("project")),
    fact: v.string(),
    source: v.union(v.literal("stated"), v.literal("inferred")),
    consented: v.boolean(),
    createdAt: v.number(),
  })),
  handler: async (ctx, args) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const rows = (await Promise.all(scope.memoryKeys.map(key => memoryFor(ctx, key)))).flat();
    return rows.map((row) => ({
      id: String(row._id),
      kind: row.kind,
      fact: row.fact,
      source: row.source,
      consented: row.consented,
      createdAt: row.createdAt,
    }));
  },
});

export const getBrief = query({
  args: { cacheKey: v.string(), sessionToken: v.string() },
  returns: v.union(v.null(), v.object({
    blocks: v.array(v.union(v.object({
      type: v.literal("cart_proposal"),
      id: v.string(),
      productId: v.string(),
      variantId: v.optional(v.string()),
      quantity: v.number(),
      title: v.string(),
      added: v.boolean(),
    }), v.object({ type: v.literal("text"), markdown: v.string() }), v.object({
      type: v.literal("product_group"),
      title: v.string(),
      reason: v.optional(v.string()),
      items: v.array(v.object({ productId: v.string(), rationale: v.optional(v.string()) })),
      seeMoreQuery: v.optional(v.string()),
    }), v.object({
      type: v.literal("compare_table"),
      columns: v.array(v.string()),
      rows: v.array(v.object({ productId: v.string(), values: v.array(v.string()) })),
    }), v.object({
      type: v.literal("callout"),
      tone: v.union(v.literal("note"), v.literal("warning"), v.literal("tip")),
      markdown: v.string(),
    }), v.object({
      type: v.literal("action_result"),
      action: v.union(v.literal("cart_add"), v.literal("remember"), v.literal("forget")),
      ok: v.boolean(),
      summary: v.string(),
      productId: v.optional(v.string()),
    }), v.object({ type: v.literal("chips"), items: v.array(v.string()) }), v.object({
      type: v.literal("facets"),
      items: v.array(v.object({ label: v.string(), query: v.optional(v.string()), categorySlug: v.optional(v.string()) })),
    }))),
    generatedAt: v.number(),
    model: v.union(v.null(), v.string()),
  })),
  handler: async (ctx, args) => {
    await assistantScope(ctx, args.sessionToken);
    const doc = await ctx.db
      .query("commerce_assistant_briefs")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .unique();
    if (!doc || doc.sessionToken !== args.sessionToken || doc.expiresAt <= Date.now()) return null;
    const assistant = await readAssistantSettings(ctx);
    // Brief payloads are stored untyped: { blocks, memoryEnabled }.
    const payload: unknown = doc.payload;
    const memoryEnabled = isRecord(payload) ? payload.memoryEnabled : undefined;
    if (assistant.enabled === false || (assistant.memoryEnabled === false && memoryEnabled !== false)) return null;
    return { blocks: storedBlocks(isRecord(payload) ? payload.blocks : undefined), generatedAt: doc.generatedAt, model: doc.model ?? null };
  },
});

/** Everything the action needs to ground one turn. */
export const contextBundle = internalQuery({
  args: { sessionToken: v.string(), route: v.optional(v.string()), query: v.optional(v.string()) },
  returns: v.object({
    assistant: v.object({
      enabled: v.boolean(),
      model: v.string(),
      memoryEnabled: v.boolean(),
      memoryRetentionDays: v.number(),
      tone: v.string(),
      disclosureText: v.string(),
      cardsPerGroup: v.number(),
      maxPicks: v.number(),
      rateLimitPerMinute: v.number(),
      groups: v.object({
        accessory: v.boolean(),
        consumable: v.boolean(),
        maintenance: v.boolean(),
        upgrade: v.boolean(),
        similar: v.boolean(),
      }),
    }),
    subjectKey: v.string(),
    ai: v.object({ provider: v.string(), defaultModel: v.string() }),
    store: v.object({
      storeName: v.string(),
      tagline: v.string(),
      currencyCode: v.string(),
      currencySymbol: v.string(),
      brandVoice: v.optional(v.string()),
      hardRules: v.optional(v.array(v.string())),
    }),
    session: v.union(v.null(), v.object({
      id: v.string(),
      lastQuery: v.union(v.null(), v.string()),
      lastTipAt: v.union(v.null(), v.number()),
      userId: v.union(v.null(), v.string()),
    })),
    recent: v.array(v.object({
      role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
      text: v.union(v.null(), v.string()),
      blocks: v.array(v.union(v.object({
        type: v.literal("cart_proposal"),
        id: v.string(),
        productId: v.string(),
        variantId: v.optional(v.string()),
        quantity: v.number(),
        title: v.string(),
        added: v.boolean(),
      }), v.object({ type: v.literal("text"), markdown: v.string() }), v.object({
        type: v.literal("product_group"),
        title: v.string(),
        reason: v.optional(v.string()),
        items: v.array(v.object({ productId: v.string(), rationale: v.optional(v.string()) })),
        seeMoreQuery: v.optional(v.string()),
      }), v.object({
        type: v.literal("compare_table"),
        columns: v.array(v.string()),
        rows: v.array(v.object({ productId: v.string(), values: v.array(v.string()) })),
      }), v.object({
        type: v.literal("callout"),
        tone: v.union(v.literal("note"), v.literal("warning"), v.literal("tip")),
        markdown: v.string(),
      }), v.object({
        type: v.literal("action_result"),
        action: v.union(v.literal("cart_add"), v.literal("remember"), v.literal("forget")),
        ok: v.boolean(),
        summary: v.string(),
        productId: v.optional(v.string()),
      }), v.object({ type: v.literal("chips"), items: v.array(v.string()) }), v.object({
        type: v.literal("facets"),
        items: v.array(v.object({ label: v.string(), query: v.optional(v.string()), categorySlug: v.optional(v.string()) })),
      }))),
    })),
    cart: v.object({
      lines: v.array(v.object({
        productId: v.string(),
        variantId: v.union(v.null(), v.string()),
        title: v.string(),
        variantTitle: v.union(v.null(), v.string()),
        slug: v.string(),
        quantity: v.number(),
        unitPriceAmount: v.number(),
        lineTotalAmount: v.number(),
        featuredMediaId: v.union(v.null(), v.string()),
        attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
        summary: v.union(v.null(), v.string()),
        unavailable: v.optional(v.literal(true)),
      })),
      subtotalAmount: v.number(),
      itemCount: v.number(),
      userId: v.union(v.null(), v.string()),
    }),
    cartCards: v.array(v.object({
      pricing: v.optional(v.object({
        salePriceFrom: v.optional(v.number()),
        salePriceTo: v.optional(v.number()),
        price: v.object({ amount: v.number(), currencyCode: v.string() }),
        salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
        pricedAt: v.number(),
      })),
      productId: v.string(),
      slug: v.string(),
      title: v.string(),
      excerpt: v.string(),
      summary: v.union(v.null(), v.string()),
      price: v.object({ amount: v.number(), currencyCode: v.string() }),
      compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
      featuredMediaId: v.union(v.null(), v.string()),
      categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
      inStock: v.boolean(),
      stockQuantity: v.union(v.null(), v.number()),
      productType: v.string(),
      attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
      defaultVariantId: v.union(v.null(), v.string()),
    })),
    related: v.array(v.object({
      key: v.string(),
      label: v.string(),
      items: v.array(v.object({
        card: v.object({
          pricing: v.optional(v.object({
            salePriceFrom: v.optional(v.number()),
            salePriceTo: v.optional(v.number()),
            price: v.object({ amount: v.number(), currencyCode: v.string() }),
            salePrice: v.optional(v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.optional(v.string()) }))),
            pricedAt: v.number(),
          })),
          productId: v.string(),
          slug: v.string(),
          title: v.string(),
          excerpt: v.string(),
          summary: v.union(v.null(), v.string()),
          price: v.object({ amount: v.number(), currencyCode: v.string() }),
          compareAtPrice: v.union(v.null(), v.object({ amount: v.number(), currencyCode: v.string() })),
          featuredMediaId: v.union(v.null(), v.string()),
          categories: v.array(v.object({ id: v.string(), name: v.string(), slug: v.string() })),
          inStock: v.boolean(),
          stockQuantity: v.union(v.null(), v.number()),
          productType: v.string(),
          attributes: v.union(v.null(), v.record(v.string(), v.union(v.boolean(), v.string(), v.number(), v.array(v.union(v.boolean(), v.string(), v.number()))))),
          defaultVariantId: v.union(v.null(), v.string()),
        }),
        reason: v.union(v.null(), v.string()),
        weight: v.number(),
        forProductId: v.string(),
        type: v.union(v.literal("accessory_of"), v.literal("compatible_with"), v.literal("consumable_for"), v.literal("maintenance_for"), v.literal("upgrade_of"), v.literal("replacement_for"), v.literal("bundle_with"), v.literal("similar_to")),
      })),
    })),
    memory: v.array(v.object({
      kind: v.union(v.literal("other"), v.literal("constraint"), v.literal("preference"), v.literal("household"), v.literal("project")),
      fact: v.string(),
      source: v.union(v.literal("stated"), v.literal("inferred")),
    })),
    categories: v.array(v.object({ name: v.string(), slug: v.string() })),
    recentUserTurns: v.number(),
  }),
  handler: async (ctx, args) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const [assistant, ai, general, commerce, brand] = await Promise.all([
      readAssistantSettings(ctx),
      readSettingsValues(ctx, "ai"),
      readSettingsValues(ctx, "general"),
      readSettingsValues(ctx, "commerce.general"),
      ctx.db
        .query("settings")
        .withIndex("by_section", (q) => q.eq("section", "brand"))
        .unique(),
    ]);

    const { session, cart } = scope;
    const recent = session ? await visibleMessages(ctx, session, 10) : [];
    recent.reverse();

    const lines = await publicCartLines(ctx, cart);

    const cartIds = lines.filter((line) => !line.unavailable).map((line) => line.productId);
    const cartCards: ProductCard[] = [];
    for (const id of [...new Set(cartIds)]) {
      const productId = ctx.db.normalizeId("commerce_products", id);
      const product = productId ? await ctx.db.get("commerce_products", productId) : null;
      if (product) cartCards.push(await toProductCard(ctx, product));
    }
    const related = cartIds.length
      ? await relatedGroups(ctx, [...new Set(cartIds)], { perGroup: Math.max(2, assistant.cardsPerGroup) })
      : [];

    // Disabling retention must also stop grounding from previously retained facts.
    // listMemory deliberately remains available for the shopper's Forget controls.
    const memory = assistant.memoryEnabled === false
      ? []
      : (await Promise.all(scope.memoryKeys.map(key => memoryFor(ctx, key)))).flat();
    const categories = await visibleCategories(ctx);

    const windowStart = Date.now() - 60_000;
    const recentUserTurns = recent.filter((m) => m.role === "user" && m.createdAt >= windowStart).length;

    const brandStored: unknown = brand?.values;
    const brandValues = isRecord(brandStored) ? brandStored : {};
    const hardRules = brandValues.hardRules;
    return {
      assistant,
      subjectKey: scope.subjectKey,
      ai: {
        provider: stringSetting(ai, "provider", "openrouter"),
        defaultModel: stringSetting(ai, "blockEditingModel") || stringSetting(ai, "defaultModel"),
      },
      store: {
        storeName: String(commerce.storeName || general.siteTitle || "our store"),
        tagline: String(general.tagline ?? ""),
        currencyCode: String(commerce.currencyCode ?? "USD"),
        currencySymbol: String(commerce.currencySymbol ?? "$"),
        brandVoice: typeof brandValues.voice === "string" ? brandValues.voice : undefined,
        hardRules: Array.isArray(hardRules) ? hardRules.filter((rule): rule is string => typeof rule === "string") : undefined,
      },
      session: session
        ? { id: String(session._id), lastQuery: session.lastQuery ?? null, lastTipAt: session.lastTipAt ?? null, userId: session.userId ? String(session.userId) : null }
        : null,
      recent: recent.map((m) => ({ role: m.role, text: m.text ?? null, blocks: storedBlocks(m.blocks) })),
      cart: { lines, subtotalAmount: cart?.subtotalAmount ?? 0, itemCount: cart?.itemCount ?? 0, userId: cart?.userId ? String(cart.userId) : null },
      cartCards,
      related,
      memory: memory.map((m) => ({ kind: m.kind, fact: m.fact, source: m.source })),
      categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
      recentUserTurns,
    };
  },
});
