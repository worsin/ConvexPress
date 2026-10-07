import { visibleMessages } from "./history";
import { assistantScope } from "./scope";
/**
 * Shopping assistant - queries.
 *
 * Public, session-scoped reads for the storefront rail plus the internal
 * context bundle the action uses to ground a turn.
 */

import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { getSettingsDoc, mergeWithDefaults } from "../../settings/helpers";
import { relatedGroups, toProductCard, publicCartLines, visibleCategories } from "../storefront";

async function getMergedSettingsSection(ctx: any, section: string): Promise<Record<string, unknown>> {
  const doc = await getSettingsDoc(ctx, section as any);
  return mergeWithDefaults(section as any, (doc?.values as Record<string, unknown> | null) ?? null) as Record<string, unknown>;
}

export async function memoryFor(ctx: any, subjectKey: string) {
  const now = Date.now();
  const rows = await ctx.db
    .query("commerce_shopper_memory")
    .withIndex("by_subject", (q: any) => q.eq("subjectKey", subjectKey))
    .take(41);
  if (rows.length > 40) throw new ConvexError({ code: "MEMORY_LIMIT", message: "Please clear saved preferences before continuing." });
  return rows.filter((row: any) => !row.expiresAt || row.expiresAt > now);
}

export const getThread = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx: any, args: any) => {
    const { session } = await assistantScope(ctx, args.sessionToken);
    if (!session) return { session: null, messages: [] as any[] };
    const messages = await visibleMessages(ctx, session, Math.min(60, Math.max(1, args.limit ?? 30)));
    messages.reverse();
    return {
      session: {
        id: String(session._id),
        lastQuery: session.lastQuery ?? null,
        lastRoute: session.lastRoute ?? null,
        messageCount: session.messageCount,
      },
      messages: messages.map((message: any) => ({
        id: String(message._id),
        role: message.role,
        text: message.text ?? null,
        blocks: message.blocks ?? [],
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
  handler: async (ctx: any, args: any) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const rows = (await Promise.all(scope.memoryKeys.map(key => memoryFor(ctx, key)))).flat();
    return rows.map((row: any) => ({
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
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    const doc = await ctx.db
      .query("commerce_assistant_briefs")
      .withIndex("by_cache_key", (q: any) => q.eq("cacheKey", args.cacheKey))
      .unique();
    if (!doc || doc.sessionToken !== args.sessionToken || doc.expiresAt <= Date.now()) return null;
    const assistant = await getMergedSettingsSection(ctx, "commerce.assistant");
    if (assistant.enabled === false || (assistant.memoryEnabled === false && doc.payload?.memoryEnabled !== false)) return null;
    return { blocks: doc.payload?.blocks ?? [], generatedAt: doc.generatedAt, model: doc.model ?? null };
  },
});

/** Everything the action needs to ground one turn. */
export const contextBundle = internalQuery({
  args: { sessionToken: v.string(), route: v.optional(v.string()), query: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const [assistant, ai, general, commerce, brand] = await Promise.all([
      getMergedSettingsSection(ctx, "commerce.assistant"),
      getMergedSettingsSection(ctx, "ai"),
      getMergedSettingsSection(ctx, "general"),
      getMergedSettingsSection(ctx, "commerce.general"),
      ctx.db
        .query("settings")
        .withIndex("by_section", (q: any) => q.eq("section", "brand"))
        .unique(),
    ]);

    const { session, cart } = scope;
    const recent = session ? await visibleMessages(ctx, session, 10) : [];
    recent.reverse();

    const lines = await publicCartLines(ctx, cart);

    const cartIds = lines.filter((line: any) => !line.unavailable).map((line: any) => line.productId);
    const cartCards = [];
    for (const id of [...new Set(cartIds)]) {
      const product = await ctx.db.get(id as any);
      if (product) cartCards.push(await toProductCard(ctx, product));
    }
    const related = cartIds.length
      ? await relatedGroups(ctx, [...new Set(cartIds)], { perGroup: Math.max(2, Number((assistant as any).cardsPerGroup ?? 2)) })
      : [];

    // Disabling retention must also stop grounding from previously retained facts.
    // listMemory deliberately remains available for the shopper's Forget controls.
    const memory = assistant.memoryEnabled === false
      ? []
      : (await Promise.all(scope.memoryKeys.map(key => memoryFor(ctx, key)))).flat();
    const categories = await visibleCategories(ctx);

    const windowStart = Date.now() - 60_000;
    const recentUserTurns = recent.filter((m: any) => m.role === "user" && m.createdAt >= windowStart).length;

    const brandValues = (brand?.values ?? {}) as Record<string, unknown>;
    return {
      assistant,
      subjectKey: scope.subjectKey,
      ai: {
        provider: (ai as any).provider ?? "openrouter",
        defaultModel: (ai as any).blockEditingModel || (ai as any).defaultModel || "",
      },
      store: {
        storeName: String((commerce as any).storeName || (general as any).siteTitle || "our store"),
        tagline: String((general as any).tagline ?? ""),
        currencyCode: String((commerce as any).currencyCode ?? "USD"),
        currencySymbol: String((commerce as any).currencySymbol ?? "$"),
        brandVoice: typeof brandValues.voice === "string" ? (brandValues.voice as string) : undefined,
        hardRules: Array.isArray(brandValues.hardRules) ? (brandValues.hardRules as string[]) : undefined,
      },
      session: session
        ? { id: String(session._id), lastQuery: session.lastQuery ?? null, lastTipAt: session.lastTipAt ?? null, userId: session.userId ? String(session.userId) : null }
        : null,
      recent: recent.map((m: any) => ({ role: m.role, text: m.text ?? null, blocks: m.blocks ?? [] })),
      cart: { lines, subtotalAmount: cart?.subtotalAmount ?? 0, itemCount: cart?.itemCount ?? 0, userId: cart?.userId ? String(cart.userId) : null },
      cartCards,
      related,
      memory: memory.map((m: any) => ({ kind: m.kind, fact: m.fact, source: m.source })),
      categories: categories.map((c: any) => ({ name: c.name, slug: c.slug })),
      recentUserTurns,
    };
  },
});
