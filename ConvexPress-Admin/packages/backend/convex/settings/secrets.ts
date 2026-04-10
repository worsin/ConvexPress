/**
 * Settings System - Service Secret Management
 *
 * Encrypted storage for service API keys (AI, search, email, etc.).
 * Uses AES-256-GCM encryption via the shared crypto_helpers module.
 *
 * Three functions:
 *
 *   saveServiceSecret (mutation)
 *     Encrypts and stores a secret for a dotted service key.
 *     Client-callable -- requires manage_options capability.
 *
 *   hasServiceSecret (query)
 *     Returns boolean whether a secret exists for a service key.
 *     No decryption -- safe for client queries.
 *
 *   getServiceSecret (internalQuery)
 *     Decrypts and returns the secret value.
 *     Internal only -- NOT client-callable.
 *
 * Encryption key: SERVICE_ENCRYPTION_KEY environment variable (32-byte hex).
 * Falls back to SHIPPING_PROVIDER_ENCRYPTION_KEY for shared deployments.
 *
 * Service key conventions:
 *   "ai.provider"          - AI provider API key (OpenRouter or Anthropic)
 *   "ai.tavily"            - Tavily research API key
 *   "search.meilisearch"   - Meilisearch admin API key
 *   "email.resend"         - Resend transactional email API key
 *   "kb.search.meilisearch" - KB Meilisearch API key
 *   "kb.search.rag"        - KB RAG API key
 *   "support.ai"           - Support AI API key
 *   "support.meilisearch"  - Support Meilisearch API key
 */

import { mutation, query, internalQuery } from "../_generated/server";
import { v, ConvexError } from "convex/values";
import { requireCan, getCurrentUser } from "../helpers/permissions";
import { encryptSecret, decryptSecret } from "../api/crypto_helpers";

// ─── Encryption Key ─────────────────────────────────────────────────────────

/**
 * Resolve the encryption key from environment variables.
 * Tries SERVICE_ENCRYPTION_KEY first, falls back to SHIPPING_PROVIDER_ENCRYPTION_KEY.
 */
function getEncryptionKey(): string {
  const key =
    process.env.SERVICE_ENCRYPTION_KEY ??
    process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;
  if (!key) {
    throw new ConvexError({
      code: "CONFIG_ERROR",
      message:
        "SERVICE_ENCRYPTION_KEY (or SHIPPING_PROVIDER_ENCRYPTION_KEY) is not configured.",
    });
  }
  return key;
}

// ─── saveServiceSecret ──────────────────────────────────────────────────────

/**
 * Encrypt and store a secret for a given service key.
 *
 * If a secret already exists for this service, it is updated and the
 * version is incremented. Otherwise a new record is inserted at version 1.
 *
 * Requires manage_options capability (Administrator only).
 */
export const saveServiceSecret = mutation({
  args: {
    service: v.string(),
    secret: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "manage_options");

    const encryptionKey = getEncryptionKey();
    const encryptedPayload = await encryptSecret(args.secret, encryptionKey);
    const now = Date.now();

    const existing = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedPayload,
        version: existing.version + 1,
        updatedAt: now,
        updatedBy: user._id,
      });
      return existing._id;
    }

    return ctx.db.insert("service_secrets", {
      service: args.service,
      encryptedPayload,
      version: 1,
      updatedAt: now,
      updatedBy: user._id,
    });
  },
});

// ─── deleteServiceSecret ────────────────────────────────────────────────────

/**
 * Delete a stored service secret (e.g. when clearing an API key).
 * Requires manage_options capability (Administrator only).
 */
export const deleteServiceSecret = mutation({
  args: {
    service: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCan(ctx, "manage_options");

    const existing = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

// ─── hasServiceSecret ───────────────────────────────────────────────────────

/**
 * Check whether a secret exists for a given service key.
 *
 * Returns `true` if a secret is stored, `false` otherwise.
 * Does NOT decrypt the secret -- safe for client-side use.
 *
 * Requires authentication (any authenticated user).
 */
export const hasServiceSecret = query({
  args: {
    service: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return false;

    const doc = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .unique();

    return doc !== null;
  },
});

// ─── getServiceSecret ───────────────────────────────────────────────────────

/**
 * Decrypt and return the secret value for a given service key.
 *
 * INTERNAL ONLY -- not client-callable.
 * Used by backend systems (AI, search, email) to read their API keys.
 *
 * Returns null if no secret exists for the given service.
 */
export const getServiceSecret = internalQuery({
  args: {
    service: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("service_secrets")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .unique();

    if (!doc) return null;

    const encryptionKey = getEncryptionKey();
    return await decryptSecret(doc.encryptedPayload, encryptionKey);
  },
});
