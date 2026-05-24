# API System - Expert Knowledge Document

**System:** API System
**Status:** Complete (100%)
**Priority:** P2 - Medium
**Complexity:** Complex
**Layer:** Backend
**WordPress Equivalent:** WP REST API + Application Passwords + WooCommerce Webhooks
**Last Analyzed:** 2026-02-13

---

## Quick Reference

### What This System Does

The API System is the external integration layer of ConvexPress. It provides a REST-like API (via Convex HTTP actions at `/api/v1/`) for third-party applications, headless front-ends, mobile apps, and automation services to read and write CMS data programmatically. It also provides an outbound webhook system that pushes real-time event notifications to external endpoints. This combines three WordPress capabilities: the WP REST API (`/wp-json/wp/v2/`), Application Passwords (API key authentication), and WooCommerce-style Webhooks.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **API Key** | `shk_` prefixed Bearer token (48 chars), scoped, rate-limited, tied to a Convex Auth user |
| **API Key Scope** | Granular permission: `read:posts`, `write:media`, `read:settings`, etc. (14 total) |
| **API Key Status** | `active`, `revoked`, `expired` |
| **Webhook** | Outbound HTTP POST to an external HTTPS endpoint when a CMS event fires |
| **Webhook Secret** | `whsec_` prefixed HMAC signing secret, AES-256-GCM encrypted at rest |
| **Webhook Delivery** | A single POST attempt to a webhook endpoint, with full request/response logging |
| **Webhook Status** | `active`, `paused`, `disabled` (auto-disabled after consecutive failures) |
| **Rate Limiting** | Per-key sliding window counters (per-minute + per-hour) |
| **HMAC-SHA256 Signature** | `X-ConvexPress-Signature` header on every webhook delivery for verification |
| **SSRF Protection** | Webhook URLs validated to reject private/internal IPs and cloud metadata endpoints |

### ConvexPress vs WordPress

| Aspect | WordPress | ConvexPress |
|--------|-----------|-------------|
| **API Protocol** | REST with HATEOAS (`/wp-json/wp/v2/`) | REST-like HTTP actions (`/api/v1/`), no HATEOAS |
| **Authentication** | Basic Auth, OAuth, cookie+nonce, Application Passwords | Bearer token only (API keys) |
| **API Key Format** | 24-char base64 chunked with spaces | `shk_` + 44 hex chars = 48 total |
| **Key Scoping** | Inherits full user capabilities (no per-key scopes) | Explicit scope array per key (principle of least privilege) |
| **Key Storage** | User meta (`_application_passwords`) | Dedicated `apiKeys` table with SHA-256 hash |
| **Rate Limiting** | Not built-in (plugins: Wordfence) | Built-in per-key sliding window (minute + hour) |
| **Webhooks** | Not in core (WooCommerce, plugins) | First-class `webhooks` table with delivery log |
| **Webhook Signing** | WooCommerce HMAC-SHA256 | HMAC-SHA256 (same pattern, `X-ConvexPress-Signature`) |
| **Webhook Retries** | WooCommerce: up to 5 | 3 retries via Event Dispatcher (exponential backoff) |
| **API Versioning** | Namespace-based (`wp/v2`) | Path-based (`/api/v1/`) |
| **CORS** | `rest_pre_serve_request` filter | Built-in CORS headers on all `/api/` routes |
| **Pagination** | `X-WP-Total`, `X-WP-TotalPages` headers | `X-Total`, `X-Total-Pages` headers (same pattern) |

---

## Architecture Overview

### Data Flow

**API Request Flow (Inbound):**
1. External client sends HTTP request to `/api/v1/{resource}` with `Authorization: Bearer shk_...` header
2. Convex HTTP action handler invokes `internal.api.authenticateRequest`
3. Authentication: extract token -> SHA-256 hash -> lookup `apiKeys` by `by_keyHash` index
4. Authorization: check key status (active), expiration, required scope
5. Rate limiting: check/increment `apiRateLimitWindows` counters (minute + hour windows)
6. Execute the underlying query/mutation (e.g., `internal.posts.listForApi`)
7. Return JSON response with pagination headers and CORS headers

**Webhook Delivery Flow (Outbound):**
1. CMS action emits event via Event Dispatcher (e.g., `post.published`)
2. Event Dispatcher finds matching `eventListeners` (webhook listener registered at webhook creation)
3. Dispatcher invokes `internal.api.deliverWebhook` action
4. Action retrieves webhook config, decrypts signing secret (AES-256-GCM)
5. Constructs payload, computes HMAC-SHA256 signature
6. HTTP POST to `deliveryUrl` with ConvexPress headers
7. Logs delivery result to `webhookDeliveries` table
8. On failure: increments `consecutiveFailures`; if threshold reached, auto-disables webhook

### Real-Time Behavior

- **Admin API Keys page**: Uses `useQuery(api.apiKeys.list)` -- live updates when keys are created/revoked
- **Admin Webhooks page**: Uses `useQuery(api.webhooks.list)` -- live updates on status changes
- **Delivery log**: Uses `useQuery(api.webhookDeliveries.list)` -- real-time delivery log as webhooks fire
- **Rate limit counters**: Not reactive in UI (internal only); `requestCount` on API keys updates in real-time

### Authentication & Authorization

**Admin Management Operations:**
- Authenticated via auth identity (session-based, AuthKit pattern)
- Requires `manage_options` / `manage_api_keys` capability (Administrator role only)
- All management actions (create/revoke keys, CRUD webhooks) are admin-only

**External API Requests:**
- Authenticated via Bearer token in `Authorization` header
- Token format: `shk_[a-f0-9]{44}` (validated by regex before hash lookup)
- Token is SHA-256 hashed and looked up in `apiKeys.by_keyHash` index
- Authorization is scope-based: each endpoint declares a required scope; the key's `scopes` array is checked
- Rate limiting is enforced per-key via sliding window counters

---

## Database Schema

### `apiKeys` Table

```typescript
// API key status
const apiKeyStatus = v.union(
  v.literal("active"),        // Key is valid and can authenticate
  v.literal("revoked"),       // Key has been permanently revoked
  v.literal("expired"),       // Key passed its expiresAt date
);

// API key scope -- what operations this key can perform
const apiKeyScope = v.union(
  v.literal("read:posts"),          // Read posts and pages
  v.literal("write:posts"),         // Create/update/delete posts and pages
  v.literal("read:comments"),       // Read comments
  v.literal("write:comments"),      // Create/update/delete comments
  v.literal("read:media"),          // Read media library
  v.literal("write:media"),         // Upload/update/delete media
  v.literal("read:users"),          // Read user profiles
  v.literal("write:users"),         // Update user profiles
  v.literal("read:taxonomies"),     // Read categories and tags
  v.literal("write:taxonomies"),    // Create/update/delete categories and tags
  v.literal("read:settings"),       // Read site settings
  v.literal("write:settings"),      // Update site settings
  v.literal("read:menus"),          // Read navigation menus
  v.literal("write:menus"),         // Create/update/delete menus
);

apiKeys: defineTable({
  // --- Identity ---
  name: v.string(),                              // Human-readable key name (e.g., "Mobile App", "CI/CD Pipeline")
  keyPrefix: v.string(),                         // First 8 chars of the key for identification (e.g., "shk_a1b2")
  keyHash: v.string(),                           // SHA-256 hash of the full API key (never store plaintext)

  // --- Ownership ---
  userId: v.string(),                            // user identifier of the admin who created this key

  // --- Authorization ---
  scopes: v.array(apiKeyScope),                  // Array of permitted scopes

  // --- Status ---
  status: apiKeyStatus,                          // Current key status

  // --- Rate Limiting ---
  rateLimitPerMinute: v.number(),                // Max requests per minute (default: 60)
  rateLimitPerHour: v.number(),                  // Max requests per hour (default: 1000)

  // --- Usage Tracking ---
  lastUsedAt: v.optional(v.number()),            // Timestamp of last successful authentication
  lastUsedIp: v.optional(v.string()),            // IP address of last use
  requestCount: v.number(),                      // Total lifetime request count

  // --- Expiration ---
  expiresAt: v.optional(v.number()),             // Optional expiration timestamp (null = never expires)

  // --- Revocation ---
  revokedAt: v.optional(v.number()),             // When the key was revoked
  revokedBy: v.optional(v.string()),             // user identifier of who revoked it
  revokeReason: v.optional(v.string()),          // Optional reason for revocation

  // --- Timestamps ---
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_keyHash", ["keyHash"])                           // Fast lookup during authentication
  .index("by_keyPrefix", ["keyPrefix"])                       // Identify key from prefix
  .index("by_userId", ["userId", "status"])                   // List keys for a user
  .index("by_status", ["status"])                             // Active/revoked/expired filter
  .index("by_expires", ["expiresAt"]),                        // Find expired keys for cleanup
```

**Field Specifications:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `name` | `string` | Yes | -- | Max 200 chars. Non-empty. |
| `keyPrefix` | `string` | Yes | Auto-generated | Exactly 8 chars (e.g., `shk_a1b2`). Immutable. |
| `keyHash` | `string` | Yes | Auto-generated | SHA-256 hex digest. 64 chars. Immutable. |
| `userId` | `string` | Yes | Current user | Valid user identifier. |
| `scopes` | `array` | Yes | -- | Non-empty array of valid scope literals. |
| `status` | `enum` | Yes | `"active"` | One of: active, revoked, expired. |
| `rateLimitPerMinute` | `number` | Yes | `60` | Positive integer. Min 1, max 600. |
| `rateLimitPerHour` | `number` | Yes | `1000` | Positive integer. Min 1, max 10000. |
| `lastUsedAt` | `number` | No | `undefined` | Unix timestamp (ms). Updated on each authenticated request. |
| `lastUsedIp` | `string` | No | `undefined` | IPv4 or IPv6 string. |
| `requestCount` | `number` | Yes | `0` | Non-negative integer. Incremented on each request. |
| `expiresAt` | `number` | No | `undefined` | Unix timestamp (ms). Null means never expires. |
| `revokedAt` | `number` | No | `undefined` | Set when key is revoked. Immutable after set. |
| `revokedBy` | `string` | No | `undefined` | user identifier. Set on revocation. |
| `revokeReason` | `string` | No | `undefined` | Max 500 chars. |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable after creation. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on any change. |

### `webhooks` Table

```typescript
// Webhook status
const webhookStatus = v.union(
  v.literal("active"),        // Webhook is active and will receive deliveries
  v.literal("paused"),        // Temporarily paused by user
  v.literal("disabled"),      // Auto-disabled after too many failures
);

webhooks: defineTable({
  // --- Identity ---
  name: v.string(),                              // Human-readable name (e.g., "Slack New Post Alert")

  // --- Delivery ---
  deliveryUrl: v.string(),                       // HTTPS endpoint URL to POST to
  secret: v.string(),                            // AES-256-GCM encrypted signing secret (NOT a hash)

  // --- Subscription ---
  eventCode: v.string(),                         // Event code to subscribe to (e.g., "post.published")
                                                 // Supports wildcards: "post.*", "*"

  // --- Configuration ---
  status: webhookStatus,                         // Current status
  contentType: v.union(
    v.literal("application/json"),               // JSON payload (default)
    v.literal("application/x-www-form-urlencoded"), // Form-encoded payload
  ),

  // --- Failure Tracking ---
  consecutiveFailures: v.number(),               // Current streak of consecutive failures
  maxConsecutiveFailures: v.number(),             // Auto-disable threshold (default: 5)

  // --- Rate Limiting ---
  deliveryTimeout: v.number(),                   // HTTP request timeout in ms (default: 15000)

  // --- Ownership ---
  userId: v.string(),                            // user identifier of the admin who created this webhook

  // --- Event Listener Link ---
  eventListenerId: v.optional(v.id("eventListeners")),  // Link to the Event Dispatcher listener record

  // --- Timestamps ---
  createdAt: v.number(),
  updatedAt: v.number(),
  lastDeliveryAt: v.optional(v.number()),        // Last successful delivery timestamp
  disabledAt: v.optional(v.number()),            // When auto-disabled due to failures
})
  .index("by_eventCode", ["eventCode", "status"])             // Find active webhooks for an event
  .index("by_status", ["status"])                             // Active/paused/disabled filter
  .index("by_userId", ["userId"])                             // List webhooks for a user
  .index("by_listener", ["eventListenerId"]),                 // Reverse lookup from event listener
```

**Field Specifications:**

| Field | Type | Required | Default | Validation |
|-------|------|----------|---------|------------|
| `name` | `string` | Yes | -- | Max 200 chars. Non-empty. |
| `deliveryUrl` | `string` | Yes | -- | Valid HTTPS URL. Max 2000 chars. Must start with `https://`. SSRF-validated. |
| `secret` | `string` | Yes | Auto-generated | AES-256-GCM encrypted signing secret. Stored as `iv:authTag:ciphertext`. |
| `eventCode` | `string` | Yes | -- | Valid event code or wildcard pattern (`post.*`, `*`). |
| `status` | `enum` | Yes | `"active"` | One of: active, paused, disabled. |
| `contentType` | `enum` | Yes | `"application/json"` | One of: application/json, application/x-www-form-urlencoded. |
| `consecutiveFailures` | `number` | Yes | `0` | Non-negative integer. Reset to 0 on success. |
| `maxConsecutiveFailures` | `number` | Yes | `5` | Positive integer. Range: 1-20. |
| `deliveryTimeout` | `number` | Yes | `15000` | Positive integer (ms). Range: 1000-30000. |
| `userId` | `string` | Yes | Current user | Valid user identifier. |
| `eventListenerId` | `Id<"eventListeners">` | No | Set during creation | Links to the Event Dispatcher listener. |
| `createdAt` | `number` | Yes | `Date.now()` | Immutable. |
| `updatedAt` | `number` | Yes | `Date.now()` | Updated on any change. |
| `lastDeliveryAt` | `number` | No | `undefined` | Updated on each successful delivery. |
| `disabledAt` | `number` | No | `undefined` | Set when auto-disabled. |

### `webhookDeliveries` Table

```typescript
webhookDeliveries: defineTable({
  // --- References ---
  webhookId: v.id("webhooks"),                   // The webhook this delivery belongs to
  eventId: v.optional(v.id("events")),           // The event that triggered this delivery

  // --- Request ---
  requestUrl: v.string(),                        // The URL the request was sent to
  requestHeaders: v.string(),                    // JSON-serialized request headers
  requestBody: v.string(),                       // JSON-serialized request body

  // --- Response ---
  responseCode: v.optional(v.number()),          // HTTP status code (null if connection failed)
  responseHeaders: v.optional(v.string()),       // JSON-serialized response headers
  responseBody: v.optional(v.string()),          // Response body (truncated to 10KB)

  // --- Result ---
  success: v.boolean(),                          // true if 2xx response received
  error: v.optional(v.string()),                 // Error message if delivery failed

  // --- Timing ---
  duration: v.optional(v.number()),              // Request duration in ms
  deliveredAt: v.number(),                       // When the delivery attempt was made

  // --- Context ---
  isTest: v.boolean(),                           // true if this was a manual test delivery
  attempt: v.number(),                           // Attempt number (1 = first try, 2+ = retries)
})
  .index("by_webhook", ["webhookId", "deliveredAt"])          // Delivery history for a webhook
  .index("by_event", ["eventId"])                             // Deliveries for an event
  .index("by_success", ["success", "deliveredAt"])            // Failed deliveries for monitoring
  .index("by_delivered", ["deliveredAt"]),                    // Chronological delivery log
```

### `apiRateLimitWindows` Table

```typescript
apiRateLimitWindows: defineTable({
  // --- Identity ---
  keyHash: v.string(),                           // API key hash (links to apiKeys.keyHash)
  windowType: v.union(
    v.literal("minute"),
    v.literal("hour"),
  ),
  windowStart: v.number(),                       // Start of the current window (timestamp)

  // --- Counter ---
  requestCount: v.number(),                      // Number of requests in this window
})
  .index("by_key_window", ["keyHash", "windowType", "windowStart"]),
```

### Indexes Summary

| Table | Index | Fields | Purpose |
|-------|-------|--------|---------|
| `apiKeys` | `by_keyHash` | `["keyHash"]` | Fast O(1) lookup during API authentication |
| `apiKeys` | `by_keyPrefix` | `["keyPrefix"]` | Identify which key was used from prefix display |
| `apiKeys` | `by_userId` | `["userId", "status"]` | List all keys for a user, filterable by status |
| `apiKeys` | `by_status` | `["status"]` | Admin: filter keys by active/revoked/expired |
| `apiKeys` | `by_expires` | `["expiresAt"]` | Cron: find expired keys for cleanup |
| `webhooks` | `by_eventCode` | `["eventCode", "status"]` | Find active webhooks for a fired event |
| `webhooks` | `by_status` | `["status"]` | Admin: filter webhooks by status |
| `webhooks` | `by_userId` | `["userId"]` | List all webhooks for a user |
| `webhooks` | `by_listener` | `["eventListenerId"]` | Reverse lookup from event listener to webhook |
| `webhookDeliveries` | `by_webhook` | `["webhookId", "deliveredAt"]` | Delivery history for a specific webhook |
| `webhookDeliveries` | `by_event` | `["eventId"]` | Find all deliveries triggered by a specific event |
| `webhookDeliveries` | `by_success` | `["success", "deliveredAt"]` | Monitor failed deliveries |
| `webhookDeliveries` | `by_delivered` | `["deliveredAt"]` | Chronological log, cleanup by age |
| `apiRateLimitWindows` | `by_key_window` | `["keyHash", "windowType", "windowStart"]` | Rate limit counter lookup |

### Relationships

| From Table | Field | To Table | Relationship |
|------------|-------|----------|-------------|
| `apiKeys.userId` | `userId` | Convex Auth Users | API key owner |
| `webhooks.userId` | `userId` | Convex Auth Users | Webhook creator |
| `webhooks.eventListenerId` | `eventListenerId` | `eventListeners` | Event Dispatcher listener link |
| `webhookDeliveries.webhookId` | `webhookId` | `webhooks` | Parent webhook |
| `webhookDeliveries.eventId` | `eventId` | `events` | Triggering event |
| `apiRateLimitWindows.keyHash` | `keyHash` | `apiKeys.keyHash` | Rate limit owner (via hash, not ID) |

---

## Actions & Functions

### Mutations

#### `api.create_key` - Create API Key
- **Airtable Record:** `rec2WLAUsDUmopG8A`
- **Convex Function:** `mutations/apiKeys.create`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    name: v.string(),                                 // Human-readable name
    scopes: v.array(apiKeyScope),                     // Permissions this key grants
    rateLimitPerMinute: v.optional(v.number()),        // Default: 60
    rateLimitPerHour: v.optional(v.number()),          // Default: 1000
    expiresAt: v.optional(v.number()),                 // Optional expiration timestamp
  }
  ```
- **Returns:**
  ```typescript
  {
    keyId: Id<"apiKeys">,
    key: string,                  // Plaintext key (SHOWN ONLY ONCE)
    keyPrefix: string,            // First 8 chars for identification
    name: string,
    scopes: string[],
    createdAt: number,
  }
  ```
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check capability: `manage_options` (Administrator only)
  3. Validate `name` is non-empty and under 200 chars
  4. Validate `scopes` is a non-empty array of valid scope literals
  5. Validate rate limits are within allowed ranges (minute: 1-600, hour: 1-10000)
  6. Generate cryptographically secure API key: `shk_` + 44 random hex chars (from `crypto.randomBytes(22)`)
  7. Compute SHA-256 hash of the full key for storage
  8. Extract first 8 characters as `keyPrefix`
  9. Insert `apiKeys` record with `status: "active"`, `requestCount: 0`
  10. Emit event `api.key_created`
  11. Return plaintext key **exactly once** (never retrievable again)
- **Events:** `api.key_created`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options` capability
  - `VALIDATION_ERROR`: Name empty/too long, scopes empty/invalid, rate limits out of range

#### `api.revoke_key` - Revoke API Key
- **Airtable Record:** `recltzQqUzvbr1KIn`
- **Convex Function:** `mutations/apiKeys.revoke`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    keyId: v.id("apiKeys"),                            // Key to revoke
    reason: v.optional(v.string()),                    // Optional revocation reason
  }
  ```
- **Returns:** Success confirmation
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check capability: `manage_options`
  3. Fetch the API key record
  4. Validate key exists and is currently `"active"`
  5. Update: `status: "revoked"`, `revokedAt: Date.now()`, `revokedBy: identity.subject`, `revokeReason`
  6. Emit event `api.key_revoked`
- **Events:** `api.key_revoked`
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options`
  - `NOT_FOUND`: Key ID does not exist
  - `CONFLICT`: Key already revoked or expired

#### `api.create_webhook` - Create Webhook
- **Airtable Record:** `recOgkbVHKaeA56ne`
- **Convex Function:** `mutations/webhooks.create`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    name: v.string(),
    deliveryUrl: v.string(),                           // HTTPS endpoint URL
    eventCode: v.string(),                             // Event to subscribe to
    contentType: v.optional(v.union(
      v.literal("application/json"),
      v.literal("application/x-www-form-urlencoded"),
    )),                                                 // Default: "application/json"
    maxConsecutiveFailures: v.optional(v.number()),    // Default: 5
    deliveryTimeout: v.optional(v.number()),           // Default: 15000 ms
  }
  ```
- **Returns:**
  ```typescript
  {
    webhookId: Id<"webhooks">,
    secret: string,               // Plaintext signing secret (SHOWN ONLY ONCE)
    name: string,
    deliveryUrl: string,
    eventCode: string,
    status: "active",
  }
  ```
- **Behavior:**
  1. Authenticate user via auth identity
  2. Check capability: `manage_options`
  3. Validate `name` (non-empty, max 200 chars)
  4. Validate `deliveryUrl` (valid HTTPS URL, SSRF protection, max 2000 chars)
  5. Validate `eventCode` is a valid event code or wildcard pattern
  6. Generate webhook signing secret: `whsec_` + 48 hex chars (from `crypto.randomBytes(24)`)
  7. Encrypt the secret with AES-256-GCM using `WEBHOOK_SECRET_ENCRYPTION_KEY`
  8. Register event listener in Event Dispatcher:
     - `handlerModule: "api/webhookDelivery"`
     - `handlerFunction: "onEventForWebhook"`
     - `handlerType: "action"` (makes external HTTP calls)
     - `priority: 50`, `maxRetries: 3`, `retryDelayMs: 5000`, `retryBackoff: "exponential"`
  9. Insert webhook record with `status: "active"`, `consecutiveFailures: 0`, linked `eventListenerId`
  10. Return webhook ID and plaintext signing secret (shown only once)
- **Events:** None (bootstrap operation)
- **Errors:**
  - `UNAUTHORIZED`: User not authenticated
  - `FORBIDDEN`: User lacks `manage_options`
  - `VALIDATION_ERROR`: Name empty/too long, URL not HTTPS, URL is private IP (SSRF), invalid event code

#### `api.update_webhook` - Update Webhook
- **Airtable Record:** `rectK3ucbXPwo2pZ6`
- **Convex Function:** `mutations/webhooks.update`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    webhookId: v.id("webhooks"),
    name: v.optional(v.string()),
    deliveryUrl: v.optional(v.string()),
    eventCode: v.optional(v.string()),
    status: v.optional(webhookStatus),                 // active/paused
    contentType: v.optional(v.union(
      v.literal("application/json"),
      v.literal("application/x-www-form-urlencoded"),
    )),
    maxConsecutiveFailures: v.optional(v.number()),
    deliveryTimeout: v.optional(v.number()),
    regenerateSecret: v.optional(v.boolean()),         // Generate new signing secret
  }
  ```
- **Returns:** Updated webhook (includes new secret if regenerated)
- **Behavior:**
  1. Authenticate + check `manage_options`
  2. Fetch webhook record
  3. Validate updated fields (same rules as creation)
  4. If `eventCode` changed: update linked `eventListener.eventCode`
  5. If `status` changed to `"paused"`: set linked `eventListener.isActive = false`
  6. If `status` changed to `"active"`: set listener active, reset `consecutiveFailures` to 0, clear `disabledAt`
  7. If `regenerateSecret`: generate new secret, encrypt, return plaintext (once)
  8. Patch webhook record with updated fields and `updatedAt: Date.now()`
- **Events:** None
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`

#### `api.delete_webhook` - Delete Webhook
- **Airtable Record:** `recphfDL8r4MQIqZo`
- **Convex Function:** `mutations/webhooks.delete`
- **Type:** Mutation
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    webhookId: v.id("webhooks"),
  }
  ```
- **Returns:** Success confirmation
- **Behavior:**
  1. Authenticate + check `manage_options`
  2. Fetch webhook record
  3. Deactivate linked event listener (set `isActive: false`, optionally delete)
  4. Delete webhook record
  5. Delivery logs (`webhookDeliveries`) preserved for audit; cleaned by retention cron
- **Events:** None
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

### Actions

#### `api.test_webhook` - Test Webhook Delivery
- **Airtable Record:** `recpWoie3gI4xPjgw`
- **Convex Function:** `actions/webhooks.test`
- **Type:** Action (makes external HTTP request)
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator (`manage_options`)
- **Args:**
  ```typescript
  {
    webhookId: v.id("webhooks"),
  }
  ```
- **Returns:**
  ```typescript
  {
    deliveryId: Id<"webhookDeliveries">,
    success: boolean,
    statusCode: number | null,
    duration: number,             // ms
    error?: string,
    responseBody?: string,        // Truncated to 1KB
  }
  ```
- **Behavior:**
  1. Authenticate + check `manage_options`
  2. Fetch webhook record
  3. Construct test payload: `{ event: webhook.eventCode, test: true, timestamp, webhook_id, data: { message: "..." } }`
  4. Decrypt webhook secret (AES-256-GCM)
  5. Compute HMAC-SHA256 signature
  6. HTTP POST to `deliveryUrl` with standard ConvexPress headers
  7. Capture response (status, headers, body)
  8. Insert `webhookDeliveries` record with `isTest: true`
  9. Emit `api.webhook_triggered` event
- **Events:** `api.webhook_triggered`
- **Errors:** `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `DELIVERY_FAILED`

### Internal Functions

#### `internal.api.authenticateRequest` - Authenticate API Request
- **Convex Function:** `internals/api.authenticateRequest`
- **Type:** Internal function (not exposed to clients)
- **Args:**
  ```typescript
  {
    authorizationHeader: v.string(),                   // "Bearer shk_..."
    requiredScope: v.string(),                         // The scope needed for this endpoint
    clientIp: v.optional(v.string()),                  // Requesting IP address
  }
  ```
- **Returns:**
  ```typescript
  {
    authenticated: true,
    key: ApiKeyRecord,
    userId: string,
  } | {
    authenticated: false,
    error: string,
    errorCode: "UNAUTHORIZED" | "FORBIDDEN" | "RATE_LIMITED",
    retryAfter?: number,          // Seconds until rate limit resets
  }
  ```
- **Behavior:**
  1. Parse `Authorization` header (must be `Bearer <token>`)
  2. Validate token format: starts with `shk_`, exactly 48 characters
  3. Compute SHA-256 hash of token
  4. Query `apiKeys` by `by_keyHash` index
  5. Validate status: reject `revoked` and `expired` (or `expiresAt < Date.now()`)
  6. Check scope: verify `requiredScope` is in key's `scopes` array
  7. Check rate limit: query `apiRateLimitWindows` for minute and hour windows
  8. If within limits: increment counters, update key usage (`lastUsedAt`, `lastUsedIp`, `requestCount`)
  9. Return authenticated key record and user ID

#### `internal.api.deliverWebhook` - Deliver Webhook Payload
- **Convex Function:** `actions/api.deliverWebhook`
- **Type:** Action (external HTTP request)
- **Invoked by:** Event Dispatcher (when subscribed event fires)
- **Behavior:**
  1. Parse event payload from dispatcher
  2. Find webhook record linked to this event listener (via `by_listener` index)
  3. If webhook not `"active"`, skip delivery
  4. Construct payload: `{ event, timestamp, delivery_id, webhook_id, data }`
  5. Decrypt signing secret (AES-256-GCM)
  6. Compute HMAC-SHA256: `hmac = HMAC-SHA256(secret, JSON.stringify(payload))`
  7. HTTP POST with headers: `Content-Type`, `X-ConvexPress-Event`, `X-ConvexPress-Signature`, `X-ConvexPress-Delivery`, `X-ConvexPress-Webhook-Id`, `User-Agent: ConvexPress-Webhook/1.0`
  8. Timeout: `webhook.deliveryTimeout` (default 15s)
  9. Insert `webhookDeliveries` record
  10. On success (2xx): reset `consecutiveFailures` to 0, update `lastDeliveryAt`
  11. On failure: increment `consecutiveFailures`; if >= `maxConsecutiveFailures`, auto-disable webhook and emit `api.webhook_triggered` with failure details

### Cron Functions

#### `internal.api.cleanupExpiredKeys` - Expire Old API Keys
- **Convex Function:** `crons/api.cleanupExpiredKeys`
- **Schedule:** Hourly
- **Behavior:**
  1. Query `apiKeys` where `expiresAt < Date.now()` and `status === "active"`
  2. Update each: `status: "expired"`, `updatedAt: Date.now()`
  3. Clean up stale `apiRateLimitWindows` records older than 2 hours

#### `internal.api.cleanupDeliveryLogs` - Clean Up Delivery Logs
- **Convex Function:** `crons/api.cleanupDeliveryLogs`
- **Schedule:** Daily
- **Behavior:**
  1. Query `webhookDeliveries` where `deliveredAt < Date.now() - 30 days`
  2. Delete in batches of 100
  3. Log cleanup count

### Queries (Implied for Admin UI)

#### `apiKeys.list` - List API Keys
- **Type:** Query
- **Auth:** Required (auth identity)
- **Capabilities:** Administrator
- **Args:** `{ status?: apiKeyStatus }`
- **Returns:** Array of `ApiKey` records (excludes `keyHash`)
- **Behavior:** Query `apiKeys` by `by_userId` or `by_status` index, return sorted by `createdAt` descending
- **Pagination:** Offset-based (`page`, `perPage`)

#### `apiKeys.get` - Get Single API Key
- **Type:** Query
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ keyId: v.id("apiKeys") }`
- **Returns:** Single `ApiKey` record (excludes `keyHash`)

#### `webhooks.list` - List Webhooks
- **Type:** Query
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ status?: webhookStatus }`
- **Returns:** Array of `Webhook` records (excludes `secret`)

#### `webhooks.get` - Get Single Webhook
- **Type:** Query
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ webhookId: v.id("webhooks") }`
- **Returns:** Single `Webhook` record (excludes `secret`)

#### `webhookDeliveries.list` - List Delivery Log
- **Type:** Query
- **Auth:** Required
- **Capabilities:** Administrator
- **Args:** `{ webhookId: v.id("webhooks"), limit?: number }`
- **Returns:** Array of `WebhookDelivery` records, sorted by `deliveredAt` descending
- **Pagination:** Cursor-based or limit-based

---

## Events

### `api.key_created`
- **Airtable Record:** `rec0c4gkQYYIk7yzR`
- **Type:** System
- **Triggered By:** `api.create_key` mutation
- **Payload:**
  ```typescript
  {
    keyId: string,                // The new API key record ID
    keyPrefix: string,            // First 8 chars of the key
    name: string,                 // Human-readable key name
    scopes: string[],             // Granted scopes
    createdBy: string,            // user identifier of the creator
  }
  ```
- **Subscribers:**
  - Site Notification: `recpNWoVYVQBwc56U` -- Info: "New API key created: {name}" (Admin, persistent)
  - Audit Log: Yes (records key creation in audit trail)

### `api.key_revoked`
- **Airtable Record:** `recHXoaTxp5aQH9V9`
- **Type:** System
- **Triggered By:** `api.revoke_key` mutation
- **Payload:**
  ```typescript
  {
    keyId: string,                // The revoked API key record ID
    keyPrefix: string,            // Key prefix for identification
    name: string,                 // Key name
    revokedBy: string,            // user identifier of who revoked it
    reason: string | undefined,   // Optional revocation reason
  }
  ```
- **Subscribers:**
  - Audit Log: Yes (records key revocation with reason)

### `api.webhook_triggered`
- **Airtable Record:** `recPqW6NDnimNHtn9`
- **Type:** System
- **Triggered By:** `api.test_webhook` action, `internal.api.deliverWebhook` action
- **Payload:**
  ```typescript
  {
    endpointId: string,           // The webhook record ID
    event: string,                // The event code that triggered the webhook
    statusCode: number,           // HTTP response status code (0 if connection failed)
    success: boolean,             // Whether delivery was successful
    isTest: boolean,              // Whether this was a test delivery
    error?: string,               // Error message if delivery failed
  }
  ```
- **Subscribers:**
  - Email Notification: `recLNX3wYzI2hhKSs` -- "Webhook delivery failed: {endpoint}" (Admin, Immediate, only when `success === false`)
  - Site Notification: `recKhrTp5M6onIljY` -- Error: "Webhook to {endpoint} failed" (Admin, persistent, only when `success === false`)
  - Audit Log: Yes (records all deliveries, success and failure)

---

## Admin Routes & UI

### API Keys Page (`/admin/api-keys`)
- **Airtable Record:** `reczTenYS47uPEumA`
- **Purpose:** Full-page admin view for managing API keys (create, view, revoke)
- **WordPress Equivalent:** Users -> Profile -> Application Passwords section (elevated to dedicated page)
- **Layout:** `_admin` layout with left sidebar, top admin bar
- **Auth:** Yes (auth session)
- **Roles:** Administrator only
- **Key Components:**
  - **Header** -- Page title "API Keys" with "Create New Key" button
  - **API Key Table** (`api-key-table.tsx`) -- DataTable with columns: Name, Key Prefix (`shk_a1b2...`), Scopes (badge list), Status (badge), Last Used (relative time + IP), Requests (count), Created (date), Actions (Revoke)
  - **Create Key Dialog** (`create-key-dialog.tsx`) -- Modal: name input, scope checkboxes grouped by resource, rate limit config (collapsed), expiration date picker (optional)
  - **Scope Selector** (`scope-selector.tsx`) -- Checkbox component grouped by resource category (Posts & Pages, Comments, Media, Users, Taxonomies, Settings, Menus)
  - **Key Created Dialog** (`key-created-dialog.tsx`) -- Modal: large monospace display of plaintext key, copy button, "This key will only be shown once" warning
  - **Revoke Key Dialog** (`revoke-key-dialog.tsx`) -- Confirmation modal with optional reason input
- **Data Requirements:** `useQuery(api.apiKeys.list)` for reactive key list
- **User Interactions:** Create key, copy plaintext key, revoke key with reason
- **Real-Time:** Key list updates live when keys are created or revoked

### Webhooks Page (`/admin/webhooks`)
- **Airtable Record:** `rec9h764XFzJnWzoR`
- **Purpose:** Full-page admin view for managing outbound webhooks (CRUD, test, delivery log)
- **WordPress Equivalent:** WooCommerce -> Settings -> Advanced -> Webhooks
- **Layout:** `_admin` layout
- **Auth:** Yes (auth session)
- **Roles:** Administrator only
- **Key Components:**
  - **Header** -- Page title "Webhooks" with "Create New Webhook" button
  - **Webhook Table** (`webhook-table.tsx`) -- DataTable: Name, Delivery URL (truncated), Event (code + system badge), Status (badge), Last Delivery (relative time + success/fail indicator), Consecutive Failures (0/5 counter), Actions (Edit, Test, Delete)
  - **Create/Edit Webhook Form** (`create-webhook-form.tsx`) -- Full form: name, delivery URL (HTTPS validation), event code dropdown (grouped by system), content type radio, advanced settings (collapsed: max failures, timeout)
  - **Event Code Select** (`event-code-select.tsx`) -- Dropdown with grouping by system (Post Events, Comment Events, etc.) and wildcard support
  - **Webhook Created Dialog** (`webhook-created-dialog.tsx`) -- Shows signing secret once: monospace display, copy button, "This secret will only be shown once" warning, verification instructions
  - **Delivery Log Table** (`delivery-log-table.tsx`) -- Delivery history: Delivery ID, Event Code, Status Code (green 2xx / red errors), Duration (ms), Test badge, Timestamp, expandable row for full request/response
  - **Delivery Detail** (`delivery-detail.tsx`) -- Expandable view showing full request headers, body, response headers, body
  - **Test Webhook Button** (`test-webhook-button.tsx`) -- "Send Test" button with loading state and result display
- **Data Requirements:** `useQuery(api.webhooks.list)`, `useQuery(api.webhookDeliveries.list, { webhookId })`
- **User Interactions:** Create webhook, edit webhook, test delivery, view delivery log, regenerate secret, delete webhook
- **Real-Time:** Webhook list and delivery log update live

### Webhook Dispatch API (`/api/admin/webhooks/dispatch`)
- **Airtable Record:** `recZcVKJaG477dxAX`
- **Purpose:** Internal API endpoint for admin UI "Send Test" button
- **Layout:** `_admin`
- **Auth:** Yes
- **Roles:** Administrator
- **Type:** API endpoint (invokes `api.test_webhook` action)

---

## Website Routes

No public-facing website routes. The API System's public interface is the REST API at `/api/v1/` (Convex HTTP actions), not TanStack Start routes.

The `/api/v1/discovery` endpoint is the only public, unauthenticated API endpoint (returns available endpoints and authentication info).

---

## Notifications

### Email Notifications

| Name | Event | Recipients | Priority | Subject | Condition |
|------|-------|------------|----------|---------|-----------|
| Webhook Failure Alert (`recLNX3wYzI2hhKSs`) | `api.webhook_triggered` | Admin | Immediate | Webhook delivery failed: {webhook_name} | Only when `success === false` |

**Template Content:**
```
Subject: Webhook delivery failed: {webhook_name}

A webhook delivery to {delivery_url} has failed.

Event: {event_code}
Status Code: {status_code}
Error: {error_message}
Consecutive Failures: {consecutive_failures} / {max_consecutive_failures}

{if disabled}
WARNING: This webhook has been automatically disabled after {max_consecutive_failures}
consecutive failures. Re-enable it from the admin panel at /admin/webhooks.
{/if}

---
ConvexPress - API System
```

### Site Notifications

| Name | Event | Type | Persistent | Recipients | Message |
|------|-------|------|-----------|------------|---------|
| API Key Created (`recpNWoVYVQBwc56U`) | `api.key_created` | Info | Yes | Admin | New API key created: {name} |
| Webhook Failed (`recKhrTp5M6onIljY`) | `api.webhook_triggered` | Error | Yes | Admin | Webhook to {endpoint} failed |

---

## Role & Capability Matrix

### Management Actions (Admin UI)

| Action | Administrator | Editor | Author | Contributor | Subscriber |
|--------|:------------:|:------:|:------:|:-----------:|:----------:|
| Create API Key | Yes | No | No | No | No |
| Revoke API Key | Yes | No | No | No | No |
| List API Keys | Yes | No | No | No | No |
| Create Webhook | Yes | No | No | No | No |
| Update Webhook | Yes | No | No | No | No |
| Delete Webhook | Yes | No | No | No | No |
| Test Webhook | Yes | No | No | No | No |
| View Webhook Delivery Log | Yes | No | No | No | No |
| View API Keys Page | Yes | No | No | No | No |
| View Webhooks Page | Yes | No | No | No | No |

**Required Capability:** `manage_options` (mapped to `manage_api_keys`)

### API Authentication Scopes (External Requests)

| Scope | Capability Equivalent | What It Grants |
|-------|----------------------|----------------|
| `read:posts` | `read` | Read published posts and pages |
| `write:posts` | `edit_posts`, `publish_posts`, `delete_posts` | Full CRUD on posts and pages |
| `read:comments` | `moderate_comments` (read aspect) | Read comments |
| `write:comments` | `moderate_comments` | CRUD on comments, approve/reject |
| `read:media` | `upload_files` (read aspect) | Read media library |
| `write:media` | `upload_files`, `delete_media` | Upload and delete media |
| `read:users` | `list_users` | Read user profiles |
| `write:users` | `edit_users` | Update user profiles |
| `read:taxonomies` | `manage_categories` (read aspect) | Read categories and tags |
| `write:taxonomies` | `manage_categories` | CRUD on categories and tags |
| `read:settings` | `manage_options` (read aspect) | Read site settings |
| `write:settings` | `manage_options` | Update site settings |
| `read:menus` | `edit_theme_options` (read aspect) | Read navigation menus |
| `write:menus` | `edit_theme_options` | CRUD on menus |

---

## Dependencies

### Depends On

| System | Record ID | Classification | What Is Needed |
|--------|-----------|---------------|----------------|
| **Auth System** | `recNGEVtMvLjp6o8h` | **Hard** | auth identity for admin management operations. API key `userId` references user identifier. Cannot function without auth for admin operations. |
| **Role & Capability System** | `recLjkb6BJlxqHTQv` | **Hard** | `manage_options` / `manage_api_keys` capability check for all management actions. API key scopes map to WordPress capabilities. Cannot create/manage keys without capability checks. |
| **Event Dispatcher System** | -- | **Hard** | Webhooks are registered as event listeners in the dispatcher. Webhook delivery is triggered by the dispatcher. Event emission (`emitEvent`) for all three events. Without the dispatcher, webhooks cannot function. |

### Depended On By

| System | Classification | What They Need |
|--------|---------------|----------------|
| **External Applications** | **Soft** | REST API endpoints for programmatic CMS access (headless front-ends, mobile apps, automation) |
| **Automation Platforms** | **Soft** | Webhooks for real-time event notifications (Zapier, Make, n8n) |

### Integrates With

| System | Integration Type | Details |
|--------|-----------------|---------|
| **Event Dispatcher System** | Bidirectional | Webhooks register as event listeners; dispatcher triggers delivery action; API System emits 3 events through dispatcher |
| **Email Notification System** | One-way (consumer) | `api.webhook_triggered` failure triggers email alert template |
| **Site Notification System** | One-way (consumer) | `api.key_created` and `api.webhook_triggered` failure trigger site notifications |
| **Audit Log System** | One-way (consumer) | All 3 events recorded in audit trail via dispatcher's global wildcard listener |
| **Post System** | One-way (provider) | API endpoints expose post CRUD; `post.*` events are the most common webhook subscriptions |
| **All Content Systems** | One-way (provider) | API endpoints expose read/write for posts, pages, comments, media, taxonomies, menus, settings |

---

## Implementation Checklist

### Backend (ConvexPress-Admin/packages/backend/convex/)

- [ ] `convex/schema.ts` -- Add 4 tables: `apiKeys`, `webhooks`, `webhookDeliveries`, `apiRateLimitWindows`
- [ ] `convex/api/validators.ts` -- Shared validators: `apiKeyScope`, `apiKeyStatus`, `webhookStatus`
- [ ] `convex/api/queries.ts` -- 5 queries: `apiKeys.list`, `apiKeys.get`, `webhooks.list`, `webhooks.get`, `webhookDeliveries.list`
- [ ] `convex/api/mutations.ts` -- 5 mutations: `apiKeys.create`, `apiKeys.revoke`, `webhooks.create`, `webhooks.update`, `webhooks.delete`
- [ ] `convex/api/actions.ts` -- 1 action: `webhooks.test`
- [ ] `convex/api/internals.ts` -- 2 internal functions: `authenticateRequest`, `deliverWebhook`
- [ ] `convex/helpers/apiKeyUtils.ts` -- `generateApiKey()`, `hashApiKey()`, `isValidApiKeyFormat()`
- [ ] `convex/helpers/webhookSecretUtils.ts` -- `generateWebhookSecret()`, `encrypt()`, `decryptWebhookSecret()`, `computeWebhookSignature()`
- [ ] `convex/helpers/rateLimit.ts` -- `checkRateLimit()` with sliding window implementation
- [ ] `convex/helpers/urlValidation.ts` -- `validateWebhookUrl()` with SSRF protection
- [ ] `convex/crons/apiKeyCleanup.ts` -- Hourly: expire old keys, clean rate limit windows
- [ ] `convex/crons/deliveryLogCleanup.ts` -- Daily: delete delivery logs older than 30 days
- [ ] `convex/http.ts` -- Register all `/api/v1/` routes + CORS preflight handler
- [ ] `convex/http/posts.ts` -- `/api/v1/posts` endpoints (GET list, GET single, POST create, PUT update, DELETE)
- [ ] `convex/http/pages.ts` -- `/api/v1/pages` endpoints
- [ ] `convex/http/comments.ts` -- `/api/v1/comments` endpoints
- [ ] `convex/http/media.ts` -- `/api/v1/media` endpoints
- [ ] `convex/http/users.ts` -- `/api/v1/users` endpoints (GET list, GET single)
- [ ] `convex/http/taxonomies.ts` -- `/api/v1/categories` + `/api/v1/tags` endpoints
- [ ] `convex/http/menus.ts` -- `/api/v1/menus` endpoints
- [ ] `convex/http/settings.ts` -- `/api/v1/settings` endpoints
- [ ] `convex/http/discovery.ts` -- `/api/v1/discovery` endpoint (public, no auth)

### Admin Frontend (ConvexPress-Admin/apps/web/src/)

- [ ] `src/routes/admin/api-keys/index.tsx` -- API Keys list page
- [ ] `src/routes/admin/api-keys/-components/api-key-table.tsx` -- DataTable component
- [ ] `src/routes/admin/api-keys/-components/create-key-dialog.tsx` -- Create key modal
- [ ] `src/routes/admin/api-keys/-components/key-created-dialog.tsx` -- Show plaintext key (once)
- [ ] `src/routes/admin/api-keys/-components/revoke-key-dialog.tsx` -- Revoke confirmation
- [ ] `src/routes/admin/api-keys/-components/scope-selector.tsx` -- Scope checkboxes
- [ ] `src/routes/admin/webhooks/index.tsx` -- Webhooks list page
- [ ] `src/routes/admin/webhooks/-components/webhook-table.tsx` -- DataTable component
- [ ] `src/routes/admin/webhooks/-components/create-webhook-form.tsx` -- Create/edit form
- [ ] `src/routes/admin/webhooks/-components/webhook-created-dialog.tsx` -- Show signing secret (once)
- [ ] `src/routes/admin/webhooks/-components/delivery-log-table.tsx` -- Delivery history
- [ ] `src/routes/admin/webhooks/-components/delivery-detail.tsx` -- Expandable request/response view
- [ ] `src/routes/admin/webhooks/-components/event-code-select.tsx` -- Event code dropdown
- [ ] `src/routes/admin/webhooks/-components/test-webhook-button.tsx` -- Send test button
- [ ] `src/lib/api/types.ts` -- TypeScript types for API keys, webhooks, deliveries
- [ ] `src/lib/api/constants.ts` -- Scopes, statuses, header names, scope groups/descriptions

### Website Frontend (ConvexPress-Website/apps/web/)

- No website routes needed (API is Convex HTTP actions, not TanStack Start routes)

### Environment Variables

- [ ] `WEBHOOK_SECRET_ENCRYPTION_KEY` -- 32-byte hex string for AES-256-GCM encryption (generate with `openssl rand -hex 32`)

---

## Edge Cases & Gotchas

1. **Key shown only once:** The plaintext API key and webhook signing secret are returned only in the creation response. If the user loses them, they must create a new key/secret. There is no "show key again" feature. This matches WordPress Application Passwords behavior. The UI must make this extremely clear with a warning and copy button.

2. **Concurrent rate limit updates:** Multiple simultaneous API requests with the same key could race on rate limit counter updates. Convex's transactional mutations handle this correctly -- each mutation sees a consistent snapshot and increments atomically. No additional locking needed.

3. **Webhook to slow endpoint:** If the target endpoint is slow but within timeout, the Convex action worker is occupied for the full duration. The `deliveryTimeout` (default 15s, max 30s) prevents indefinite blocking. Failed connections return immediately.

4. **Webhook infinite loop prevention:** If a webhook endpoint calls the ConvexPress API back, creating content that fires events that trigger the same webhook, this creates a loop. Mitigations: (a) `X-ConvexPress-Delivery` header for endpoint self-check, (b) Event Dispatcher's max event depth (5 levels) as hard circuit breaker.

5. **Revoked key in flight:** If a key is revoked while a request is being processed, the request completes (already past authentication). Subsequent requests fail immediately. This is acceptable behavior.

6. **Webhook URL changes after creation:** Updating `deliveryUrl` does not affect in-flight deliveries. Only new event deliveries use the updated URL.

7. **Large response bodies from webhook endpoints:** Response bodies in delivery logs are truncated to 10KB to prevent excessive storage from chatty endpoints.

8. **API key with no scopes:** The `scopes` array must be non-empty at creation time. An empty scope list would create a useless key. Validate in mutation.

9. **Expired key cleanup timing:** The hourly cron may miss keys that expire between runs. The authentication check also validates `expiresAt` in real-time, so expired keys are rejected immediately even before the cron marks them as expired. Both checks are needed.

10. **Webhook delivery during Convex cold start:** Convex HTTP actions and scheduled functions may experience cold starts. The `deliveryTimeout` accounts for this, but latency-sensitive webhooks should set longer timeouts.

11. **Webhook secret storage: encryption, not hashing:** API keys are stored as one-way SHA-256 hashes (verified by re-hashing the input). But webhook signing secrets must be **retrievable** for HMAC computation on every delivery. They use AES-256-GCM symmetric encryption with the `WEBHOOK_SECRET_ENCRYPTION_KEY` environment variable. Do not confuse these two storage strategies.

12. **SSRF protection:** Webhook URLs are validated to reject private IPs (127.x, 10.x, 172.16-31.x, 192.168.x), link-local (169.254.x), IPv6 loopback (::1), mDNS (.local), and cloud metadata endpoints (169.254.169.254, metadata.google.internal). This validation must run on both create and update.

13. **API response format consistency:** All API error responses must include `error`, `code`, and `status` fields. Rate-limited responses must include `retry_after`. Collection responses use pagination headers (`X-Total`, `X-Total-Pages`, `X-Page`, `X-Per-Page`), not body-level pagination.

14. **CORS:** All `/api/v1/` endpoints must include `Access-Control-Allow-Origin: *` header. The OPTIONS preflight handler at `/api/` prefix must return Allow-Methods, Allow-Headers, and Max-Age headers.

---

## WordPress Functions Reference

| WordPress | ConvexPress | Notes |
|-----------|-------------|-------|
| `WP_Application_Passwords::create_new_application_password()` | `mutations/apiKeys.create` | ConvexPress adds scoping, rate limiting |
| `WP_Application_Passwords::delete_application_password()` | `mutations/apiKeys.revoke` | ConvexPress soft-revokes (preserves audit trail) vs WP hard-delete |
| `WP_Application_Passwords::get_user_application_passwords()` | `queries/apiKeys.list` | ConvexPress uses dedicated table vs WP user meta |
| `wp_hash_password()` | `hashApiKey()` (SHA-256) | WP uses bcrypt/phpass; ConvexPress uses SHA-256 for fast lookup |
| `wp_check_password()` | `authenticateRequest()` hash comparison | Same concept: hash input and compare |
| `register_rest_route()` | `http.route()` in `convex/http.ts` | Convex HTTP action routing |
| `WP_REST_Controller` | HTTP action handler functions | No class hierarchy; each endpoint is a standalone `httpAction` |
| `permission_callback` | `authenticateRequest()` scope check | ConvexPress checks Bearer token + scope; WP checks user capabilities |
| `rest_ensure_response()` | `new Response(JSON.stringify(...))` | Direct Response construction in Convex |
| `WP_REST_Server::READABLE` (GET) | `method: "GET"` in `http.route()` | Same HTTP methods |
| `WP_REST_Server::CREATABLE` (POST) | `method: "POST"` in `http.route()` | Same |
| `WP_REST_Server::EDITABLE` (PUT) | `method: "PUT"` in `http.route()` | Same |
| `WP_REST_Server::DELETABLE` (DELETE) | `method: "DELETE"` in `http.route()` | Same |
| WooCommerce `WC_Webhook` class | `webhooks` table + delivery action | ConvexPress is table-driven, not class-driven |
| WooCommerce `wc_webhook_deliver()` | `internal.api.deliverWebhook` action | Both use HMAC-SHA256 signing |
| WooCommerce webhook delivery log | `webhookDeliveries` table | ConvexPress stores full request/response in Convex |
| Wordfence rate limiting | `apiRateLimitWindows` table + `checkRateLimit()` | Built-in vs plugin-based |
| `rest_api_init` action hook | Convex `http.ts` route registration | Both register routes; ConvexPress is declarative |
| `/wp-json/` discovery | `/api/v1/discovery` endpoint | Both return available endpoints and auth info |

---

## HTTP Endpoint Reference

### Planned V1 API Endpoints

| Method | Path | Scope Required | Description |
|--------|------|---------------|-------------|
| `GET` | `/api/v1/posts` | `read:posts` | List published posts |
| `GET` | `/api/v1/posts/:id` | `read:posts` | Get single post |
| `POST` | `/api/v1/posts` | `write:posts` | Create new post |
| `PUT` | `/api/v1/posts/:id` | `write:posts` | Update post |
| `DELETE` | `/api/v1/posts/:id` | `write:posts` | Trash/delete post |
| `GET` | `/api/v1/pages` | `read:posts` | List published pages |
| `GET` | `/api/v1/pages/:id` | `read:posts` | Get single page |
| `POST` | `/api/v1/pages` | `write:posts` | Create new page |
| `PUT` | `/api/v1/pages/:id` | `write:posts` | Update page |
| `DELETE` | `/api/v1/pages/:id` | `write:posts` | Trash/delete page |
| `GET` | `/api/v1/comments` | `read:comments` | List comments |
| `GET` | `/api/v1/comments/:id` | `read:comments` | Get single comment |
| `POST` | `/api/v1/comments` | `write:comments` | Create comment |
| `PUT` | `/api/v1/comments/:id` | `write:comments` | Update comment |
| `DELETE` | `/api/v1/comments/:id` | `write:comments` | Delete comment |
| `GET` | `/api/v1/media` | `read:media` | List media items |
| `GET` | `/api/v1/media/:id` | `read:media` | Get single media item |
| `POST` | `/api/v1/media` | `write:media` | Upload media |
| `DELETE` | `/api/v1/media/:id` | `write:media` | Delete media item |
| `GET` | `/api/v1/users` | `read:users` | List users |
| `GET` | `/api/v1/users/:id` | `read:users` | Get single user |
| `GET` | `/api/v1/categories` | `read:taxonomies` | List categories |
| `POST` | `/api/v1/categories` | `write:taxonomies` | Create category |
| `GET` | `/api/v1/tags` | `read:taxonomies` | List tags |
| `POST` | `/api/v1/tags` | `write:taxonomies` | Create tag |
| `GET` | `/api/v1/menus` | `read:menus` | List menus |
| `GET` | `/api/v1/settings` | `read:settings` | Read settings |
| `GET` | `/api/v1/discovery` | *(none -- public)* | API discovery |
| `OPTIONS` | `/api/*` | *(none)* | CORS preflight |

### Standard Webhook Delivery Headers

| Header | Example Value | Description |
|--------|--------------|-------------|
| `Content-Type` | `application/json` | Payload content type |
| `User-Agent` | `ConvexPress-Webhook/1.0` | Identifies ConvexPress as sender |
| `X-ConvexPress-Event` | `post.published` | Event code that triggered delivery |
| `X-ConvexPress-Signature` | `sha256=a1b2c3d4...` | HMAC-SHA256 of body using webhook secret |
| `X-ConvexPress-Delivery` | `del_a1b2c3d4` | Unique delivery ID for idempotency |
| `X-ConvexPress-Webhook-Id` | `j57ekr3...` | Webhook record ID |
| `X-ConvexPress-Timestamp` | `1707350400000` | Unix timestamp (ms) of event |

### API Response Format

**Success (single resource):**
```json
{
  "id": "j57ekr3...",
  "title": "My First Post",
  "slug": "my-first-post",
  "status": "publish",
  "content": "<p>Hello world</p>",
  "author": { "id": "user_2abc...", "name": "Jane Admin" },
  "created_at": "2026-02-08T12:00:00.000Z",
  "updated_at": "2026-02-08T12:00:00.000Z"
}
```

**Error:**
```json
{
  "error": "API key lacks required scope: write:posts",
  "code": "FORBIDDEN",
  "status": 403
}
```

**Rate Limited:**
```json
{
  "error": "Rate limit exceeded. Try again in 45 seconds.",
  "code": "RATE_LIMITED",
  "status": 429,
  "retry_after": 45
}
```

### Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | 32-byte hex string for AES-256-GCM encryption of webhook signing secrets | Yes (for webhook functionality) |

Generate with: `openssl rand -hex 32`
Store in: Convex environment variables (never in code)
Rotation: Requires re-encrypting all webhook secrets
