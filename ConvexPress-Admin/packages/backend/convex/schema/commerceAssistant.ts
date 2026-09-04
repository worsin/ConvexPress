/**
 * Commerce Assistant System - Schema
 *
 * Tables behind the storefront shopping assistant, the product relation
 * graph that grounds its recommendations, and the shopper memory it is
 * allowed to keep.
 *
 *   - commerce_product_relations      typed edges between products
 *   - commerce_assistant_sessions     one thread per storefront session
 *   - commerce_assistant_messages     the thread (structured blocks)
 *   - commerce_shopper_memory         remembered constraints / preferences
 *   - commerce_assistant_briefs       cached auto-briefs (query + cart)
 *   - commerce_search_facets          AI "narrow your search" chips per query
 *   - commerce_recommendation_events  attribution (impression → add → order)
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const productRelationTypeValidator = v.union(
  v.literal("accessory_of"),
  v.literal("compatible_with"),
  v.literal("consumable_for"),
  v.literal("maintenance_for"),
  v.literal("upgrade_of"),
  v.literal("replacement_for"),
  v.literal("bundle_with"),
  v.literal("similar_to"),
);

export const productRelationSourceValidator = v.union(
  v.literal("manual"),
  v.literal("woo_upsell"),
  v.literal("woo_crosssell"),
  v.literal("ai_inferred"),
  v.literal("co_purchase"),
  v.literal("seed"),
);

export const assistantBlockValidator = v.any();

export const shopperMemoryKindValidator = v.union(
  v.literal("constraint"),
  v.literal("preference"),
  v.literal("household"),
  v.literal("project"),
  v.literal("other"),
);

export const recommendationSurfaceValidator = v.union(
  v.literal("rail"),
  v.literal("drawer"),
  v.literal("cart_page"),
  v.literal("product_page"),
  v.literal("search"),
);

export const recommendationEventValidator = v.union(
  v.literal("impression"),
  v.literal("click"),
  v.literal("add"),
  v.literal("purchase"),
);

export const commerceAssistantTables = {
  commerce_product_relations: defineTable({
    fromProductId: v.id("commerce_products"),
    toProductId: v.id("commerce_products"),
    type: productRelationTypeValidator,
    /** 0–1, higher means a stronger / more certain relation. */
    weight: v.number(),
    source: productRelationSourceValidator,
    /** Human-readable reason shown under the card ("fits the 51mm portafilter"). */
    evidence: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("rejected")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_from", ["fromProductId"])
    .index("by_from_status", ["fromProductId", "status"])
    .index("by_to", ["toProductId"])
    .index("by_pair", ["fromProductId", "toProductId", "type"])
    .index("by_status", ["status"]),

  commerce_assistant_sessions: defineTable({
    /** Same token the cart uses, so the thread follows the cart. */
    sessionToken: v.string(),
    userId: v.optional(v.id("users")),
    lastQuery: v.optional(v.string()),
    lastRoute: v.optional(v.string()),
    lastTipAt: v.optional(v.number()),
    messageCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_session_token", ["sessionToken"])
    .index("by_user", ["userId"]),

  commerce_assistant_messages: defineTable({
    sessionId: v.id("commerce_assistant_sessions"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    /** Plain text of the turn (user input, or assistant text fallback). */
    text: v.optional(v.string()),
    /** Structured assistant output; see commerce/assistant/blocks.ts. */
    blocks: v.array(assistantBlockValidator),
    toolCalls: v.optional(v.array(v.any())),
    model: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    feedback: v.optional(v.union(v.literal("up"), v.literal("down"))),
    error: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_session", ["sessionId", "createdAt"]),

  commerce_shopper_memory: defineTable({
    /** User id when signed in, otherwise the session token. */
    subjectKey: v.string(),
    kind: shopperMemoryKindValidator,
    fact: v.string(),
    source: v.union(v.literal("stated"), v.literal("inferred")),
    confidence: v.number(),
    consented: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_subject", ["subjectKey"])
    .index("by_expires", ["expiresAt"]),

  commerce_assistant_briefs: defineTable({
    kind: v.union(v.literal("query"), v.literal("cart"), v.literal("product")),
    cacheKey: v.string(),
    query: v.optional(v.string()),
    payload: v.any(),
    model: v.optional(v.string()),
    generatedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_cache_key", ["cacheKey"])
    .index("by_expires", ["expiresAt"]),

  commerce_search_facets: defineTable({
    queryHash: v.string(),
    query: v.string(),
    chips: v.array(
      v.object({
        label: v.string(),
        /** Search refinement appended to the query, or a category slug. */
        query: v.optional(v.string()),
        categorySlug: v.optional(v.string()),
      }),
    ),
    pinned: v.boolean(),
    banned: v.boolean(),
    generatedAt: v.number(),
  }).index("by_query_hash", ["queryHash"]),

  commerce_recommendation_events: defineTable({
    surface: recommendationSurfaceValidator,
    sessionToken: v.string(),
    productId: v.id("commerce_products"),
    event: recommendationEventValidator,
    groupKey: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_created", ["createdAt"])
    .index("by_product", ["productId", "createdAt"])
    .index("by_session", ["sessionToken", "createdAt"]),
};
