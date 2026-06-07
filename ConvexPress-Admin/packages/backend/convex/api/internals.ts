/**
 * API System - Internal Functions
 *
 * Internal functions not callable from clients. Used by the Event Dispatcher,
 * cron jobs, and other backend systems.
 *
 * Functions:
 *
 *   - authenticateRequest: Validates an API key from an Authorization header.
 *     Parses Bearer token, hashes it, looks up the key, checks status,
 *     expiration, scope, and rate limits. Used by HTTP action handlers.
 *
 *   - deliverWebhook: Delivers a webhook payload to an external HTTPS endpoint.
 *     Called by the Event Dispatcher when a subscribed event fires. Decrypts
 *     the signing secret, computes HMAC-SHA256, sends HTTP POST, logs the
 *     delivery, and manages failure/success counters.
 *
 *   - cleanupExpiredKeys: Hourly cron function that marks expired API keys
 *     and cleans up stale rate limit windows.
 *
 *   - cleanupDeliveryLogs: Daily cron function that deletes delivery log
 *     records older than 30 days.
 *
 * Usage (from other Convex functions):
 *   import { lookupUserByIdentifier } from "../helpers/permissions";
import { internal } from "../_generated/api";
 *
 *   // In an HTTP action handler:
 *   const authResult = await ctx.runMutation(
 *     internal.api.internals.authenticateRequest,
 *     { authorizationHeader: req.headers.get("Authorization"), requiredScope: "read:posts" }
 *   );
 */

import {
  internalMutation,
  internalAction,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { emitEvent } from "../helpers/events";
import { API_EVENTS, SYSTEM } from "../events/constants";
import {
  authenticateRequestArgs,
  deliverWebhookArgs,
  cleanupExpiredKeysArgs,
  cleanupDeliveryLogsArgs,
  API_KEY_REGEX,
  DELIVERY_LOG_RETENTION_MS,
  DELIVERY_LOG_CLEANUP_BATCH_SIZE,
  STALE_RATE_LIMIT_WINDOW_MS,
  MAX_RESPONSE_BODY_SIZE,
  isValidApiKeyScope,
} from "./validators";
import {
  sha256Hash,
  decryptSecret,
  computeHmacSignature,
} from "./crypto_helpers";
import { lookupUserByIdentifier } from "../helpers/permissions";

// ─── authenticateRequest ────────────────────────────────────────────────────

/**
 * Authenticate an external API request by validating the Bearer token.
 *
 * Steps:
 *   1. Parse "Bearer <token>" from the Authorization header
 *   2. Validate token format (shk_ prefix, 48 chars, hex)
 *   3. SHA-256 hash the token for database lookup
 *   4. Look up apiKeys by by_keyHash index
 *   5. Validate status (must be active) and expiration
 *   6. Check required scope against key's scopes array
 *   7. Check rate limits (per-minute and per-hour sliding windows)
 *   8. Update usage tracking (lastUsedAt, lastUsedIp, requestCount)
 *   9. Increment rate limit counters
 *
 * @returns Authentication result with key data or error details
 */
export const authenticateRequest = internalMutation({
  args: authenticateRequestArgs,
  handler: async (ctx, args) => {
    const { authorizationHeader, requiredScope, clientIp } = args;

    // 1. Parse Authorization header
    if (!authorizationHeader.startsWith("Bearer ")) {
      return {
        authenticated: false,
        error: "Invalid Authorization header. Must be 'Bearer <token>'",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    const token = authorizationHeader.substring(7);

    // 2. Validate token format
    if (!API_KEY_REGEX.test(token)) {
      return {
        authenticated: false,
        error: "Invalid API key format",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    // 3. Hash the token
    const keyHash = await sha256Hash(token);

    // 4. Look up the key
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
      .unique();

    if (!key) {
      return {
        authenticated: false,
        error: "Invalid API key",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    // 5. Check status
    if (key.status === "revoked") {
      return {
        authenticated: false,
        error: "API key has been revoked",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    if (key.status === "expired") {
      return {
        authenticated: false,
        error: "API key has expired",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    // Check expiration in real-time (cron may not have marked it yet)
    const now = Date.now();
    if (key.expiresAt && key.expiresAt < now) {
      // Mark as expired for future lookups
      await ctx.db.patch("apiKeys", key._id, {
        status: "expired",
        updatedAt: now,
      });
      return {
        authenticated: false,
        error: "API key has expired",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    // 6. Check scope
    if (
      !isValidApiKeyScope(requiredScope) ||
      !key.scopes.includes(requiredScope)
    ) {
      return {
        authenticated: false,
        error: `API key lacks required scope: ${requiredScope}`,
        errorCode: "FORBIDDEN" as const,
      };
    }

    // 7. Check rate limits
    const minuteWindowStart = Math.floor(now / 60000) * 60000;
    const hourWindowStart = Math.floor(now / 3600000) * 3600000;

    // Check per-minute rate limit
    const minuteWindow = await ctx.db
      .query("apiRateLimitWindows")
      .withIndex("by_key_window", (q) =>
        q
          .eq("keyHash", keyHash)
          .eq("windowType", "minute")
          .eq("windowStart", minuteWindowStart),
      )
      .unique();

    if (minuteWindow && minuteWindow.requestCount >= key.rateLimitPerMinute) {
      const retryAfter = Math.ceil(
        (minuteWindowStart + 60000 - now) / 1000,
      );
      return {
        authenticated: false,
        error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        errorCode: "RATE_LIMITED" as const,
        retryAfter,
      };
    }

    // Check per-hour rate limit
    const hourWindow = await ctx.db
      .query("apiRateLimitWindows")
      .withIndex("by_key_window", (q) =>
        q
          .eq("keyHash", keyHash)
          .eq("windowType", "hour")
          .eq("windowStart", hourWindowStart),
      )
      .unique();

    if (hourWindow && hourWindow.requestCount >= key.rateLimitPerHour) {
      const retryAfter = Math.ceil(
        (hourWindowStart + 3600000 - now) / 1000,
      );
      return {
        authenticated: false,
        error: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        errorCode: "RATE_LIMITED" as const,
        retryAfter,
      };
    }

    // 8. Update usage tracking
    await ctx.db.patch("apiKeys", key._id, {
      lastUsedAt: now,
      lastUsedIp: clientIp,
      requestCount: key.requestCount + 1,
      updatedAt: now,
    });

    // 9. Increment rate limit counters
    if (minuteWindow) {
      await ctx.db.patch("apiRateLimitWindows", minuteWindow._id, {
        requestCount: minuteWindow.requestCount + 1,
      });
    } else {
      await ctx.db.insert("apiRateLimitWindows", {
        keyHash,
        windowType: "minute",
        windowStart: minuteWindowStart,
        requestCount: 1,
      });
    }

    if (hourWindow) {
      await ctx.db.patch("apiRateLimitWindows", hourWindow._id, {
        requestCount: hourWindow.requestCount + 1,
      });
    } else {
      await ctx.db.insert("apiRateLimitWindows", {
        keyHash,
        windowType: "hour",
        windowStart: hourWindowStart,
        requestCount: 1,
      });
    }

    // 10. Return success
    return {
      authenticated: true,
      keyId: key._id,
      userId: key.userId,
      scopes: key.scopes,
      keyPrefix: key.keyPrefix,
    };
  },
});

// ─── deliverWebhook ─────────────────────────────────────────────────────────

/**
 * Deliver a webhook payload to an external HTTPS endpoint.
 *
 * This is an internal action (makes external HTTP calls) invoked by the
 * Event Dispatcher when a subscribed event fires.
 *
 * Steps:
 *   1. Fetch webhook record
 *   2. Verify webhook is active
 *   3. Construct payload JSON
 *   4. Decrypt signing secret (AES-256-GCM)
 *   5. Compute HMAC-SHA256 signature
 *   6. HTTP POST to delivery URL with ConvexPress headers
 *   7. Log delivery result to webhookDeliveries table
 *   8. On success: reset consecutiveFailures, update lastDeliveryAt
 *   9. On failure: increment consecutiveFailures, auto-disable if threshold reached
 */
export const deliverWebhook = internalAction({
  args: deliverWebhookArgs,
  handler: async (ctx, args) => {
    const { webhookId, eventId, eventCode, payload, attempt, isTest } = args;
    const deliveryAttempt = attempt ?? 1;
    const isTestDelivery = isTest ?? false;
    const deliveredAt = Date.now();

    // 1. Fetch webhook record (via internal query)
    const webhook = await ctx.runQuery(
      internal.api.internals.getWebhookInternal,
      { webhookId },
    );

    if (!webhook) {
      // Webhook was deleted between event firing and delivery
      return;
    }

    // 2. Check if webhook is active
    if (webhook.status !== "active") {
      return;
    }

    // 3. Construct delivery payload
    const deliveryId = `del_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const deliveryPayload = {
      event: eventCode,
      timestamp: deliveredAt,
      delivery_id: deliveryId,
      webhook_id: webhookId,
      data: JSON.parse(payload),
    };

    const bodyString = JSON.stringify(deliveryPayload);

    // 4. Decrypt signing secret
    const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    let plaintextSecret: string;
    try {
      plaintextSecret = await decryptSecret(
        webhook.secret,
        encryptionKey ?? "",
      );
    } catch (err) {
      // Log the failure and return
      await ctx.runMutation(
        internal.api.internals.recordDeliveryFailure,
        {
          webhookId,
          eventId,
          requestUrl: webhook.deliveryUrl,
          requestBody: bodyString,
          error: `Failed to decrypt webhook secret: ${err instanceof Error ? err.message : String(err)}`,
          deliveredAt,
          isTest: isTestDelivery,
          attempt: deliveryAttempt,
        },
      );
      return;
    }

    // 5. Compute HMAC-SHA256 signature
    const signature = await computeHmacSignature(plaintextSecret, bodyString);

    // 6. Build request headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": webhook.contentType,
      "User-Agent": "ConvexPress-Webhook/1.0",
      "X-ConvexPress-Event": eventCode,
      "X-ConvexPress-Signature": signature,
      "X-ConvexPress-Delivery": deliveryId,
      "X-ConvexPress-Webhook-Id": webhookId,
      "X-ConvexPress-Timestamp": String(deliveredAt),
    };

    // 7. Send HTTP POST
    let responseCode: number | undefined;
    let responseHeaders: string | undefined;
    let responseBody: string | undefined;
    let success = false;
    let error: string | undefined;
    let duration: number | undefined;

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        webhook.deliveryTimeout,
      );

      const response = await fetch(webhook.deliveryUrl, {
        method: "POST",
        headers: requestHeaders,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      duration = Date.now() - startTime;
      responseCode = response.status;
      success = response.status >= 200 && response.status < 300;

      // Capture response headers
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });
      responseHeaders = JSON.stringify(respHeaders);

      // Capture response body (truncated to MAX_RESPONSE_BODY_SIZE)
      try {
        const rawBody = await response.text();
        responseBody =
          rawBody.length > MAX_RESPONSE_BODY_SIZE
            ? rawBody.substring(0, MAX_RESPONSE_BODY_SIZE) + "... [truncated]"
            : rawBody;
      } catch {
        responseBody = "[Unable to read response body]";
      }

      if (!success) {
        error = `HTTP ${response.status} ${response.statusText}`;
      }
    } catch (err) {
      duration = Date.now() - startTime;
      success = false;

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          error = `Request timed out after ${webhook.deliveryTimeout}ms`;
        } else {
          error = err.message;
        }
      } else {
        error = String(err);
      }
    }

    // 8. Log delivery result
    await ctx.runMutation(
      internal.api.internals.recordDeliveryResult,
      {
        webhookId,
        eventId,
        requestUrl: webhook.deliveryUrl,
        requestHeaders: JSON.stringify(requestHeaders),
        requestBody: bodyString,
        responseCode,
        responseHeaders,
        responseBody,
        success,
        error,
        duration,
        deliveredAt,
        isTest: isTestDelivery,
        attempt: deliveryAttempt,
      },
    );
  },
});

// ─── getWebhookInternal ─────────────────────────────────────────────────────

/**
 * Internal query to fetch a webhook record (including the encrypted secret).
 * Used by the deliverWebhook action to read webhook configuration.
 */
export const getWebhookInternal = internalQuery({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    return await ctx.db.get("webhooks", args.webhookId);
  },
});

// ─── recordDeliveryResult ───────────────────────────────────────────────────

/**
 * Internal mutation to record a webhook delivery result.
 * Inserts the delivery log and updates the webhook's failure/success counters.
 */
export const recordDeliveryResult = internalMutation({
  args: {
    webhookId: v.id("webhooks"),
    eventId: v.optional(v.id("events")),
    requestUrl: v.string(),
    requestHeaders: v.string(),
    requestBody: v.string(),
    responseCode: v.optional(v.number()),
    responseHeaders: v.optional(v.string()),
    responseBody: v.optional(v.string()),
    success: v.boolean(),
    error: v.optional(v.string()),
    duration: v.optional(v.number()),
    deliveredAt: v.number(),
    isTest: v.boolean(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    // Insert delivery log
    await ctx.db.insert("webhookDeliveries", {
      webhookId: args.webhookId,
      eventId: args.eventId,
      requestUrl: args.requestUrl,
      requestHeaders: args.requestHeaders,
      requestBody: args.requestBody,
      responseCode: args.responseCode,
      responseHeaders: args.responseHeaders,
      responseBody: args.responseBody,
      success: args.success,
      error: args.error,
      duration: args.duration,
      deliveredAt: args.deliveredAt,
      isTest: args.isTest,
      attempt: args.attempt,
    });

    // Update webhook counters
    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) return;

    const now = Date.now();

    if (args.success) {
      // Reset failure counter on success
      await ctx.db.patch("webhooks", args.webhookId, {
        consecutiveFailures: 0,
        lastDeliveryAt: now,
        updatedAt: now,
      });
    } else {
      // Increment failure counter
      const newFailureCount = webhook.consecutiveFailures + 1;
      const patch: Record<string, unknown> = {
        consecutiveFailures: newFailureCount,
        updatedAt: now,
      };

      // Auto-disable if threshold reached
      if (newFailureCount >= webhook.maxConsecutiveFailures) {
        patch.status = "disabled";
        patch.disabledAt = now;

        // Deactivate the event listener
        if (webhook.eventListenerId) {
          const listener = await ctx.db.get("eventListeners", webhook.eventListenerId);
          if (listener) {
            await ctx.db.patch("eventListeners", webhook.eventListenerId, {
              isActive: false,
              updatedAt: now,
            });
          }
        }
      }

      await ctx.db.patch("webhooks", args.webhookId, patch);
    }

    await emitEvent(ctx, API_EVENTS.WEBHOOK_TRIGGERED, SYSTEM.API, {
      webhookId: args.webhookId,
      eventId: args.eventId ?? null,
      url: args.requestUrl,
      endpoint: args.requestUrl,
      statusCode: args.responseCode ?? null,
      success: args.success,
      error: args.error ?? null,
      durationMs: args.duration ?? null,
      isTest: args.isTest,
      attempt: args.attempt,
    });
  },
});

// ─── recordDeliveryFailure ──────────────────────────────────────────────────

/**
 * Internal mutation to record a delivery failure (pre-flight failures like
 * decryption errors, before the HTTP request is even made).
 */
export const recordDeliveryFailure = internalMutation({
  args: {
    webhookId: v.id("webhooks"),
    eventId: v.optional(v.id("events")),
    requestUrl: v.string(),
    requestBody: v.string(),
    error: v.string(),
    deliveredAt: v.number(),
    isTest: v.boolean(),
    attempt: v.number(),
  },
  handler: async (ctx, args) => {
    // Insert delivery log with failure
    await ctx.db.insert("webhookDeliveries", {
      webhookId: args.webhookId,
      eventId: args.eventId,
      requestUrl: args.requestUrl,
      requestHeaders: "{}",
      requestBody: args.requestBody,
      success: false,
      error: args.error,
      deliveredAt: args.deliveredAt,
      isTest: args.isTest,
      attempt: args.attempt,
    });

    // Increment failure counter on webhook
    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) return;

    const now = Date.now();
    const newFailureCount = webhook.consecutiveFailures + 1;
    const patch: Record<string, unknown> = {
      consecutiveFailures: newFailureCount,
      updatedAt: now,
    };

    if (newFailureCount >= webhook.maxConsecutiveFailures) {
      patch.status = "disabled";
      patch.disabledAt = now;

      if (webhook.eventListenerId) {
        const listener = await ctx.db.get("eventListeners", webhook.eventListenerId);
        if (listener) {
          await ctx.db.patch("eventListeners", webhook.eventListenerId, {
            isActive: false,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.patch("webhooks", args.webhookId, patch);

    await emitEvent(ctx, API_EVENTS.WEBHOOK_TRIGGERED, SYSTEM.API, {
      webhookId: args.webhookId,
      eventId: args.eventId ?? null,
      url: args.requestUrl,
      endpoint: args.requestUrl,
      statusCode: null,
      success: false,
      error: args.error,
      durationMs: null,
      networkError: true,
      isTest: args.isTest,
      attempt: args.attempt,
    });
  },
});

// ─── cleanupExpiredKeys ─────────────────────────────────────────────────────

/**
 * Hourly cron function to expire old API keys and clean up stale rate limit windows.
 *
 * Steps:
 *   1. Query apiKeys where expiresAt < now and status is still "active"
 *   2. Mark each as "expired"
 *   3. Clean up stale apiRateLimitWindows records older than 2 hours
 */
export const cleanupExpiredKeys = internalMutation({
  args: cleanupExpiredKeysArgs,
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Find active keys that have expired
    const allActiveKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    let expiredCount = 0;
    for (const key of allActiveKeys) {
      if (key.expiresAt && key.expiresAt < now) {
        await ctx.db.patch("apiKeys", key._id, {
          status: "expired",
          updatedAt: now,
        });
        expiredCount++;
      }
    }

    // 2. Clean up stale rate limit windows (older than 2 hours)
    const staleThreshold = now - STALE_RATE_LIMIT_WINDOW_MS;
    const allWindows = await ctx.db.query("apiRateLimitWindows").collect();

    let cleanedWindows = 0;
    for (const window of allWindows) {
      if (window.windowStart < staleThreshold) {
        await ctx.db.delete("apiRateLimitWindows", window._id);
        cleanedWindows++;
      }
    }

    return { expiredCount, cleanedWindows };
  },
});

// ─── cleanupDeliveryLogs ────────────────────────────────────────────────────

/**
 * Daily cron function to delete old webhook delivery logs.
 * Removes records older than 30 days in batches of 100.
 */
export const cleanupDeliveryLogs = internalMutation({
  args: cleanupDeliveryLogsArgs,
  handler: async (ctx) => {
    const cutoff = Date.now() - DELIVERY_LOG_RETENTION_MS;

    // Query old delivery records
    const oldRecords = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_delivered")
      .filter((q) => q.lt(q.field("deliveredAt"), cutoff))
      .take(DELIVERY_LOG_CLEANUP_BATCH_SIZE);

    let deletedCount = 0;
    for (const record of oldRecords) {
      await ctx.db.delete("webhookDeliveries", record._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// ─── verifyWebhookTestPermission ──────────────────────────────────────────

/**
 * Internal mutation to verify that the current user has permission to test
 * a webhook. Called by the public testWebhook action since actions cannot
 * access ctx.auth or ctx.db directly.
 *
 * Checks:
 *   1. User is authenticated
 *   2. User has api.create_webhook capability
 *   3. Webhook exists and is active
 *
 * @returns Authorization result with webhook metadata or error details
 */
export const verifyWebhookTestPermission = internalMutation({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, args) => {
    // 1. Check authentication and capability
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        authorized: false,
        error: "Authentication required",
        errorCode: "UNAUTHORIZED" as const,
      };
    }

    // Look up user by identifier
    const user = await lookupUserByIdentifier(ctx, identity.subject);

    if (!user || user.status !== "active") {
      return {
        authorized: false,
        error: "User not found or inactive",
        errorCode: "FORBIDDEN" as const,
      };
    }

    // Check capability via role
    let capabilities: string[] = [];
    if (user.roleId) {
      const role = await ctx.db.get("roles", user.roleId);
      if (role && role.status === "active") {
        capabilities = role.capabilities;
      }
    }

    if (!capabilities.includes("api.create_webhook")) {
      console.warn(
        `Webhook test access denied: user=${user._id} capability=api.create_webhook`,
      );
      return {
        authorized: false,
        error: "Insufficient permissions",
        errorCode: "FORBIDDEN" as const,
      };
    }

    // 2. Verify webhook exists
    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) {
      return {
        authorized: false,
        error: "Webhook not found",
        errorCode: "NOT_FOUND" as const,
      };
    }

    if (webhook.status !== "active") {
      return {
        authorized: false,
        error: `Cannot test a webhook with status "${webhook.status}". Only active webhooks can be tested.`,
        errorCode: "INVALID_STATE" as const,
      };
    }

    return {
      authorized: true,
      webhookName: webhook.name,
    };
  },
});
