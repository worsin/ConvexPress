# PRD: API System

> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** PLT-API
> **Phase:** 4 of 6 (Checkout & Orders)
> **Priority:** P1 - High
> **Complexity:** Complex
> **Airtable Record:** [redacted-airtable-record-id]

---

## 1. Overview

### 1.1 Purpose

The API System provides a comprehensive REST API covering all shopping cart functionality. It enables headless commerce, mobile app development, third-party integrations, and programmatic access to the platform. The API is systematically designed to cover every entity and operation in the system, with proper authentication, rate limiting, and documentation.

### 1.2 Scope

- Complete REST API for all entities (products, orders, customers, inventory, etc.)
- API key authentication for machine-to-machine access
- JWT authentication for user context operations
- Webhooks for real-time event notifications
- Rate limiting and usage tracking
- OpenAPI/Swagger documentation
- Versioned endpoints (v1, v2, etc.)
- Admin interface for API key management

### 1.3 Out of Scope

- GraphQL API (future consideration)
- Real-time subscriptions (use Convex native subscriptions)
- Bulk import/export API (separate system)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication System | PLT-AUT | 0 | User authentication for API |
| Product Catalog | CAT-PRD | 2 | Products API endpoints |
| Order Management | ORD-MGT | 4 | Orders API endpoints |
| Customer Accounts | USR-ACT | 1 | Customer API endpoints |
| Inventory System | INV-STK | 3 | Inventory API endpoints |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| All systems | - | - | External integrations via API |

### 2.3 Integration Hooks to Implement

- Webhook dispatch on all major events
- API usage analytics events
- Rate limit exceeded notifications

---

## 3. Routes

### 3.1 API Routes (REST Endpoints)

All API routes are prefixed with `/api/v1/`

#### Products
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /products | List products | API Key / Public |
| GET | /products/:id | Get product | API Key / Public |
| POST | /products | Create product | API Key (write) |
| PUT | /products/:id | Update product | API Key (write) |
| DELETE | /products/:id | Delete product | API Key (admin) |
| GET | /products/:id/variants | List variants | API Key / Public |
| POST | /products/:id/variants | Create variant | API Key (write) |

#### Orders
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /orders | List orders | API Key (read) |
| GET | /orders/:id | Get order | API Key (read) |
| POST | /orders | Create order | API Key (write) |
| PUT | /orders/:id | Update order | API Key (write) |
| POST | /orders/:id/fulfill | Mark fulfilled | API Key (write) |
| POST | /orders/:id/cancel | Cancel order | API Key (write) |
| POST | /orders/:id/refund | Issue refund | API Key (admin) |

#### Customers
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /customers | List customers | API Key (read) |
| GET | /customers/:id | Get customer | API Key (read) |
| POST | /customers | Create customer | API Key (write) |
| PUT | /customers/:id | Update customer | API Key (write) |
| GET | /customers/:id/orders | Customer orders | API Key (read) |

#### Inventory
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /inventory | List inventory | API Key (read) |
| GET | /inventory/:productId | Get stock | API Key (read) |
| PUT | /inventory/:productId | Update stock | API Key (write) |
| POST | /inventory/adjustments | Create adjustment | API Key (write) |

#### Cart
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /cart | Create cart | API Key / JWT |
| GET | /cart/:id | Get cart | API Key / JWT |
| POST | /cart/:id/items | Add item | API Key / JWT |
| PUT | /cart/:id/items/:itemId | Update item | API Key / JWT |
| DELETE | /cart/:id/items/:itemId | Remove item | API Key / JWT |
| POST | /cart/:id/checkout | Convert to order | API Key / JWT |

#### Webhooks
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /webhooks | List webhooks | API Key (admin) |
| POST | /webhooks | Create webhook | API Key (admin) |
| PUT | /webhooks/:id | Update webhook | API Key (admin) |
| DELETE | /webhooks/:id | Delete webhook | API Key (admin) |
| GET | /webhooks/:id/deliveries | Delivery history | API Key (admin) |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| API Keys | /admin/settings/api | _admin | Yes | admin |
| Webhooks | /admin/settings/webhooks | _admin | Yes | admin |
| API Usage | /admin/analytics/api | _admin | Yes | manager, admin |
| API Documentation | /admin/api-docs | _admin | Yes | staff, manager, admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// API Keys
api_keys: defineTable({
  name: v.string(),                    // "Mobile App", "Warehouse Integration"
  description: v.optional(v.string()),

  // Key identification
  keyPrefix: v.string(),               // First 8 chars for identification: "sk_live_"
  keyHash: v.string(),                 // SHA-256 hash of full key

  // Permissions
  permissions: v.array(v.string()),    // ["products:read", "orders:write"]
  scope: v.union(
    v.literal("full"),                 // All permissions
    v.literal("read_only"),            // Read-only access
    v.literal("custom"),               // Custom permission set
  ),

  // Environment
  environment: v.union(
    v.literal("live"),
    v.literal("test"),
  ),

  // Rate limiting
  rateLimit: v.number(),               // Requests per minute
  rateLimitWindow: v.number(),         // Window in seconds (default 60)

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("revoked"),
    v.literal("expired"),
  ),
  expiresAt: v.optional(v.number()),

  // Metadata
  createdBy: v.id("user_profiles"),
  createdAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  usageCount: v.number(),
})
  .index("by_key_prefix", ["keyPrefix"])
  .index("by_status", ["status", "environment"])
  .index("by_created_by", ["createdBy"])

// API Request Log (for analytics and debugging)
api_request_log: defineTable({
  apiKeyId: v.optional(v.id("api_keys")), // Null for public endpoints
  method: v.string(),                     // GET, POST, etc.
  path: v.string(),                       // /api/v1/products
  statusCode: v.number(),                 // 200, 404, 500
  responseTime: v.number(),               // Milliseconds
  requestSize: v.number(),                // Bytes
  responseSize: v.number(),               // Bytes
  ipAddress: v.string(),
  userAgent: v.optional(v.string()),
  error: v.optional(v.string()),          // Error message if failed
  timestamp: v.number(),
})
  .index("by_api_key", ["apiKeyId", "timestamp"])
  .index("by_timestamp", ["timestamp"])
  .index("by_path", ["path", "timestamp"])

// Webhooks
webhooks: defineTable({
  name: v.string(),
  url: v.string(),                       // https://example.com/webhook
  secret: v.string(),                    // For signature verification

  // Events to trigger
  events: v.array(v.string()),           // ["order.created", "order.fulfilled"]

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("paused"),
    v.literal("disabled"),               // Too many failures
  ),

  // Retry config
  retryCount: v.number(),                // Max retries (default 3)
  retryDelaySeconds: v.number(),         // Delay between retries

  // Health tracking
  lastDeliveryAt: v.optional(v.number()),
  lastSuccessAt: v.optional(v.number()),
  consecutiveFailures: v.number(),
  totalDeliveries: v.number(),
  totalFailures: v.number(),

  createdBy: v.id("user_profiles"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_event", ["events"])

// Webhook Deliveries (delivery history)
webhook_deliveries: defineTable({
  webhookId: v.id("webhooks"),
  eventType: v.string(),
  eventId: v.string(),                   // For idempotency

  // Request details
  requestUrl: v.string(),
  requestHeaders: v.any(),
  requestBody: v.string(),

  // Response
  responseStatusCode: v.optional(v.number()),
  responseBody: v.optional(v.string()),
  responseTime: v.optional(v.number()),

  // Status
  status: v.union(
    v.literal("pending"),
    v.literal("delivered"),
    v.literal("failed"),
    v.literal("retrying"),
  ),
  attemptCount: v.number(),
  nextRetryAt: v.optional(v.number()),
  error: v.optional(v.string()),

  createdAt: v.number(),
  completedAt: v.optional(v.number()),
})
  .index("by_webhook", ["webhookId", "createdAt"])
  .index("by_status", ["status", "nextRetryAt"])
  .index("by_event", ["eventType", "eventId"])

// Rate Limit Tracking (in-memory or Redis in production)
api_rate_limits: defineTable({
  apiKeyId: v.id("api_keys"),
  windowStart: v.number(),               // Timestamp of window start
  requestCount: v.number(),              // Requests in current window
})
  .index("by_key_window", ["apiKeyId", "windowStart"])
```

---

## 5. API Authentication

### 5.1 API Key Authentication

```http
# Header-based (recommended)
Authorization: Bearer <example-secret-key>

# Query parameter (for webhooks/callbacks)
GET /api/v1/products?api_key=<example-secret-key>
```

### 5.2 JWT Authentication (User Context)

For operations requiring user identity (e.g., customer's own cart):

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 5.3 Permission Scopes

| Scope | Description | Example Keys |
|-------|-------------|--------------|
| `products:read` | Read product data | Public catalog apps |
| `products:write` | Create/update products | Admin tools |
| `orders:read` | Read order data | Reporting tools |
| `orders:write` | Create/update orders | POS systems |
| `orders:fulfill` | Fulfill orders | Warehouse systems |
| `customers:read` | Read customer data | CRM integrations |
| `customers:write` | Create/update customers | Import tools |
| `inventory:read` | Read inventory | Stock monitors |
| `inventory:write` | Update inventory | Warehouse systems |
| `webhooks:manage` | Manage webhooks | Integration setup |
| `admin` | Full access | Internal tools |

### 5.4 API Key Generation

```typescript
// Generate new API key
function generateApiKey(environment: "live" | "test"): {
  displayKey: string;  // Shown once to user
  keyPrefix: string;   // Stored for identification
  keyHash: string;     // Stored for verification
} {
  const prefix = environment === "live" ? "sk_live_" : "sk_test_";
  const randomPart = crypto.randomBytes(24).toString("base64url");
  const fullKey = prefix + randomPart;

  return {
    displayKey: fullKey,
    keyPrefix: fullKey.substring(0, 12),
    keyHash: crypto.createHash("sha256").update(fullKey).digest("hex"),
  };
}
```

---

## 6. Webhooks

### 6.1 Webhook Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `order.created` | New order placed | Order object |
| `order.paid` | Payment confirmed | Order + payment |
| `order.fulfilled` | Order shipped | Order + shipment |
| `order.cancelled` | Order cancelled | Order + reason |
| `order.refunded` | Refund issued | Order + refund |
| `product.created` | New product | Product object |
| `product.updated` | Product modified | Product + changes |
| `product.deleted` | Product removed | Product ID |
| `inventory.low_stock` | Stock below threshold | Product + stock |
| `inventory.updated` | Stock changed | Product + old/new |
| `customer.created` | New customer | Customer object |
| `customer.updated` | Customer modified | Customer + changes |

### 6.2 Webhook Payload Format

```json
{
  "id": "evt_abc123xyz",
  "type": "order.created",
  "created": 1706976000,
  "api_version": "2025-01-01",
  "data": {
    "object": {
      "id": "ord_xyz789",
      "order_number": "ORD-2025-001234",
      "total": 9999,
      "currency": "usd",
      "status": "pending",
      "customer": {
        "id": "cus_abc456",
        "email": "customer@example.com"
      },
      "items": [...]
    }
  }
}
```

### 6.3 Webhook Signature Verification

```typescript
// Sign webhook payload
function signWebhookPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

// Verify in receiving application
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  tolerance: number = 300 // 5 minutes
): boolean {
  const parts = Object.fromEntries(
    signature.split(",").map(p => p.split("="))
  );

  const timestamp = parseInt(parts.t);
  const expectedSig = parts.v1;

  // Check timestamp freshness
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) {
    return false;
  }

  // Verify signature
  const computedSig = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSig),
    Buffer.from(computedSig)
  );
}
```

---

## 7. Rate Limiting

### 7.1 Default Limits

| Tier | Requests/Minute | Burst |
|------|-----------------|-------|
| Free | 60 | 10 |
| Standard | 300 | 50 |
| Premium | 1000 | 100 |
| Enterprise | Custom | Custom |

### 7.2 Rate Limit Headers

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 295
X-RateLimit-Reset: 1706976060
```

### 7.3 Rate Limit Exceeded Response

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 30

{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 30 seconds.",
    "retry_after": 30
  }
}
```

---

## 8. API Response Format

### 8.1 Success Response

```json
{
  "data": {
    "id": "prod_abc123",
    "name": "Product Name",
    "price": 2999
  },
  "meta": {
    "request_id": "req_xyz789"
  }
}
```

### 8.2 List Response

```json
{
  "data": [
    { "id": "prod_abc123", "name": "Product 1" },
    { "id": "prod_def456", "name": "Product 2" }
  ],
  "meta": {
    "request_id": "req_xyz789",
    "pagination": {
      "total": 150,
      "page": 1,
      "per_page": 20,
      "total_pages": 8,
      "has_more": true
    }
  }
}
```

### 8.3 Error Response

```json
{
  "error": {
    "code": "resource_not_found",
    "message": "Product not found",
    "details": {
      "product_id": "prod_nonexistent"
    }
  },
  "meta": {
    "request_id": "req_xyz789"
  }
}
```

### 8.4 Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `invalid_request` | 400 | Malformed request |
| `authentication_required` | 401 | Missing or invalid auth |
| `permission_denied` | 403 | Insufficient permissions |
| `resource_not_found` | 404 | Entity doesn't exist |
| `validation_error` | 422 | Invalid input data |
| `rate_limit_exceeded` | 429 | Too many requests |
| `internal_error` | 500 | Server error |

---

## 9. API Implementation (Convex HTTP Routes)

### 9.1 HTTP Router Setup

```typescript
// convex/http.ts
import { httpRouter } from "convex/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Products endpoints
http.route({
  path: "/api/v1/products",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await validateApiKey(ctx, request, ["products:read"]);
    if (!apiKey) return unauthorizedResponse();

    const params = new URL(request.url).searchParams;
    const products = await ctx.runQuery(api.products.list, {
      page: parseInt(params.get("page") || "1"),
      limit: parseInt(params.get("limit") || "20"),
      status: params.get("status") || undefined,
    });

    return jsonResponse({ data: products.items, meta: { pagination: products.pagination }});
  }),
});

http.route({
  path: "/api/v1/products/:id",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await validateApiKey(ctx, request, ["products:read"]);
    if (!apiKey) return unauthorizedResponse();

    const productId = extractPathParam(request.url, "id");
    const product = await ctx.runQuery(api.products.getById, { id: productId });

    if (!product) return notFoundResponse("Product not found");

    return jsonResponse({ data: product });
  }),
});

http.route({
  path: "/api/v1/products",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const apiKey = await validateApiKey(ctx, request, ["products:write"]);
    if (!apiKey) return unauthorizedResponse();

    const body = await request.json();
    const result = await ctx.runMutation(api.products.create, body);

    return jsonResponse({ data: result }, 201);
  }),
});

// Webhook endpoint for receiving external webhooks
http.route({
  path: "/api/webhooks/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signature = request.headers.get("stripe-signature");
    const body = await request.text();

    // Verify and process Stripe webhook
    await ctx.runMutation(internal.payments.handleStripeWebhook, {
      signature,
      payload: body,
    });

    return new Response("OK", { status: 200 });
  }),
});

export default http;
```

### 9.2 API Key Validation

```typescript
// convex/api/auth.ts
async function validateApiKey(
  ctx: ActionCtx,
  request: Request,
  requiredScopes: string[]
): Promise<Doc<"api_keys"> | null> {
  // Extract key from header or query
  let key = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!key) {
    key = new URL(request.url).searchParams.get("api_key") || undefined;
  }

  if (!key) return null;

  // Find key by prefix
  const keyPrefix = key.substring(0, 12);
  const apiKey = await ctx.runQuery(internal.api.getKeyByPrefix, { keyPrefix });

  if (!apiKey || apiKey.status !== "active") return null;

  // Verify hash
  const keyHash = crypto.createHash("sha256").update(key).digest("hex");
  if (keyHash !== apiKey.keyHash) return null;

  // Check expiration
  if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) return null;

  // Check permissions
  if (apiKey.scope !== "full") {
    const hasPermission = requiredScopes.every(
      scope => apiKey.permissions.includes(scope) || apiKey.permissions.includes("admin")
    );
    if (!hasPermission) return null;
  }

  // Check rate limit
  const rateLimitOk = await ctx.runMutation(internal.api.checkRateLimit, {
    apiKeyId: apiKey._id,
  });
  if (!rateLimitOk) return null;

  // Log request
  await ctx.runMutation(internal.api.logRequest, {
    apiKeyId: apiKey._id,
    method: request.method,
    path: new URL(request.url).pathname,
  });

  return apiKey;
}
```

---

## 10. Admin Interface

### 10.1 API Key Management UI

```
┌────────────────────────────────────────────────────────────────┐
│  API Keys                                         [+ New Key]  │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Mobile App                                               │  │
│  │ <masked-api-key>                                     │  │
│  │ Scope: Read Only  |  Rate Limit: 300/min                 │  │
│  │ Created: Jan 15, 2025  |  Last used: 2 hours ago         │  │
│  │ [View Usage] [Edit] [Revoke]                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Warehouse Integration                                    │  │
│  │ sk_live_def4••••••••                                     │  │
│  │ Scope: Custom (orders:write, inventory:write)            │  │
│  │ Created: Jan 10, 2025  |  Last used: 5 minutes ago       │  │
│  │ [View Usage] [Edit] [Revoke]                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 10.2 Webhook Management UI

```
┌────────────────────────────────────────────────────────────────┐
│  Webhooks                                      [+ New Webhook] │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Order Notifications                        ✓ Active      │  │
│  │ https://myapp.com/webhooks/orders                        │  │
│  │ Events: order.created, order.fulfilled                   │  │
│  │ Success rate: 98.5%  |  Last delivery: 5 min ago         │  │
│  │ [Test] [View Deliveries] [Edit] [Pause]                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Inventory Sync                            ⚠️ Failing     │  │
│  │ https://warehouse.com/api/inventory                      │  │
│  │ Events: inventory.updated, inventory.low_stock           │  │
│  │ Success rate: 45%  |  3 consecutive failures             │  │
│  │ [Test] [View Deliveries] [Edit] [Disable]                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. OpenAPI Documentation

### 11.1 Auto-Generated Spec

```yaml
openapi: "3.0.3"
info:
  title: Shopping Cart API
  version: "1.0.0"
  description: Complete REST API for the Shopping Cart platform

servers:
  - url: https://api.store.com/api/v1
    description: Production
  - url: https://api-sandbox.store.com/api/v1
    description: Sandbox

security:
  - apiKey: []

paths:
  /products:
    get:
      summary: List products
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: limit
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        "200":
          description: Success
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ProductListResponse"

components:
  securitySchemes:
    apiKey:
      type: http
      scheme: bearer
  schemas:
    Product:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        price:
          type: integer
          description: Price in cents
```

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] API key generation and storage
- [ ] Key validation middleware
- [ ] Rate limiting implementation
- [ ] Request logging

### Phase 2: Core Endpoints
- [ ] Products CRUD endpoints
- [ ] Orders CRUD endpoints
- [ ] Customers CRUD endpoints
- [ ] Inventory endpoints
- [ ] Cart endpoints

### Phase 3: Webhooks
- [ ] Webhook configuration
- [ ] Event dispatch to webhooks
- [ ] Retry logic
- [ ] Delivery logging

### Phase 4: Polish
- [ ] Admin UI for API keys
- [ ] Admin UI for webhooks
- [ ] OpenAPI documentation
- [ ] Usage analytics dashboard

---

## 13. Security Considerations

### 13.1 Key Security

- Keys shown only once at creation
- Keys stored as hashes, never plaintext
- Revoked keys immediately invalid
- Test/live key separation

### 13.2 Request Security

- HTTPS required for all endpoints
- Webhook signatures verified
- Rate limiting prevents abuse
- Request logging for audit

---

## 14. Future Considerations

- **GraphQL:** Alternative query language
- **SDK Generation:** Auto-generate client libraries
- **API Versioning:** v2 with breaking changes
- **Bulk Operations:** Batch create/update endpoints
- **Real-time:** WebSocket subscriptions

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Authentication System PRD](./PRD-AUTH-SYSTEM.md)
- [Convex HTTP Routes](https://docs.convex.dev/functions/http-actions)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
