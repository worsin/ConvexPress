/**
 * API System - TypeScript Types
 *
 * Types for API keys, webhooks, and delivery logs as returned by Convex queries.
 * These match the query return shapes (sensitive fields like keyHash and secret are excluded).
 */

// ─── API Key Types ──────────────────────────────────────────────────────────

export type ApiKeyStatus = "active" | "revoked" | "expired";

export type ApiKeyScope =
  | "read:posts"
  | "write:posts"
  | "read:comments"
  | "write:comments"
  | "read:media"
  | "write:media"
  | "read:users"
  | "write:users"
  | "read:taxonomies"
  | "write:taxonomies"
  | "read:settings"
  | "write:settings"
  | "read:menus"
  | "write:menus";

export interface ApiKey {
  _id: string;
  name: string;
  keyPrefix: string;
  // keyHash excluded (never sent to client)
  userId: string;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  lastUsedAt?: number;
  lastUsedIp?: string;
  requestCount: number;
  expiresAt?: number;
  revokedAt?: number;
  revokedBy?: string;
  revokeReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateKeyResult {
  keyId: string;
  key: string; // Plaintext key (SHOWN ONLY ONCE)
  keyPrefix: string;
  name: string;
  scopes: ApiKeyScope[];
  createdAt: number;
}

// ─── Webhook Types ──────────────────────────────────────────────────────────

export type WebhookStatus = "active" | "paused" | "disabled";

export interface Webhook {
  _id: string;
  name: string;
  deliveryUrl: string;
  // secret excluded (encrypted, never sent to client)
  eventCode: string;
  status: WebhookStatus;
  contentType: "application/json" | "application/x-www-form-urlencoded";
  consecutiveFailures: number;
  maxConsecutiveFailures: number;
  deliveryTimeout: number;
  userId: string;
  eventListenerId?: string;
  createdAt: number;
  updatedAt: number;
  lastDeliveryAt?: number;
  disabledAt?: number;
}

export interface CreateWebhookResult {
  webhookId: string;
  secret: string; // Plaintext signing secret (SHOWN ONLY ONCE)
  name: string;
  deliveryUrl: string;
  eventCode: string;
  status: "active";
}

// ─── Webhook Delivery Types ─────────────────────────────────────────────────

export interface WebhookDelivery {
  _id: string;
  webhookId: string;
  eventId?: string;
  requestUrl: string;
  requestHeaders: string; // JSON-serialized
  requestBody: string; // JSON-serialized
  responseCode?: number;
  responseHeaders?: string; // JSON-serialized
  responseBody?: string;
  success: boolean;
  error?: string;
  duration?: number;
  deliveredAt: number;
  isTest: boolean;
  attempt: number;
}
