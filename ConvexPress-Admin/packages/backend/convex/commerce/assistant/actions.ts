/**
 * Shopping assistant - actions.
 *
 *   respond  one conversational turn: grounded tool-calling loop over the
 *            store's own catalog, cart and relation graph, ending in typed
 *            blocks the rail renders.
 *   brief    the zero-prompt auto brief shown when results render or the
 *            cart changes: deterministic candidates first (search + relation
 *            graph), one model call to write it up, cached briefly.
 *
 * Provider: Settings > AI selects OpenRouter, OpenAI, or Anthropic directly.
 * The adapter preserves provider-specific credentials and tool-call protocols.
 */

import { ConvexError, v } from "convex/values";
import { action } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import { assistantChat, resolveAssistantProvider, ASSISTANT_UNAVAILABLE, type ChatMessage } from "./provider";
import {
  extractJsonObject,
  normalizeBlocks,
  productIdsInBlocks,
  type AssistantBlock,
} from "./blocks";
import {
  buildBriefPrompt,
  buildSystemPrompt,
  describeCart,
  describeMemory,
  describeProducts,
  formatMoney,
  type StoreContext,
} from "./prompts";

const anyApi = api as any;
const anyInternal = internal as any;

const MAX_TOOL_ROUNDS = 6;
const BRIEF_TTL_MS = 30 * 60_000;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Search this store's catalog. Returns product cards with ids, prices, stock, categories and attributes.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text" },
          category_slug: { type: "string" },
          max_price: { type: "number", description: "Max price in major units, e.g. 200 for $200" },
          min_price: { type: "number" },
          in_stock_only: { type: "boolean" },
          limit: { type: "integer", minimum: 1, maximum: 24 },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_products",
      description: "Load full cards for specific product ids (from search results or the cart).",
      parameters: { type: "object", properties: { product_ids: { type: "array", items: { type: "string" } } }, required: ["product_ids"] },
    },
  },
  {
    type: "function",
    function: {
      name: "related_products",
      description: "What goes with the given products according to the store's relation graph: accessories, consumables, maintenance items, upgrades, similar picks. Each item carries the store's own reason.",
      parameters: { type: "object", properties: { product_ids: { type: "array", items: { type: "string" } }, per_group: { type: "integer", minimum: 1, maximum: 6 } }, required: ["product_ids"] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_to_cart",
      description: "Add a product to the shopper's cart. Only call when the shopper clearly asked to add it.",
      parameters: { type: "object", properties: { product_id: { type: "string" }, variant_id: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 20 } }, required: ["product_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description: "Remember a fact the shopper stated about themselves or their situation (e.g. '15-inch cabinet clearance', 'prefers organic'). Never store inferred facts.",
      parameters: { type: "object", properties: { fact: { type: "string" }, kind: { type: "string", enum: ["constraint", "preference", "household", "project", "other"] } }, required: ["fact"] },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_products",
      description: "Get side-by-side attributes for products so you can emit a compare_table block.",
      parameters: { type: "object", properties: { product_ids: { type: "array", items: { type: "string" } } }, required: ["product_ids"] },
    },
  },
];

async function resolveProvider(ctx: any, assistantModel: string) {
  const settings = await ctx.runQuery(anyInternal.settings.httpInternals.getBySectionInternal, { section: "ai" });
  return resolveAssistantProvider(settings ?? {}, assistantModel);
}

function storeContextFrom(bundle: any): StoreContext {
  const assistant = bundle.assistant ?? {};
  return {
    storeName: bundle.store.storeName,
    tagline: bundle.store.tagline,
    currencyCode: bundle.store.currencyCode,
    currencySymbol: bundle.store.currencySymbol,
    tone: String(assistant.tone ?? "warm, expert, concise"),
    disclosureText: String(assistant.disclosureText ?? ""),
    brandVoice: bundle.store.brandVoice,
    hardRules: bundle.store.hardRules,
    groups: assistant.groups ?? {},
    maxPicks: Number(assistant.maxPicks ?? 5),
    cardsPerGroup: Number(assistant.cardsPerGroup ?? 2),
  };
}

function relatedGroupsText(groups: any[], store: StoreContext): string {
  if (!groups?.length) return "";
  return groups
    .map(
      (group) =>
        `${group.label}:\n` +
        group.items
          .map(
            (item: any) =>
              `  - [${item.card.productId}] ${item.card.title} — ${formatMoney(item.card.price.amount, store.currencyCode, store.currencySymbol)} — ${item.reason ?? "goes with your cart"} (for ${item.forProductId})`,
          )
          .join("\n"),
    )
    .join("\n");
}



// ─── respond ─────────────────────────────────────────────────────────────────

export const respond = action({
  args: {
    sessionToken: v.string(),
    message: v.string(),
    route: v.optional(v.string()),
    query: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any): Promise<{ messageId: string | null; blocks: AssistantBlock[]; productIds: string[] }> => {
    const startedAt = Date.now();
    const message = args.message.trim().slice(0, 2000);
    if (!message) throw new ConvexError({ code: "VALIDATION_ERROR", message: "Say something first." });

    const bundle = await ctx.runQuery(anyInternal.commerce.assistant.queries.contextBundle, {
      sessionToken: args.sessionToken,
      route: args.route,
      query: args.query,
    });
    if (bundle.assistant?.enabled === false) {
      throw new ConvexError({ code: "DISABLED", message: "The shop assistant is turned off." });
    }


    await ctx.runMutation(anyInternal.commerce.assistant.mutations.appendMessage, {
      sessionToken: args.sessionToken,
      role: "user",
      text: message,
      blocks: [],
    });
    await ctx.runMutation(anyApi.commerce.assistant.mutations.ensureSession, {
      sessionToken: args.sessionToken,
      route: args.route,
      query: args.query,
    });

    const store = storeContextFrom(bundle);
    const provider = await resolveProvider(ctx, String(bundle.assistant?.model ?? ""));
    if (!provider.apiKey) {
      const blocks: AssistantBlock[] = [
        { type: "callout", tone: "warning", markdown: ASSISTANT_UNAVAILABLE },
      ];
      const messageId = await ctx.runMutation(anyInternal.commerce.assistant.mutations.appendMessage, {
        sessionToken: args.sessionToken,
        role: "assistant",
        blocks,
        error: "missing_api_key",
      });
      return { messageId, blocks, productIds: [] };
    }

    const known = new Set<string>(bundle.cart.lines.map((line: any) => line.productId));
    const history: ChatMessage[] = bundle.recent
      .filter((entry: any) => entry.role !== "system")
      .slice(-8)
      .map((entry: any) => ({
        role: entry.role,
        content:
          entry.role === "user"
            ? entry.text ?? ""
            : (entry.blocks ?? [])
                .map((block: any) =>
                  block.type === "text" || block.type === "callout"
                    ? block.markdown
                    : block.type === "product_group"
                      ? `${block.title}: ${block.items.map((item: any) => item.productId).join(", ")}`
                      : "",
                )
                .filter(Boolean)
                .join("\n") || entry.text || "",
      }));

    const context = [
      `Live cart (${bundle.cart.itemCount} items, subtotal ${formatMoney(bundle.cart.subtotalAmount, store.currencyCode, store.currencySymbol)}):\n${describeCart(bundle.cart.lines, store)}`,
      bundle.cartCards.length ? `Cart product details:\n${describeProducts(bundle.cartCards, store)}` : "",
      bundle.related.length ? `Relation graph for the cart:\n${relatedGroupsText(bundle.related, store)}` : "",
      bundle.assistant?.memoryEnabled === false
        ? "Saved shopper memory is disabled. Do not claim to remember or save preferences."
        : `Remembered about this shopper:\n${describeMemory(bundle.memory)}`,
      bundle.session?.lastQuery ? `Most recent search: "${bundle.session.lastQuery}"` : "",
      bundle.categories.length ? `Categories: ${bundle.categories.map((c: any) => c.name).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    for (const group of bundle.related) for (const item of group.items) known.add(item.card.productId);

    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(store, args.route, args.query ?? bundle.session?.lastQuery ?? undefined) },
      { role: "system", content: context },
      ...history,
      { role: "user", content: message },
    ];

    const toolLog: any[] = [];
    const actionBlocks: AssistantBlock[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    let finalText = "";
    let providerFailed = false;

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      let response: Awaited<ReturnType<typeof assistantChat>>;
      try {
        response = await assistantChat(provider, messages, { tools: TOOLS, allowTools: round < MAX_TOOL_ROUNDS });
      } catch {
        // Retain confirmed cart actions even when the following model call fails.
        // Do not replay tools: a retry could repeat a successful cart mutation.
        providerFailed = true;
        break;
      }
      const { message: reply, usage } = response;
      tokensIn += usage.prompt_tokens ?? 0;
      tokensOut += usage.completion_tokens ?? 0;
      messages.push({ role: "assistant", content: reply.content ?? "", tool_calls: reply.tool_calls });

      if (!reply.tool_calls?.length) {
        finalText = reply.content ?? "";
        break;
      }

      for (const call of reply.tool_calls) {
        let parsed: any = {};
        try {
          parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          parsed = {};
        }
        let result: unknown;
        try {
          result = await runTool(ctx, call.function.name, parsed, { sessionToken: args.sessionToken, bundle, store, known, actionBlocks });
        } catch (error) {
          result = { error: error instanceof Error ? error.message : String(error) };
        }
        toolLog.push({ name: call.function.name, args: parsed, ok: !(result as any)?.error });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result).slice(0, 12_000),
        });
      }
    }

    const parsed = extractJsonObject(finalText) as any;
    let blocks = normalizeBlocks(parsed?.blocks, known);
    if (providerFailed) blocks = [{ type: "callout", tone: "warning", markdown: ASSISTANT_UNAVAILABLE }];
    if (!blocks.length) {
      const fallback = finalText.replace(/```[\s\S]*?```/g, "").trim();
      blocks = [{ type: "text", markdown: fallback || "I couldn't put that together. Try asking in a different way." }];
    }
    blocks = [...actionBlocks, ...blocks];

    if (bundle.assistant?.memoryEnabled !== false && Array.isArray(parsed?.memory)) {
      for (const entry of parsed.memory.slice(0, 3)) {
        if (entry && typeof entry.fact === "string" && entry.fact.trim()) {
          try {
            await ctx.runMutation(anyInternal.commerce.assistant.mutations.rememberFactFromAssistant, {
              sessionToken: args.sessionToken,
              fact: entry.fact,
              kind: typeof entry.kind === "string" ? entry.kind : undefined,
              retentionDays: Number(bundle.assistant?.memoryRetentionDays ?? 90),
            });
          } catch (error) {
            // A setting change during generation must not discard the answer or
            // a completed cart action. Other failures remain visible.
            if ((error as any)?.data?.code !== "MEMORY_DISABLED") throw error;
          }
        }
      }
    }
    if (Array.isArray(parsed?.suggestedPrompts) && !blocks.some((block) => block.type === "chips")) {
      const items = parsed.suggestedPrompts.filter((p: unknown) => typeof p === "string").slice(0, 4);
      if (items.length) blocks.push({ type: "chips", items });
    }

    const messageId = await ctx.runMutation(anyInternal.commerce.assistant.mutations.appendMessage, {
      sessionToken: args.sessionToken,
      role: "assistant",
      text: blocks.find((block) => block.type === "text")?.type === "text" ? (blocks.find((block) => block.type === "text") as any).markdown : undefined,
      blocks,
      toolCalls: toolLog,
      ...(providerFailed ? { error: "provider_unavailable" } : {}),
      model: provider.model,
      latencyMs: Date.now() - startedAt,
      tokensIn,
      tokensOut,
    });
    return { messageId, blocks, productIds: productIdsInBlocks(blocks) };
  },
});

async function runTool(
  ctx: any,
  name: string,
  input: any,
  scope: { sessionToken: string; bundle: any; store: StoreContext; known: Set<string>; actionBlocks: AssistantBlock[] },
): Promise<unknown> {
  const toMinor = (major: unknown) => (typeof major === "number" && Number.isFinite(major) ? Math.round(major * 100) : undefined);
  switch (name) {
    case "search_products": {
      const result = await ctx.runQuery(anyApi.commerce.storefront.searchProducts, {
        q: String(input.query ?? "").slice(0, 200),
        categorySlug: typeof input.category_slug === "string" ? input.category_slug : undefined,
        maxPriceAmount: toMinor(input.max_price),
        minPriceAmount: toMinor(input.min_price),
        inStockOnly: input.in_stock_only === true,
        perPage: Math.min(24, Math.max(1, Number(input.limit ?? 10))),
      });
      for (const card of result.items) scope.known.add(card.productId);
      return { total: result.total, products: describeProducts(result.items, scope.store), facets: result.facets };
    }
    case "get_products":
    case "compare_products": {
      const ids = Array.isArray(input.product_ids) ? input.product_ids.map(String).slice(0, 12) : [];
      const cards = await ctx.runQuery(anyApi.commerce.storefront.productCards, { productIds: ids });
      for (const card of cards) scope.known.add(card.productId);
      if (name === "compare_products") {
        return {
          products: cards.map((card: any) => ({
            productId: card.productId,
            title: card.title,
            price: formatMoney(card.price.amount, scope.store.currencyCode, scope.store.currencySymbol),
            inStock: card.inStock,
            attributes: card.attributes ?? {},
            summary: card.summary,
          })),
        };
      }
      return { products: describeProducts(cards, scope.store) };
    }
    case "related_products": {
      const ids = Array.isArray(input.product_ids) ? input.product_ids.map(String).slice(0, 8) : [];
      const groups = await ctx.runQuery(anyApi.commerce.storefront.relatedForProducts, {
        productIds: ids,
        perGroup: Math.min(6, Math.max(1, Number(input.per_group ?? scope.store.cardsPerGroup))),
      });
      for (const group of groups) for (const item of group.items) scope.known.add(item.card.productId);
      return { groups: relatedGroupsText(groups, scope.store) || "No relations recorded for these products." };
    }
    case "add_to_cart": {
      const productId = String(input.product_id ?? "");
      if (!scope.known.has(productId)) {
        return { error: "Only products from this conversation's results or the cart can be added." };
      }
      const quantity = Math.min(20, Math.max(1, Number(input.quantity ?? 1)));
      const cards = await ctx.runQuery(anyApi.commerce.storefront.productCards, { productIds: [productId] });
      const card = cards[0];
      if (!card) return { error: "That product is no longer available." };
      await ctx.runMutation(anyApi.commerce.cart.addItem, {
        sessionToken: scope.sessionToken,
        productId,
        variantId: typeof input.variant_id === "string" ? input.variant_id : card.defaultVariantId ?? undefined,
        quantity,
      });
      scope.actionBlocks.push({
        type: "action_result",
        action: "cart_add",
        ok: true,
        summary: `Added ${quantity > 1 ? `${quantity} × ` : ""}${card.title} to your cart.`,
        productId,
      });
      return { ok: true, added: card.title, quantity };
    }
    case "remember": {
      if (scope.bundle.assistant?.memoryEnabled === false) return { ok: false, reason: "memory disabled" };
      const fact = String(input.fact ?? "").trim();
      if (!fact) return { error: "fact is required" };
      await ctx.runMutation(anyInternal.commerce.assistant.mutations.rememberFactFromAssistant, {
        sessionToken: scope.sessionToken,
        fact,
        kind: typeof input.kind === "string" ? input.kind : undefined,
        retentionDays: Number(scope.bundle.assistant?.memoryRetentionDays ?? 90),
      });
      scope.actionBlocks.push({ type: "action_result", action: "remember", ok: true, summary: `Remembered: ${fact}` });
      return { ok: true };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ─── brief ───────────────────────────────────────────────────────────────────

export const brief = action({
  args: {
    sessionToken: v.string(),
    kind: v.union(v.literal("query"), v.literal("cart"), v.literal("product")),
    query: v.optional(v.string()),
    productId: v.optional(v.string()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx: any, args: any): Promise<{ cacheKey: string; blocks: AssistantBlock[]; cached: boolean; productIds: string[] }> => {
    const bundle = await ctx.runQuery(anyInternal.commerce.assistant.queries.contextBundle, {
      sessionToken: args.sessionToken,
      query: args.query,
    });
    if (bundle.assistant?.enabled === false) {
      throw new ConvexError({ code: "DISABLED", message: "The shop assistant is turned off." });
    }
    const store = storeContextFrom(bundle);
    const query = (args.query ?? "").trim().slice(0, 200);
    const cartIds = [...new Set(bundle.cart.lines.map((line: any) => line.productId))].sort();

    // Deterministic groundwork.
    const known = new Set<string>(cartIds as string[]);
    let candidates: any[] = [];
    if (args.kind === "query" && query) {
      const result = await ctx.runQuery(anyApi.commerce.storefront.searchProducts, { q: query, perPage: 12 });
      candidates = result.items;
    } else if (args.kind === "product" && args.productId) {
      candidates = await ctx.runQuery(anyApi.commerce.storefront.productCards, { productIds: [args.productId] });
    }
    for (const card of candidates) known.add(card.productId);
    const seedIds = args.kind === "product" && args.productId ? [args.productId] : (cartIds as string[]);
    const related = seedIds.length
      ? await ctx.runQuery(anyApi.commerce.storefront.relatedForProducts, { productIds: seedIds, perGroup: store.cardsPerGroup })
      : [];
    for (const group of related) for (const item of group.items) known.add(item.card.productId);

    // Deterministic fallback blocks (used when no model, or if the model fails).
    const fallback: AssistantBlock[] = [];
    if (args.kind === "query" && candidates.length) {
      fallback.push({
        type: "product_group",
        title: `Top matches for “${query}”`,
        items: candidates.slice(0, store.maxPicks).map((card: any) => ({ productId: card.productId, rationale: card.summary ?? undefined })),
      });
    }
    for (const group of related) {
      fallback.push({
        type: "product_group",
        title: group.label,
        items: group.items.slice(0, store.cardsPerGroup).map((item: any) => ({ productId: item.card.productId, rationale: item.reason ?? undefined })),
      });
    }

    const provider = await resolveProvider(ctx, String(bundle.assistant?.model ?? ""));
    // Read current catalog data before checking the cache: IDs alone cannot
    // detect changed variants, quantities, prices or unpublished products.
    const grounding = JSON.stringify({
      version: 2, query, productId: args.productId ?? null, kind: args.kind,
      assistant: bundle.assistant, store, cart: bundle.cart,
      memory: bundle.memory, categories: bundle.categories, candidates, related,
      provider: { kind: provider.kind, model: provider.model, available: Boolean(provider.apiKey) },
    });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(grounding));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const cacheKey = `${args.sessionToken}:${args.kind}:v2:${fingerprint}`;
    if (!args.force) {
      const cached = await ctx.runQuery(anyApi.commerce.assistant.queries.getBrief, { cacheKey, sessionToken: args.sessionToken });
      if (cached) return { cacheKey, blocks: cached.blocks, cached: true, productIds: productIdsInBlocks(cached.blocks) };
    }
    if (query) {
      await ctx.runMutation(anyApi.commerce.assistant.mutations.ensureSession, { sessionToken: args.sessionToken, query });
    }
    let blocks: AssistantBlock[] = fallback;
    let model: string | undefined;
    if (provider.apiKey && (candidates.length || related.length || bundle.cart.lines.length)) {
      const prompt = buildBriefPrompt({
        store,
        kind: args.kind,
        query,
        cart: bundle.cart.lines,
        memory: bundle.memory,
        candidates: candidates.length ? describeProducts(candidates, store) : "",
        relatedGroups: relatedGroupsText(related, store),
        categories: bundle.categories.map((c: any) => c.name),
      });
      try {
        const { message } = await assistantChat(
          provider,
          [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          { maxTokens: 1200, json: true },
        );
        const parsed = extractJsonObject(message.content ?? "") as any;
        const normalized = normalizeBlocks(parsed?.blocks, known);
        if (normalized.some((block) => block.type === "product_group" || block.type === "text")) {
          blocks = normalized;
          model = provider.model;
          // Personalized facets stay in this session's brief, not the public query cache.
        }
      } catch (error) {
        blocks = [
          ...fallback,
          { type: "callout", tone: "note", markdown: "Live suggestions are unavailable right now; showing what the catalog knows." },
        ];
      }
    }

    await ctx.runMutation(anyInternal.commerce.assistant.mutations.storeBrief, {
      kind: args.kind,
      cacheKey,
      sessionToken: args.sessionToken,
      query: query || undefined,
      payload: { blocks, memoryEnabled: bundle.assistant?.memoryEnabled !== false },
      model,
      ttlMs: BRIEF_TTL_MS,
    });
    return { cacheKey, blocks, cached: false, productIds: productIdsInBlocks(blocks) };
  },
});
