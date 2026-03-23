/**
 * API System - Convex Validators
 *
 * Shared argument validators for API key and webhook mutations/queries.
 * These enforce type safety at the Convex argument level and are imported
 * by mutations.ts, queries.ts, and internals.ts.
 *
 * Key types:
 *   - apiKeyScope: The 14 granular permission scopes for API keys
 *   - apiKeyStatus: active | revoked | expired
 *   - webhookStatus: active | paused | disabled
 *   - webhookContentType: application/json | application/x-www-form-urlencoded
 */

import { v } from "convex/values";

// ─── API Key Validators ───────────────────────────────────────────────────

/**
 * Validator for a single API key scope.
 * 14 granular permissions grouped by resource.
 */
export const apiKeyScope = v.union(
  // Posts & Pages
  v.literal("read:posts"),
  v.literal("write:posts"),
  // Comments
  v.literal("read:comments"),
  v.literal("write:comments"),
  // Media
  v.literal("read:media"),
  v.literal("write:media"),
  // Users
  v.literal("read:users"),
  v.literal("write:users"),
  // Taxonomies
  v.literal("read:taxonomies"),
  v.literal("write:taxonomies"),
  // Settings
  v.literal("read:settings"),
  v.literal("write:settings"),
  // Menus
  v.literal("read:menus"),
  v.literal("write:menus"),
);

/**
 * Validator for API key status.
 */
export const apiKeyStatus = v.union(
  v.literal("active"),
  v.literal("revoked"),
  v.literal("expired"),
);

/**
 * All valid scope string values for runtime validation.
 */
export const ALL_API_KEY_SCOPES = [
  "read:posts",
  "write:posts",
  "read:comments",
  "write:comments",
  "read:media",
  "write:media",
  "read:users",
  "write:users",
  "read:taxonomies",
  "write:taxonomies",
  "read:settings",
  "write:settings",
  "read:menus",
  "write:menus",
] as const;

export type ApiKeyScope = (typeof ALL_API_KEY_SCOPES)[number];

/** Set for O(1) scope validation. */
export const API_KEY_SCOPE_SET: Set<string> = new Set(ALL_API_KEY_SCOPES);

/**
 * Validate that a string is a recognized API key scope.
 */
export function isValidApiKeyScope(scope: string): scope is ApiKeyScope {
  return API_KEY_SCOPE_SET.has(scope);
}

// ─── Webhook Validators ─────────────────────────────────────────────────

/**
 * Validator for webhook status.
 */
export const webhookStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled"),
);

/**
 * Validator for webhook content type.
 */
export const webhookContentType = v.union(
  v.literal("application/json"),
  v.literal("application/x-www-form-urlencoded"),
);

// ─── Argument Validators ────────────────────────────────────────────────

/**
 * Args for the createKey mutation.
 */
export const createKeyArgs = {
  name: v.string(),
  scopes: v.array(apiKeyScope),
  rateLimitPerMinute: v.optional(v.number()),
  rateLimitPerHour: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
};

/**
 * Args for the revokeKey mutation.
 */
export const revokeKeyArgs = {
  keyId: v.id("apiKeys"),
  reason: v.optional(v.string()),
};

/**
 * Args for the createWebhook mutation.
 */
export const createWebhookArgs = {
  name: v.string(),
  deliveryUrl: v.string(),
  eventCode: v.string(),
  contentType: v.optional(webhookContentType),
  maxConsecutiveFailures: v.optional(v.number()),
  deliveryTimeout: v.optional(v.number()),
};

/**
 * Args for the updateWebhook mutation.
 */
export const updateWebhookArgs = {
  webhookId: v.id("webhooks"),
  name: v.optional(v.string()),
  deliveryUrl: v.optional(v.string()),
  eventCode: v.optional(v.string()),
  status: v.optional(
    v.union(v.literal("active"), v.literal("paused")),
  ),
  contentType: v.optional(webhookContentType),
  maxConsecutiveFailures: v.optional(v.number()),
  deliveryTimeout: v.optional(v.number()),
  regenerateSecret: v.optional(v.boolean()),
};

/**
 * Args for the deleteWebhook mutation.
 */
export const deleteWebhookArgs = {
  webhookId: v.id("webhooks"),
};

/**
 * Args for the testWebhook action.
 */
export const testWebhookArgs = {
  webhookId: v.id("webhooks"),
};

/**
 * Args for API key list query.
 */
export const listKeysArgs = {
  status: v.optional(apiKeyStatus),
};

/**
 * Args for single API key query.
 */
export const getKeyArgs = {
  keyId: v.id("apiKeys"),
};

/**
 * Args for webhook list query.
 */
export const listWebhooksArgs = {
  status: v.optional(webhookStatus),
};

/**
 * Args for single webhook query.
 */
export const getWebhookArgs = {
  webhookId: v.id("webhooks"),
};

/**
 * Args for webhook deliveries list query.
 */
export const listDeliveriesArgs = {
  webhookId: v.id("webhooks"),
  limit: v.optional(v.number()),
};

/**
 * Args for internal authenticateRequest function.
 */
export const authenticateRequestArgs = {
  authorizationHeader: v.string(),
  requiredScope: v.string(),
  clientIp: v.optional(v.string()),
};

/**
 * Args for internal deliverWebhook action.
 */
export const deliverWebhookArgs = {
  webhookId: v.id("webhooks"),
  eventId: v.optional(v.id("events")),
  eventCode: v.string(),
  payload: v.string(),
  attempt: v.optional(v.number()),
  isTest: v.optional(v.boolean()),
};

/**
 * Args for internal cleanupExpiredKeys function.
 */
export const cleanupExpiredKeysArgs = {};

/**
 * Args for internal cleanupDeliveryLogs function.
 */
export const cleanupDeliveryLogsArgs = {};

// ─── Validation Helpers ─────────────────────────────────────────────────

/**
 * Validate a webhook delivery URL.
 * Must be HTTPS, under 2000 chars, and not pointing to private/internal IPs.
 *
 * @returns null if valid, or an error message string if invalid
 */
export function validateWebhookUrl(url: string): string | null {
  // Max length
  if (url.length > 2000) {
    return "Delivery URL must be under 2000 characters";
  }

  // Must be HTTPS
  if (!url.startsWith("https://")) {
    return "Delivery URL must use HTTPS";
  }

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return "Invalid URL format";
  }

  // SSRF protection: reject private/internal hostnames and IPs
  const hostname = parsedUrl.hostname.toLowerCase();

  // Reject localhost variants
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    return "Delivery URL must not point to localhost";
  }

  // Reject .local mDNS domains
  if (hostname.endsWith(".local")) {
    return "Delivery URL must not point to local network addresses";
  }

  // Reject cloud metadata endpoints
  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata.google.com"
  ) {
    return "Delivery URL must not point to cloud metadata endpoints";
  }

  // Reject private IPv4 ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    // 10.x.x.x
    if (a === 10) return "Delivery URL must not point to private IP addresses";
    // 172.16-31.x.x
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) {
      return "Delivery URL must not point to private IP addresses";
    }
    // 192.168.x.x
    if (a === 192 && b === 168) {
      return "Delivery URL must not point to private IP addresses";
    }
    // 169.254.x.x (link-local)
    if (a === 169 && b === 254) {
      return "Delivery URL must not point to link-local addresses";
    }
  }

  return null;
}

/**
 * Validate an event code or wildcard pattern for webhook subscriptions.
 *
 * Valid patterns:
 *   - "*" (global wildcard)
 *   - "system.*" (system wildcard, e.g., "post.*")
 *   - "system.action" (exact event code, e.g., "post.published")
 *
 * @returns null if valid, or an error message string if invalid
 */
export function validateEventCode(eventCode: string): string | null {
  if (!eventCode || eventCode.trim().length === 0) {
    return "Event code is required";
  }

  // Global wildcard
  if (eventCode === "*") return null;

  // System wildcard (e.g., "post.*")
  if (eventCode.endsWith(".*")) {
    const systemPart = eventCode.slice(0, -2);
    if (systemPart.length === 0 || systemPart.includes(".")) {
      return "Invalid wildcard pattern. Use 'system.*' format (e.g., 'post.*')";
    }
    return null;
  }

  // Exact event code (e.g., "post.published")
  const parts = eventCode.split(".");
  if (parts.length !== 2 || parts[0]!.length === 0 || parts[1]!.length === 0) {
    return "Event code must be in 'system.action' format (e.g., 'post.published')";
  }

  return null;
}

// ─── Rate Limit Constants ───────────────────────────────────────────────

/** Default rate limit: 60 requests per minute */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

/** Default rate limit: 1000 requests per hour */
export const DEFAULT_RATE_LIMIT_PER_HOUR = 1000;

/** Minimum rate limit per minute */
export const MIN_RATE_LIMIT_PER_MINUTE = 1;

/** Maximum rate limit per minute */
export const MAX_RATE_LIMIT_PER_MINUTE = 600;

/** Minimum rate limit per hour */
export const MIN_RATE_LIMIT_PER_HOUR = 1;

/** Maximum rate limit per hour */
export const MAX_RATE_LIMIT_PER_HOUR = 10000;

/** Default webhook max consecutive failures before auto-disable */
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;

/** Default webhook delivery timeout in ms */
export const DEFAULT_DELIVERY_TIMEOUT = 15000;

/** Min webhook delivery timeout in ms */
export const MIN_DELIVERY_TIMEOUT = 1000;

/** Max webhook delivery timeout in ms */
export const MAX_DELIVERY_TIMEOUT = 30000;

/** Min max consecutive failures */
export const MIN_MAX_CONSECUTIVE_FAILURES = 1;

/** Max max consecutive failures */
export const MAX_MAX_CONSECUTIVE_FAILURES = 20;

/** Delivery log retention: 30 days in ms */
export const DELIVERY_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Delivery log cleanup batch size */
export const DELIVERY_LOG_CLEANUP_BATCH_SIZE = 100;

/** Stale rate limit window age: 2 hours in ms */
export const STALE_RATE_LIMIT_WINDOW_MS = 2 * 60 * 60 * 1000;

/** API key prefix */
export const API_KEY_PREFIX = "shk_";

/** Webhook secret prefix */
export const WEBHOOK_SECRET_PREFIX = "whsec_";

/** API key total length (prefix + 44 hex chars = 48) */
export const API_KEY_LENGTH = 48;

/** API key regex for format validation */
export const API_KEY_REGEX = /^shk_[a-f0-9]{44}$/;

/** Max name length for API keys and webhooks */
export const MAX_NAME_LENGTH = 200;

/** Max revoke reason length */
export const MAX_REVOKE_REASON_LENGTH = 500;

/** Max response body size stored in delivery logs (10KB) */
export const MAX_RESPONSE_BODY_SIZE = 10 * 1024;
