/**
 * API System - Public Mutations
 *
 * Five mutations for managing API keys and webhooks:
 *
 *   - createKey: Generate a new API key with scoped permissions and rate limits.
 *     Returns the plaintext key exactly once (never retrievable again).
 *
 *   - revokeKey: Permanently revoke an active API key with an optional reason.
 *
 *   - createWebhook: Register a new outbound webhook endpoint. Generates a
 *     signing secret (shown once), registers an event listener in the
 *     Event Dispatcher, and returns the plaintext secret.
 *
 *   - updateWebhook: Update webhook configuration (URL, event code, status,
 *     content type, failure threshold, timeout). Optionally regenerate secret.
 *
 *   - deleteWebhook: Delete a webhook and deactivate its event listener.
 *     Delivery logs are preserved for audit; cleaned by retention cron.
 *
 * All mutations require Administrator-level access via capability checks.
 *
 * Usage:
 *   const result = await createKey({ name: "Mobile App", scopes: ["read:posts"] });
 *   // result.key is the plaintext key (SHOWN ONLY ONCE)
 */

import { mutation } from "../_generated/server";
import { ConvexError } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";
import { API_EVENTS, SYSTEM } from "../events/constants";
import {
  createKeyArgs,
  revokeKeyArgs,
  createWebhookArgs,
  updateWebhookArgs,
  deleteWebhookArgs,
  validateWebhookUrl,
  validateEventCode,
  isValidApiKeyScope,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_RATE_LIMIT_PER_HOUR,
  MIN_RATE_LIMIT_PER_MINUTE,
  MAX_RATE_LIMIT_PER_MINUTE,
  MIN_RATE_LIMIT_PER_HOUR,
  MAX_RATE_LIMIT_PER_HOUR,
  DEFAULT_MAX_CONSECUTIVE_FAILURES,
  DEFAULT_DELIVERY_TIMEOUT,
  MIN_DELIVERY_TIMEOUT,
  MAX_DELIVERY_TIMEOUT,
  MIN_MAX_CONSECUTIVE_FAILURES,
  MAX_MAX_CONSECUTIVE_FAILURES,
  API_KEY_PREFIX,
  WEBHOOK_SECRET_PREFIX,
  MAX_NAME_LENGTH,
  MAX_REVOKE_REASON_LENGTH,
} from "./validators";
import {
  generateRandomHex,
  sha256Hash,
  encryptSecret,
} from "./crypto_helpers";

// ─── createKey ──────────────────────────────────────────────────────────────

/**
 * Create a new API key with scoped permissions and rate limits.
 *
 * Flow:
 *   1. Authenticate user
 *   2. Check capability: api.create_key (Administrator only)
 *   3. Validate name, scopes, rate limits
 *   4. Generate cryptographically secure API key (shk_ + 44 hex chars)
 *   5. Compute SHA-256 hash for storage (never store plaintext)
 *   6. Insert apiKeys record
 *   7. Emit api.key_created event
 *   8. Return plaintext key exactly once
 *
 * @returns Object containing the plaintext key (SHOWN ONLY ONCE)
 */
export const createKey = mutation({
  args: createKeyArgs,
  handler: async (ctx, args) => {
    // 1. Check authorization
    const user = await requireCan(ctx, "api.create_key");

    // 2. Validate name
    const name = args.name.trim();
    if (name.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "API key name is required",
      });
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `API key name must be under ${MAX_NAME_LENGTH} characters`,
      });
    }

    // 3. Validate scopes
    if (args.scopes.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "At least one scope is required",
      });
    }
    for (const scope of args.scopes) {
      if (!isValidApiKeyScope(scope)) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Invalid API key scope: "${scope}"`,
        });
      }
    }

    // 4. Validate rate limits
    const rateLimitPerMinute =
      args.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
    const rateLimitPerHour =
      args.rateLimitPerHour ?? DEFAULT_RATE_LIMIT_PER_HOUR;

    if (
      rateLimitPerMinute < MIN_RATE_LIMIT_PER_MINUTE ||
      rateLimitPerMinute > MAX_RATE_LIMIT_PER_MINUTE
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Rate limit per minute must be between ${MIN_RATE_LIMIT_PER_MINUTE} and ${MAX_RATE_LIMIT_PER_MINUTE}`,
      });
    }
    if (
      rateLimitPerHour < MIN_RATE_LIMIT_PER_HOUR ||
      rateLimitPerHour > MAX_RATE_LIMIT_PER_HOUR
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Rate limit per hour must be between ${MIN_RATE_LIMIT_PER_HOUR} and ${MAX_RATE_LIMIT_PER_HOUR}`,
      });
    }

    // 5. Generate API key: shk_ + 44 hex chars (22 random bytes)
    const randomPart = generateRandomHex(22);
    const plaintextKey = `${API_KEY_PREFIX}${randomPart}`;
    const keyPrefix = plaintextKey.substring(0, 8);

    // 6. Hash the key for storage
    const keyHash = await sha256Hash(plaintextKey);

    // 7. Get user identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Not authenticated",
      });
    }
    const userId = identity.subject;

    // 8. Insert the API key record
    const now = Date.now();
    const keyId = await ctx.db.insert("apiKeys", {
      name,
      keyPrefix,
      keyHash,
      userId,
      scopes: args.scopes,
      status: "active",
      rateLimitPerMinute,
      rateLimitPerHour,
      requestCount: 0,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    // 9. Emit event
    await emitEvent(ctx, API_EVENTS.KEY_CREATED, SYSTEM.API, {
      keyId: keyId.toString(),
      keyPrefix,
      name,
      scopes: args.scopes,
      createdBy: userId,
    });

    // 10. Return plaintext key (SHOWN ONLY ONCE)
    return {
      keyId,
      key: plaintextKey,
      keyPrefix,
      name,
      scopes: args.scopes,
      createdAt: now,
    };
  },
});

// ─── revokeKey ──────────────────────────────────────────────────────────────

/**
 * Permanently revoke an active API key.
 *
 * Flow:
 *   1. Authenticate + check api.revoke_key capability
 *   2. Fetch the API key record
 *   3. Validate key exists and is currently active
 *   4. Update status to "revoked" with revocation metadata
 *   5. Emit api.key_revoked event
 *
 * @returns Success confirmation
 */
export const revokeKey = mutation({
  args: revokeKeyArgs,
  handler: async (ctx, args) => {
    // 1. Check authorization
    await requireCan(ctx, "api.revoke_key");

    // 2. Fetch the key
    const key = await ctx.db.get("apiKeys", args.keyId);
    if (!key) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "API key not found",
      });
    }

    // 3. Validate current status
    if (key.status !== "active") {
      throw new ConvexError({
        code: "CONFLICT",
        message: `Cannot revoke a key with status "${key.status}". Only active keys can be revoked.`,
      });
    }

    // 4. Validate reason length if provided
    if (args.reason && args.reason.length > MAX_REVOKE_REASON_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Revocation reason must be under ${MAX_REVOKE_REASON_LENGTH} characters`,
      });
    }

    // 5. Get revoker identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Not authenticated",
      });
    }
    const revokedBy = identity.subject;

    // 6. Update the key
    const now = Date.now();
    await ctx.db.patch("apiKeys", args.keyId, {
      status: "revoked",
      revokedAt: now,
      revokedBy,
      revokeReason: args.reason,
      updatedAt: now,
    });

    // 7. Emit event
    await emitEvent(ctx, "api.key_revoked", SYSTEM.API, {
      keyId: args.keyId.toString(),
      keyPrefix: key.keyPrefix,
      name: key.name,
      revokedBy,
      reason: args.reason,
    });

    return { success: true };
  },
});

// ─── createWebhook ──────────────────────────────────────────────────────────

/**
 * Register a new outbound webhook endpoint.
 *
 * Flow:
 *   1. Authenticate + check api.create_webhook capability
 *   2. Validate name, delivery URL (SSRF protection), event code
 *   3. Generate signing secret (whsec_ + 48 hex chars)
 *   4. Encrypt secret with AES-256-GCM
 *   5. Register event listener in Event Dispatcher
 *   6. Insert webhook record
 *   7. Return webhook ID and plaintext secret (shown only once)
 */
export const createWebhook = mutation({
  args: createWebhookArgs,
  handler: async (ctx, args) => {
    // 1. Check authorization
    const user = await requireCan(ctx, "api.create_webhook");

    // 2. Validate name
    const name = args.name.trim();
    if (name.length === 0) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Webhook name is required",
      });
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Webhook name must be under ${MAX_NAME_LENGTH} characters`,
      });
    }

    // 3. Validate delivery URL
    const urlError = validateWebhookUrl(args.deliveryUrl);
    if (urlError) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: urlError,
      });
    }

    // 4. Validate event code
    const eventCodeError = validateEventCode(args.eventCode);
    if (eventCodeError) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: eventCodeError,
      });
    }

    // 5. Validate optional configuration
    const maxConsecutiveFailures =
      args.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    if (
      maxConsecutiveFailures < MIN_MAX_CONSECUTIVE_FAILURES ||
      maxConsecutiveFailures > MAX_MAX_CONSECUTIVE_FAILURES
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Max consecutive failures must be between ${MIN_MAX_CONSECUTIVE_FAILURES} and ${MAX_MAX_CONSECUTIVE_FAILURES}`,
      });
    }

    const deliveryTimeout = args.deliveryTimeout ?? DEFAULT_DELIVERY_TIMEOUT;
    if (
      deliveryTimeout < MIN_DELIVERY_TIMEOUT ||
      deliveryTimeout > MAX_DELIVERY_TIMEOUT
    ) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: `Delivery timeout must be between ${MIN_DELIVERY_TIMEOUT}ms and ${MAX_DELIVERY_TIMEOUT}ms`,
      });
    }

    // 6. Generate webhook signing secret: whsec_ + 48 hex chars (24 random bytes)
    const secretRandom = generateRandomHex(24);
    const plaintextSecret = `${WEBHOOK_SECRET_PREFIX}${secretRandom}`;

    // 7. Encrypt the secret for storage
    // Read the encryption key from environment
    const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is required. Generate one with: openssl rand -hex 32",
      });
    }
    const encryptedSecret = await encryptSecret(plaintextSecret, encryptionKey);

    // 8. Get user identity
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHENTICATED",
        message: "Not authenticated",
      });
    }
    const userId = identity.subject;

    // 9. Register event listener in the Event Dispatcher
    const now = Date.now();
    const eventListenerId = await ctx.db.insert("eventListeners", {
      eventCode: args.eventCode,
      name: `Webhook: ${name}`,
      handlerModule: "api/internals",
      handlerFunction: "deliverWebhook",
      handlerType: "action",
      priority: 50,
      isActive: true,
      maxRetries: 3,
      retryDelayMs: 5000,
      retryBackoff: "exponential",
      system: "api",
      description: `Webhook delivery to ${args.deliveryUrl} for ${args.eventCode} events`,
      createdAt: now,
      updatedAt: now,
    });

    // 10. Insert webhook record
    const webhookId = await ctx.db.insert("webhooks", {
      name,
      deliveryUrl: args.deliveryUrl,
      secret: encryptedSecret,
      eventCode: args.eventCode,
      status: "active",
      contentType: args.contentType ?? "application/json",
      consecutiveFailures: 0,
      maxConsecutiveFailures,
      deliveryTimeout,
      userId,
      eventListenerId,
      createdAt: now,
      updatedAt: now,
    });

    // 11. Return webhook ID and plaintext secret (SHOWN ONLY ONCE)
    return {
      webhookId,
      secret: plaintextSecret,
      name,
      deliveryUrl: args.deliveryUrl,
      eventCode: args.eventCode,
      status: "active" as const,
    };
  },
});

// ─── updateWebhook ──────────────────────────────────────────────────────────

/**
 * Update webhook configuration.
 *
 * Flow:
 *   1. Authenticate + check api.update_webhook capability
 *   2. Fetch webhook record
 *   3. Validate updated fields
 *   4. If eventCode changed: update linked event listener
 *   5. If status changed: update linked event listener active state
 *   6. If regenerateSecret: generate new secret, encrypt, include in response
 *   7. Patch webhook record
 *
 * @returns Updated webhook metadata (includes new secret if regenerated)
 */
export const updateWebhook = mutation({
  args: updateWebhookArgs,
  handler: async (ctx, args) => {
    // 1. Check authorization
    await requireCan(ctx, "api.update_webhook");

    // 2. Fetch the webhook
    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    let newPlaintextSecret: string | undefined;

    // 3. Validate and apply name
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Webhook name is required",
        });
      }
      if (name.length > MAX_NAME_LENGTH) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Webhook name must be under ${MAX_NAME_LENGTH} characters`,
        });
      }
      patch.name = name;
    }

    // 4. Validate and apply delivery URL
    if (args.deliveryUrl !== undefined) {
      const urlError = validateWebhookUrl(args.deliveryUrl);
      if (urlError) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: urlError,
        });
      }
      patch.deliveryUrl = args.deliveryUrl;
    }

    // 5. Validate and apply event code
    if (args.eventCode !== undefined) {
      const eventCodeError = validateEventCode(args.eventCode);
      if (eventCodeError) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: eventCodeError,
        });
      }
      patch.eventCode = args.eventCode;

      // Update linked event listener's event code
      if (webhook.eventListenerId) {
        await ctx.db.patch("eventListeners", webhook.eventListenerId, {
          eventCode: args.eventCode,
          updatedAt: now,
        });
      }
    }

    // 6. Apply content type
    if (args.contentType !== undefined) {
      patch.contentType = args.contentType;
    }

    // 7. Validate and apply max consecutive failures
    if (args.maxConsecutiveFailures !== undefined) {
      if (
        args.maxConsecutiveFailures < MIN_MAX_CONSECUTIVE_FAILURES ||
        args.maxConsecutiveFailures > MAX_MAX_CONSECUTIVE_FAILURES
      ) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Max consecutive failures must be between ${MIN_MAX_CONSECUTIVE_FAILURES} and ${MAX_MAX_CONSECUTIVE_FAILURES}`,
        });
      }
      patch.maxConsecutiveFailures = args.maxConsecutiveFailures;
    }

    // 8. Validate and apply delivery timeout
    if (args.deliveryTimeout !== undefined) {
      if (
        args.deliveryTimeout < MIN_DELIVERY_TIMEOUT ||
        args.deliveryTimeout > MAX_DELIVERY_TIMEOUT
      ) {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: `Delivery timeout must be between ${MIN_DELIVERY_TIMEOUT}ms and ${MAX_DELIVERY_TIMEOUT}ms`,
        });
      }
      patch.deliveryTimeout = args.deliveryTimeout;
    }

    // 9. Handle status change
    if (args.status !== undefined) {
      patch.status = args.status;

      if (webhook.eventListenerId) {
        if (args.status === "paused") {
          // Deactivate the event listener
          await ctx.db.patch("eventListeners", webhook.eventListenerId, {
            isActive: false,
            updatedAt: now,
          });
        } else if (args.status === "active") {
          // Reactivate the event listener, reset failure counters
          await ctx.db.patch("eventListeners", webhook.eventListenerId, {
            isActive: true,
            updatedAt: now,
          });
          patch.consecutiveFailures = 0;
          patch.disabledAt = undefined;
        }
      }
    }

    // 10. Handle secret regeneration
    if (args.regenerateSecret) {
      const secretRandom = generateRandomHex(24);
      newPlaintextSecret = `${WEBHOOK_SECRET_PREFIX}${secretRandom}`;

      const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new ConvexError({
          code: "CONFIGURATION_ERROR",
          message:
            "WEBHOOK_SECRET_ENCRYPTION_KEY environment variable is required. Generate one with: openssl rand -hex 32",
        });
      }
      patch.secret = await encryptSecret(newPlaintextSecret, encryptionKey);
    }

    // 11. Apply the patch
    await ctx.db.patch("webhooks", args.webhookId, patch);

    // 12. Build response (exclude encrypted secret unless regenerated)
    const updatedWebhook = await ctx.db.get("webhooks", args.webhookId);
    if (!updatedWebhook) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Webhook not found after update",
      });
    }

    const { secret: _secret, ...response } = updatedWebhook;

    return {
      ...response,
      // Only include plaintext secret if it was regenerated
      ...(newPlaintextSecret ? { secret: newPlaintextSecret } : {}),
    };
  },
});

// ─── deleteWebhook ──────────────────────────────────────────────────────────

/**
 * Delete a webhook and deactivate its event listener.
 * Delivery logs are preserved for audit; cleaned by retention cron.
 *
 * Flow:
 *   1. Authenticate + check api.delete_webhook capability
 *   2. Fetch webhook record
 *   3. Deactivate linked event listener
 *   4. Delete webhook record
 *
 * @returns Success confirmation
 */
export const deleteWebhook = mutation({
  args: deleteWebhookArgs,
  handler: async (ctx, args) => {
    // 1. Check authorization
    await requireCan(ctx, "api.delete_webhook");

    // 2. Fetch the webhook
    const webhook = await ctx.db.get("webhooks", args.webhookId);
    if (!webhook) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    // 3. Deactivate linked event listener (don't delete - preserve for audit trail)
    if (webhook.eventListenerId) {
      const listener = await ctx.db.get("eventListeners", webhook.eventListenerId);
      if (listener) {
        await ctx.db.patch("eventListeners", webhook.eventListenerId, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
    }

    // 4. Delete webhook record
    await ctx.db.delete("webhooks", args.webhookId);

    return { success: true };
  },
});
