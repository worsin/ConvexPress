import { adoptGuestMemory, adoptThread, transferHistoryBatch } from "./history";
/**
 * Shopping assistant - mutations.
 *
 * Thread bookkeeping, shopper memory (with the shopper in control), feedback,
 * recommendation attribution, and the internal writes the action needs.
 */

import { assistantScope } from "./scope";
import { isClosedCart } from "../cartLifecycle";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getSettingsDoc, mergeWithDefaults } from "../../settings/helpers";
import { internalMutation, mutation } from "../../_generated/server";
import {
  assistantBlockValidator,
  recommendationEventValidator,
  recommendationSurfaceValidator,
  shopperMemoryKindValidator,
} from "../../schema/commerceAssistant";
import { patchDynamicWithMediaReferences, deleteDynamicWithMediaReferences } from "../../media/attachmentGuard";


export async function ensureSessionDoc(ctx: any, sessionToken: string) {
  const { session: existing, user } = await assistantScope(ctx, sessionToken);
  const userId = user?._id;
  const now = Date.now();
  if (existing) {
    if (userId && !existing.userId) await patchDynamicWithMediaReferences(ctx, existing._id, { userId, updatedAt: Math.max(now, existing.updatedAt) });
    return userId && !existing.userId ? { ...existing, userId } : existing;
  }
  const id = await ctx.db.insert("commerce_assistant_sessions", {
    sessionToken,
    userId,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

/** Used only after the caller has authorized a cart recovery/merge. */
export async function adoptAssistantSession(ctx: any, sourceToken: string, destinationToken: string) {
  const scope = await assistantScope(ctx, sourceToken);
  if (!scope.user) return;
  const source = await ensureSessionDoc(ctx, sourceToken);
  await adoptGuestMemory(ctx, sourceToken, scope.user._id);
  await assistantScope(ctx, destinationToken);
  const destination = await ensureSessionDoc(ctx, destinationToken);
  await adoptThread(ctx, source, destination);
}

/** Settle legacy browser tokens before any cart or assistant query subscribes. */
export const resolveSession = mutation({
  args: { sessionToken: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    let sessionToken = args.sessionToken;
    let scope;
    try {
      scope = await assistantScope(ctx, sessionToken);
    } catch (error) {
      const code = error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
      if (code !== "SESSION_OWNER_MISMATCH" && code !== "INVALID_SESSION") throw error;
      sessionToken = crypto.randomUUID();
      scope = await assistantScope(ctx, sessionToken);
    }
    if (!scope.user) return sessionToken;
    let cartId: Id<"commerce_carts"> | null;
    try {
      // A sub-transaction is essential: later inventory validation can fail
      // after earlier lines have moved. Never commit those partial transfers.
      cartId = await ctx.runMutation(api.commerce.cart.merge, { sessionToken });
    } catch (error) {
      const code = error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
      const recoverable = ["CART_CONTEXT_MISMATCH", "CART_MERGE_LIMIT", "INSUFFICIENT_STOCK", "NOT_FOUND", "VALIDATION_ERROR", "BUNDLE_UNAVAILABLE", "BUNDLE_CHANGED", "invalid_bundle_selection"].includes(code ?? "");
      if (!recoverable || !scope.cart || isClosedCart(scope.cart)) throw error;
      // Preserve the current basket without repricing it. The signed-in cart
      // page exposes the other saved baskets and explicit combine/retry actions.
      cartId = scope.cart._id;
      if (!scope.cart.userId) await ctx.db.patch("commerce_carts", scope.cart._id, { userId: scope.user._id, updatedAt: Date.now() });
    }
    const cart = cartId ? await ctx.db.get("commerce_carts", cartId) : null;
    const destinationToken = cart?.sessionToken ?? sessionToken;
    await adoptAssistantSession(ctx, sessionToken, destinationToken);
    return destinationToken;
  },
});

export const ensureSession = mutation({
  args: { sessionToken: v.string(), route: v.optional(v.string()), query: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    const patch: Record<string, unknown> = { updatedAt: Math.max(Date.now(), session.updatedAt) };
    if (args.route) patch.lastRoute = args.route;
    if (typeof args.query === "string" && args.query.trim()) patch.lastQuery = args.query.trim().slice(0, 200);
    await patchDynamicWithMediaReferences(ctx, session._id, patch);
    return String(session._id);
  },
});

export async function appendMessageToSession(ctx: any, session: any, args: any) {
  const now = Math.max(Date.now(), session.updatedAt, (session.clearedBefore ?? 0) + 1);
  let recentUserTurnTimes: number[] | undefined;
  if (args.role === "user") {
    const doc = await getSettingsDoc(ctx, "commerce.assistant");
    const settings = mergeWithDefaults("commerce.assistant", doc?.values ?? null);
    if (settings.enabled === false) throw new ConvexError({ code: "DISABLED", message: "The shop assistant is turned off." });
    const configured = Number(settings.rateLimitPerMinute ?? 12);
    const limit = Number.isFinite(configured) ? Math.min(120, Math.max(1, Math.floor(configured))) : 12;
    const windowStart = Date.now() - 60_000;
    const times = session.recentUserTurnTimes ?? (await ctx.db.query("commerce_assistant_messages")
      .withIndex("by_session_role", (q: any) => q.eq("sessionId", session._id).eq("role", "user").gte("createdAt", windowStart)).take(120)).map((row: any) => row.createdAt);
    recentUserTurnTimes = times.filter((time: number) => time >= windowStart);
    if (recentUserTurnTimes!.length >= limit) throw new ConvexError({ code: "RATE_LIMITED", message: "Please try again in a minute." });
    recentUserTurnTimes!.push(now);
  }
  const id = await ctx.db.insert("commerce_assistant_messages", {
    sessionId: session._id,
    role: args.role,
    text: args.text,
    blocks: args.blocks,
    toolCalls: args.toolCalls,
    model: args.model,
    latencyMs: args.latencyMs,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    error: args.error,
    createdAt: now,
  });
  await patchDynamicWithMediaReferences(ctx, session._id, { messageCount: session.messageCount + 1, updatedAt: now, ...(recentUserTurnTimes ? { recentUserTurnTimes } : {}) });
  return String(id);
}

export const appendMessage = internalMutation({
  args: {
    sessionToken: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    text: v.optional(v.string()),
    blocks: v.array(assistantBlockValidator),
    toolCalls: v.optional(v.array(v.any())),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    return appendMessageToSession(ctx, session, args);
  },
});

export const setFeedback = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("commerce_assistant_messages"),
    feedback: v.union(v.literal("up"), v.literal("down"), v.null()),
  },
  handler: async (ctx: any, args: any) => {
    const scope = await assistantScope(ctx, args.sessionToken);
    const message = await ctx.db.get(args.messageId);
    if (!message) return;
    const session = await ctx.db.get(message.sessionId);
    if (!session || session._id !== scope.session?._id) return;
    await patchDynamicWithMediaReferences(ctx, args.messageId, { feedback: args.feedback ?? undefined });
  },
});

export const clearThread = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    const { session } = await assistantScope(ctx, args.sessionToken);
    if (!session) return;
    const cutoff = Math.max(Date.now(), session.updatedAt);
    await patchDynamicWithMediaReferences(ctx, session._id, { clearedBefore: cutoff, messageCount: 0, updatedAt: cutoff });
    await ctx.scheduler.runAfter(0, (internal as any).commerce.assistant.mutations.purgeThread, { sessionId: session._id, cutoff });
  },
});

/** Authorized by clearThread; the cutoff keeps later turns out of the purge. */
export const purgeThread = internalMutation({
  args: { sessionId: v.id("commerce_assistant_sessions"), cutoff: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ordinary = await ctx.db.query("commerce_assistant_messages")
      .withIndex("by_session_adopted", q => q.eq("sessionId", args.sessionId).eq("adoptedAt", undefined).lte("createdAt", args.cutoff)).take(250);
    const adopted = ordinary.length < 250 ? await ctx.db.query("commerce_assistant_messages")
      .withIndex("by_session_adopted", q => q.eq("sessionId", args.sessionId).gt("adoptedAt", 0).lte("adoptedAt", args.cutoff)).take(250 - ordinary.length) : [];
    const messages = [...ordinary, ...adopted];
    for (const message of messages) await deleteDynamicWithMediaReferences(ctx, message._id);
    if (messages.length === 250) await ctx.scheduler.runAfter(0, (internal as any).commerce.assistant.mutations.purgeThread, args);
    return null;
  },
});

/** Scheduled only by authenticated adoption; session ownership is checked again. */
export const transferHistory = internalMutation({
  args: { sessionId: v.id("commerce_assistant_sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.db.get("commerce_assistant_sessions", args.sessionId);
    if (source) await transferHistoryBatch(ctx, source);
    return null;
  },
});

// ─── Memory ──────────────────────────────────────────────────────────────────

export async function rememberFactInternal(
  ctx: any,
  input: { subjectKey: string; fact: string; kind?: string; source: "stated" | "inferred"; retentionDays: number; consented: boolean },
) {
  // Read the setting in the write transaction, including for a provider turn
  // that started while memory was enabled.
  const settings = await getSettingsDoc(ctx, "commerce.assistant");
  const assistant = mergeWithDefaults("commerce.assistant", settings?.values ?? null);
  if (assistant.memoryEnabled === false) {
    throw new ConvexError({ code: "MEMORY_DISABLED", message: "Shopper memory is disabled." });
  }
  const fact = input.fact.trim().slice(0, 240);
  if (!fact) return null;
  const rows = await ctx.db
    .query("commerce_shopper_memory")
    .withIndex("by_subject", (q: any) => q.eq("subjectKey", input.subjectKey))
    .take(41);
  if (rows.length > 40) throw new ConvexError({ code: "MEMORY_LIMIT", message: "Please clear saved preferences before adding another." });
  const duplicate = rows.find((row: any) => row.fact.toLowerCase() === fact.toLowerCase());
  const now = Date.now();
  const days = Number.isFinite(input.retentionDays) ? Math.min(3650, Math.max(1, input.retentionDays)) : 90;
  const expiresAt = now + days * 86_400_000;
  if (duplicate) {
    await patchDynamicWithMediaReferences(ctx, duplicate._id, { updatedAt: now, expiresAt, consented: duplicate.consented || input.consented });
    return String(duplicate._id);
  }
  if (rows.length >= 40) {
    const oldest = [...rows].sort((a: any, b: any) => a.updatedAt - b.updatedAt)[0];
    if (oldest) await deleteDynamicWithMediaReferences(ctx, oldest._id);
  }
  const kind = ["constraint", "preference", "household", "project", "other"].includes(input.kind ?? "")
    ? (input.kind as any)
    : "other";
  const id = await ctx.db.insert("commerce_shopper_memory", {
    subjectKey: input.subjectKey,
    kind,
    fact,
    source: input.source,
    confidence: input.source === "stated" ? 0.95 : 0.6,
    consented: input.consented,
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });
  return String(id);
}

export const rememberFact = mutation({
  args: { sessionToken: v.string(), fact: v.string(), kind: v.optional(shopperMemoryKindValidator) },
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    await ensureSessionDoc(ctx, args.sessionToken);
    const scope = await assistantScope(ctx, args.sessionToken);
    return await rememberFactInternal(ctx, {
      subjectKey: scope.subjectKey,
      fact: args.fact,
      kind: args.kind,
      source: "stated",
      retentionDays: 90,
      consented: true,
    });
  },
});

export const rememberFactFromAssistant = internalMutation({
  args: {
    sessionToken: v.string(),
    fact: v.string(),
    kind: v.optional(v.string()),
    retentionDays: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    await ensureSessionDoc(ctx, args.sessionToken);
    const scope = await assistantScope(ctx, args.sessionToken);
    return rememberFactInternal(ctx, {
      subjectKey: scope.subjectKey,
      fact: args.fact,
      kind: args.kind,
      source: "stated",
      retentionDays: args.retentionDays,
      consented: true,
    });
  },
});

export const forgetFact = mutation({
  args: { sessionToken: v.string(), memoryId: v.id("commerce_shopper_memory") },
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    const row = await ctx.db.get(args.memoryId);
    const scope = await assistantScope(ctx, args.sessionToken);
    if (!row || !scope.memoryKeys.includes(row.subjectKey)) return;
    await deleteDynamicWithMediaReferences(ctx, args.memoryId);
  },
});

export const forgetAll = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    const scope = await assistantScope(ctx, args.sessionToken);
    for (const subjectKey of scope.memoryKeys) {
      const rows = await ctx.db.query("commerce_shopper_memory")
        .withIndex("by_subject", (q: any) => q.eq("subjectKey", subjectKey)).take(201);
      if (rows.length > 200) throw new ConvexError({ code: "MEMORY_LIMIT", message: "Saved preferences need maintenance before they can be cleared." });
      for (const row of rows) await deleteDynamicWithMediaReferences(ctx, row._id);
    }
  },
});

// ─── Briefs & facets ─────────────────────────────────────────────────────────

export const storeBrief = internalMutation({
  args: {
    kind: v.union(v.literal("query"), v.literal("cart"), v.literal("product")),
    cacheKey: v.string(),
    sessionToken: v.string(),
    query: v.optional(v.string()),
    payload: v.any(),
    model: v.optional(v.string()),
    ttlMs: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    await ensureSessionDoc(ctx, args.sessionToken);
    const now = Date.now();
    const existing = await ctx.db
      .query("commerce_assistant_briefs")
      .withIndex("by_cache_key", (q: any) => q.eq("cacheKey", args.cacheKey))
      .unique();
    const doc = {
      kind: args.kind,
      cacheKey: args.cacheKey,
      sessionToken: args.sessionToken,
      query: args.query,
      payload: args.payload,
      model: args.model,
      generatedAt: now,
      expiresAt: now + args.ttlMs,
    };
    if (existing) await patchDynamicWithMediaReferences(ctx, existing._id, doc);
    else await ctx.db.insert("commerce_assistant_briefs", doc);
  },
});

export const storeFacets = internalMutation({
  args: {
    queryHash: v.string(),
    query: v.string(),
    chips: v.array(v.object({ label: v.string(), query: v.optional(v.string()), categorySlug: v.optional(v.string()) })),
  },
  handler: async (ctx: any, args: any) => {
    const existing = await ctx.db
      .query("commerce_search_facets")
      .withIndex("by_query_hash", (q: any) => q.eq("queryHash", args.queryHash))
      .unique();
    if (existing?.pinned || existing?.banned) return;
    const doc = { queryHash: args.queryHash, query: args.query, chips: args.chips, pinned: false, banned: false, generatedAt: Date.now() };
    if (existing) await patchDynamicWithMediaReferences(ctx, existing._id, doc);
    else await ctx.db.insert("commerce_search_facets", doc);
  },
});

export const markTip = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    await patchDynamicWithMediaReferences(ctx, session._id, { lastTipAt: Date.now(), updatedAt: Math.max(Date.now(), session.updatedAt) });
  },
});

// ─── Attribution ─────────────────────────────────────────────────────────────

export const logEvent = mutation({
  args: {
    sessionToken: v.string(),
    surface: recommendationSurfaceValidator,
    event: recommendationEventValidator,
    productIds: v.array(v.id("commerce_products")),
    groupKey: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    await assistantScope(ctx, args.sessionToken);
    const now = Date.now();
    for (const productId of args.productIds.slice(0, 24)) {
      await ctx.db.insert("commerce_recommendation_events", {
        surface: args.surface,
        sessionToken: args.sessionToken,
        productId,
        event: args.event,
        groupKey: args.groupKey,
        createdAt: now,
      });
    }
  },
});
