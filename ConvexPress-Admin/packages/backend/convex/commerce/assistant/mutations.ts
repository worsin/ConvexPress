/**
 * Shopping assistant - mutations.
 *
 * Thread bookkeeping, shopper memory (with the shopper in control), feedback,
 * recommendation attribution, and the internal writes the action needs.
 */

import { v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";
import {
  assistantBlockValidator,
  recommendationEventValidator,
  recommendationSurfaceValidator,
  shopperMemoryKindValidator,
} from "../../schema/commerceAssistant";
import { requireCommerceEnabled } from "../helpers";

async function ensureSessionDoc(ctx: any, sessionToken: string, userId?: any) {
  const existing = await ctx.db
    .query("commerce_assistant_sessions")
    .withIndex("by_session_token", (q: any) => q.eq("sessionToken", sessionToken))
    .unique();
  const now = Date.now();
  if (existing) {
    if (userId && !existing.userId) await ctx.db.patch(existing._id, { userId, updatedAt: now });
    return existing;
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

export const ensureSession = mutation({
  args: { sessionToken: v.string(), route: v.optional(v.string()), query: v.optional(v.string()) },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.route) patch.lastRoute = args.route;
    if (typeof args.query === "string" && args.query.trim()) patch.lastQuery = args.query.trim().slice(0, 200);
    await ctx.db.patch(session._id, patch);
    return String(session._id);
  },
});

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
    const now = Date.now();
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
    await ctx.db.patch(session._id, { messageCount: session.messageCount + 1, updatedAt: now });
    return String(id);
  },
});

export const setFeedback = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("commerce_assistant_messages"),
    feedback: v.union(v.literal("up"), v.literal("down"), v.null()),
  },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const message = await ctx.db.get(args.messageId);
    if (!message) return;
    const session = await ctx.db.get(message.sessionId);
    if (!session || session.sessionToken !== args.sessionToken) return;
    await ctx.db.patch(args.messageId, { feedback: args.feedback ?? undefined });
  },
});

export const clearThread = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const session = await ctx.db
      .query("commerce_assistant_sessions")
      .withIndex("by_session_token", (q: any) => q.eq("sessionToken", args.sessionToken))
      .unique();
    if (!session) return;
    const messages = await ctx.db
      .query("commerce_assistant_messages")
      .withIndex("by_session", (q: any) => q.eq("sessionId", session._id))
      .collect();
    for (const message of messages) await ctx.db.delete(message._id);
    await ctx.db.patch(session._id, { messageCount: 0, updatedAt: Date.now() });
  },
});

// ─── Memory ──────────────────────────────────────────────────────────────────

export async function rememberFactInternal(
  ctx: any,
  input: { subjectKey: string; fact: string; kind?: string; source: "stated" | "inferred"; retentionDays: number; consented: boolean },
) {
  const fact = input.fact.trim().slice(0, 240);
  if (!fact) return null;
  const rows = await ctx.db
    .query("commerce_shopper_memory")
    .withIndex("by_subject", (q: any) => q.eq("subjectKey", input.subjectKey))
    .collect();
  const duplicate = rows.find((row: any) => row.fact.toLowerCase() === fact.toLowerCase());
  const now = Date.now();
  const expiresAt = now + input.retentionDays * 86_400_000;
  if (duplicate) {
    await ctx.db.patch(duplicate._id, { updatedAt: now, expiresAt, consented: duplicate.consented || input.consented });
    return String(duplicate._id);
  }
  if (rows.length >= 40) {
    const oldest = [...rows].sort((a: any, b: any) => a.updatedAt - b.updatedAt)[0];
    if (oldest) await ctx.db.delete(oldest._id);
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
    await requireCommerceEnabled(ctx);
    return await rememberFactInternal(ctx, {
      subjectKey: args.sessionToken,
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
    subjectKey: v.string(),
    fact: v.string(),
    kind: v.optional(v.string()),
    retentionDays: v.number(),
  },
  handler: async (ctx: any, args: any) =>
    rememberFactInternal(ctx, {
      subjectKey: args.subjectKey,
      fact: args.fact,
      kind: args.kind,
      source: "stated",
      retentionDays: args.retentionDays,
      consented: true,
    }),
});

export const forgetFact = mutation({
  args: { sessionToken: v.string(), memoryId: v.id("commerce_shopper_memory") },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const row = await ctx.db.get(args.memoryId);
    if (!row || row.subjectKey !== args.sessionToken) return;
    await ctx.db.delete(args.memoryId);
  },
});

export const forgetAll = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    await requireCommerceEnabled(ctx);
    const rows = await ctx.db
      .query("commerce_shopper_memory")
      .withIndex("by_subject", (q: any) => q.eq("subjectKey", args.sessionToken))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

// ─── Briefs & facets ─────────────────────────────────────────────────────────

export const storeBrief = internalMutation({
  args: {
    kind: v.union(v.literal("query"), v.literal("cart"), v.literal("product")),
    cacheKey: v.string(),
    query: v.optional(v.string()),
    payload: v.any(),
    model: v.optional(v.string()),
    ttlMs: v.number(),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("commerce_assistant_briefs")
      .withIndex("by_cache_key", (q: any) => q.eq("cacheKey", args.cacheKey))
      .unique();
    const doc = {
      kind: args.kind,
      cacheKey: args.cacheKey,
      query: args.query,
      payload: args.payload,
      model: args.model,
      generatedAt: now,
      expiresAt: now + args.ttlMs,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
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
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("commerce_search_facets", doc);
  },
});

export const markTip = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx: any, args: any) => {
    const session = await ensureSessionDoc(ctx, args.sessionToken);
    await ctx.db.patch(session._id, { lastTipAt: Date.now(), updatedAt: Date.now() });
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
    await requireCommerceEnabled(ctx);
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
