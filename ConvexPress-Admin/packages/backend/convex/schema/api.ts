/**
 * API System - Schema
 *
 * Four tables supporting external API key authentication, outbound webhooks,
 * webhook delivery logging, and per-key rate limiting.
 *
 * This combines three WordPress capabilities into ConvexPress's API layer:
 *   - WP REST API (Convex HTTP actions at /api/v1/)
 *   - Application Passwords (API keys with scoping and rate limiting)
 *   - WooCommerce Webhooks (outbound HTTPS delivery with HMAC signing)
 *
 * Tables:
 *   - apiKeys: Bearer tokens for external API authentication.
 *     Keys are stored as SHA-256 hashes (never plaintext). Each key has
 *     an explicit scope array for principle-of-least-privilege access,
 *     and per-key rate limits (requests per minute and per hour).
 *
 *   - webhooks: Outbound webhook endpoint registrations. Each webhook
 *     subscribes to an event code (or wildcard pattern), has an HTTPS
 *     delivery URL, and an AES-256-GCM encrypted signing secret for
 *     HMAC-SHA256 payload verification.
 *
 *   - webhookDeliveries: Full request/response log for every webhook
 *     delivery attempt (including test deliveries and retries).
 *
 *   - apiRateLimitWindows: Sliding window counters for per-key rate
 *     limiting. One row per key per window type (minute/hour) per
 *     window start timestamp.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

export const apiTables = {
  // ─── API Keys ─────────────────────────────────────────────────────────────
  apiKeys: defineTable({
    // --- Identity ---
    /** Human-readable key name (e.g., "Mobile App", "CI/CD Pipeline") */
    name: v.string(),
    /** First 8 chars of the key for identification (e.g., "shk_a1b2") */
    keyPrefix: v.string(),
    /** SHA-256 hash of the full API key (never store plaintext) */
    keyHash: v.string(),

    // --- Ownership ---
    /** User identifier of the admin who created this key */
    userId: v.string(),

    // --- Authorization ---
    /** Array of permitted scopes (e.g., ["read:posts", "write:media"]) */
    scopes: v.array(
      v.union(
        v.literal("read:posts"),
        v.literal("write:posts"),
        v.literal("read:comments"),
        v.literal("write:comments"),
        v.literal("read:media"),
        v.literal("write:media"),
        v.literal("read:users"),
        v.literal("write:users"),
        v.literal("read:taxonomies"),
        v.literal("write:taxonomies"),
        v.literal("read:settings"),
        v.literal("write:settings"),
        v.literal("read:menus"),
        v.literal("write:menus"),
      ),
    ),

    // --- Status ---
    /** Current key status */
    status: v.union(
      v.literal("active"),
      v.literal("revoked"),
      v.literal("expired"),
    ),

    // --- Rate Limiting ---
    /** Max requests per minute (default: 60) */
    rateLimitPerMinute: v.number(),
    /** Max requests per hour (default: 1000) */
    rateLimitPerHour: v.number(),

    // --- Usage Tracking ---
    /** Timestamp of last successful authentication */
    lastUsedAt: v.optional(v.number()),
    /** IP address of last use */
    lastUsedIp: v.optional(v.string()),
    /** Total lifetime request count */
    requestCount: v.number(),

    // --- Expiration ---
    /** Optional expiration timestamp (undefined = never expires) */
    expiresAt: v.optional(v.number()),

    // --- Revocation ---
    /** When the key was revoked */
    revokedAt: v.optional(v.number()),
    /** User identifier of who revoked it */
    revokedBy: v.optional(v.string()),
    /** Optional reason for revocation */
    revokeReason: v.optional(v.string()),

    // --- Timestamps ---
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_keyPrefix", ["keyPrefix"])
    .index("by_userId", ["userId", "status"])
    .index("by_status", ["status"])
    .index("by_expires", ["expiresAt"]),

  // ─── Webhooks ─────────────────────────────────────────────────────────────
  webhooks: defineTable({
    // --- Identity ---
    /** Human-readable name (e.g., "Slack New Post Alert") */
    name: v.string(),

    // --- Delivery ---
    /** HTTPS endpoint URL to POST to */
    deliveryUrl: v.string(),
    /** AES-256-GCM encrypted signing secret (stored as iv:authTag:ciphertext) */
    secret: v.string(),

    // --- Subscription ---
    /** Event code to subscribe to (e.g., "post.published", "post.*", "*") */
    eventCode: v.string(),

    // --- Configuration ---
    /** Current status */
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("disabled"),
    ),
    /** Payload content type */
    contentType: v.union(
      v.literal("application/json"),
      v.literal("application/x-www-form-urlencoded"),
    ),

    // --- Failure Tracking ---
    /** Current streak of consecutive failures */
    consecutiveFailures: v.number(),
    /** Auto-disable threshold (default: 5) */
    maxConsecutiveFailures: v.number(),

    // --- Rate Limiting ---
    /** HTTP request timeout in ms (default: 15000) */
    deliveryTimeout: v.number(),

    // --- Ownership ---
    /** User identifier of the admin who created this webhook */
    userId: v.string(),

    // --- Event Listener Link ---
    /** Link to the Event Dispatcher listener record */
    eventListenerId: v.optional(v.id("eventListeners")),

    // --- Timestamps ---
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Last successful delivery timestamp */
    lastDeliveryAt: v.optional(v.number()),
    /** When auto-disabled due to failures */
    disabledAt: v.optional(v.number()),
  })
    .index("by_eventCode", ["eventCode", "status"])
    .index("by_status", ["status"])
    .index("by_userId", ["userId"])
    .index("by_listener", ["eventListenerId"]),

  // ─── Webhook Deliveries ───────────────────────────────────────────────────
  webhookDeliveries: defineTable({
    // --- References ---
    /** The webhook this delivery belongs to */
    webhookId: v.id("webhooks"),
    /** The event that triggered this delivery */
    eventId: v.optional(v.id("events")),

    // --- Request ---
    /** The URL the request was sent to */
    requestUrl: v.string(),
    /** JSON-serialized request headers */
    requestHeaders: v.string(),
    /** JSON-serialized request body */
    requestBody: v.string(),

    // --- Response ---
    /** HTTP status code (undefined if connection failed) */
    responseCode: v.optional(v.number()),
    /** JSON-serialized response headers */
    responseHeaders: v.optional(v.string()),
    /** Response body (truncated to 10KB) */
    responseBody: v.optional(v.string()),

    // --- Result ---
    /** true if 2xx response received */
    success: v.boolean(),
    /** Error message if delivery failed */
    error: v.optional(v.string()),

    // --- Timing ---
    /** Request duration in ms */
    duration: v.optional(v.number()),
    /** When the delivery attempt was made */
    deliveredAt: v.number(),

    // --- Context ---
    /** true if this was a manual test delivery */
    isTest: v.boolean(),
    /** Attempt number (1 = first try, 2+ = retries) */
    attempt: v.number(),
  })
    .index("by_webhook", ["webhookId", "deliveredAt"])
    .index("by_event", ["eventId"])
    .index("by_success", ["success", "deliveredAt"])
    .index("by_delivered", ["deliveredAt"]),

  // ─── API Rate Limit Windows ───────────────────────────────────────────────
  apiRateLimitWindows: defineTable({
    // --- Identity ---
    /** API key hash (links to apiKeys.keyHash) */
    keyHash: v.string(),
    /** Window type: minute or hour */
    windowType: v.union(v.literal("minute"), v.literal("hour")),
    /** Start of the current window (timestamp) */
    windowStart: v.number(),

    // --- Counter ---
    /** Number of requests in this window */
    requestCount: v.number(),
  }).index("by_key_window", ["keyHash", "windowType", "windowStart"]),
};
