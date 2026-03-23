# PRD: Order Management System (ORD-MGT)

## Overview

**System ID:** ORD-MGT
**Category:** Order & Checkout
**Priority:** P0 (Critical Path)
**Complexity:** High
**Status:** Not Started

### Purpose

The Order Management System handles the complete order lifecycle from placement through fulfillment and delivery. It provides real-time order status updates to customers, a live order queue for admins, and integrates with UCP for AI agent order tracking and post-purchase support.

### Convex-Native Value

Traditional order systems rely on polling for status updates and manual refresh for admin dashboards. Our Convex-native approach delivers:

- **Live Order Status** - Customers see status changes instantly without refresh
- **Real-Time Admin Queue** - New orders appear live, statuses update automatically
- **Atomic Status Transitions** - No race conditions on concurrent status updates
- **Cross-Device Sync** - View order on phone, laptop shows same live updates

---

## Dependencies

### Requires

| System | Dependency Type | Purpose |
|--------|-----------------|---------|
| Auth System (USR-ATH) | Hard | User identity for order history |
| Shopping Cart (ORD-CRT) | Hard | Order creation from cart |
| Checkout System (ORD-CHK) | Hard | Order placement trigger |
| Inventory System (BIZ-INV) | Hard | Stock commitment on fulfillment |
| Product Catalog (CAT-PRD) | Soft | Product details in order items |

### Required By

| System | Dependency Type | Purpose |
|--------|-----------------|---------|
| Admin Dashboard (ADM-DSH) | Soft | Order metrics and queue |
| Returns System (ORD-RET) | Hard | Return request handling |
| Review System (ENG-REV) | Soft | Post-delivery review prompts |
| Email Notifications (PLT-EML) | Soft | Order status emails |

---

## Routes

### Customer Routes

| Route | Path | Auth | Description |
|-------|------|------|-------------|
| Order History | `/account/orders` | Required | List of customer's orders |
| Order Detail | `/account/orders/:orderId` | Required | Single order with status timeline |
| Order Tracking | `/track/:trackingToken` | Optional | Public tracking page (no auth) |
| Order Confirmation | `/order/confirmation/:orderId` | Required | Post-checkout confirmation |

### Admin Routes

| Route | Path | Role | Description |
|-------|------|------|-------------|
| Order List | `/dashboard/orders` | Admin | All orders with filters/search |
| Order Detail | `/dashboard/orders/:orderId` | Admin | Full order view with actions |
| Fulfillment Queue | `/dashboard/orders/fulfillment` | Admin | Orders ready to ship |
| Returns Queue | `/dashboard/orders/returns` | Admin | Return requests pending |

---

## Data Model

### Orders Table

```typescript
orders: defineTable({
  // Identity
  orderNumber: v.string(), // Human-readable: "ORD-2026-000001"

  // Customer
  userId: v.id("users"),
  guestEmail: v.optional(v.string()), // For guest checkout

  // Status
  status: v.union(
    v.literal("pending"),        // Payment processing
    v.literal("confirmed"),      // Payment successful
    v.literal("processing"),     // Being prepared
    v.literal("shipped"),        // In transit
    v.literal("delivered"),      // Completed
    v.literal("cancelled"),      // Cancelled
    v.literal("refunded")        // Fully refunded
  ),

  // Addresses (snapshot at time of order)
  shippingAddress: v.object({
    firstName: v.string(),
    lastName: v.string(),
    address1: v.string(),
    address2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
    phone: v.optional(v.string()),
  }),
  billingAddress: v.object({
    firstName: v.string(),
    lastName: v.string(),
    address1: v.string(),
    address2: v.optional(v.string()),
    city: v.string(),
    state: v.string(),
    postalCode: v.string(),
    country: v.string(),
  }),

  // Pricing (all in cents)
  subtotal: v.number(),
  shippingCost: v.number(),
  taxAmount: v.number(),
  discountAmount: v.number(),
  total: v.number(),
  currency: v.string(), // "USD"

  // Shipping
  shippingMethod: v.string(),
  shippingCarrier: v.optional(v.string()),
  trackingNumber: v.optional(v.string()),
  trackingUrl: v.optional(v.string()),
  estimatedDelivery: v.optional(v.number()),

  // Payment
  paymentMethod: v.string(),
  paymentIntentId: v.optional(v.string()),
  paymentStatus: v.union(
    v.literal("pending"),
    v.literal("authorized"),
    v.literal("captured"),
    v.literal("failed"),
    v.literal("refunded"),
    v.literal("partially_refunded")
  ),

  // Coupons
  couponCode: v.optional(v.string()),
  couponDiscount: v.optional(v.number()),

  // Metadata
  notes: v.optional(v.string()), // Customer order notes
  adminNotes: v.optional(v.string()), // Internal notes
  source: v.union(
    v.literal("web"),
    v.literal("mobile"),
    v.literal("ucp"),    // AI agent purchase
    v.literal("mcp"),    // MCP tool purchase
    v.literal("admin")   // Manual order
  ),
  agentId: v.optional(v.string()), // For UCP/MCP orders

  // Tracking token for public access
  trackingToken: v.string(),

  // Timestamps
  placedAt: v.number(),
  confirmedAt: v.optional(v.number()),
  processedAt: v.optional(v.number()),
  shippedAt: v.optional(v.number()),
  deliveredAt: v.optional(v.number()),
  cancelledAt: v.optional(v.number()),

  // UCP Integration
  ucpSessionId: v.optional(v.string()),
  ucpMerchantOrderRef: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_order_number", ["orderNumber"])
  .index("by_status", ["status"])
  .index("by_tracking_token", ["trackingToken"])
  .index("by_placed_at", ["placedAt"])
  .index("by_ucp_session", ["ucpSessionId"])
```

### Order Items Table

```typescript
orderItems: defineTable({
  orderId: v.id("orders"),

  // Product reference
  productId: v.id("products"),
  variantId: v.optional(v.id("productVariants")),
  sku: v.string(),

  // Snapshot at time of order (products can change)
  productName: v.string(),
  variantName: v.optional(v.string()),
  productImage: v.optional(v.string()),

  // Pricing
  unitPrice: v.number(), // Price per unit at time of order
  quantity: v.number(),
  totalPrice: v.number(), // unitPrice * quantity

  // Fulfillment
  fulfilledQuantity: v.number(), // For partial fulfillment
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("shipped"),
    v.literal("delivered"),
    v.literal("cancelled"),
    v.literal("returned")
  ),
})
  .index("by_order", ["orderId"])
  .index("by_product", ["productId"])
```

### Order History Table (Status Timeline)

```typescript
orderHistory: defineTable({
  orderId: v.id("orders"),

  // Status change
  fromStatus: v.optional(v.string()),
  toStatus: v.string(),

  // Actor
  actorType: v.union(
    v.literal("system"),
    v.literal("customer"),
    v.literal("admin"),
    v.literal("agent")
  ),
  actorId: v.optional(v.string()), // userId or agentId

  // Details
  note: v.optional(v.string()),
  metadata: v.optional(v.string()), // JSON for extra data

  timestamp: v.number(),
})
  .index("by_order", ["orderId"])
  .index("by_timestamp", ["timestamp"])
```

### Order Returns Table

```typescript
orderReturns: defineTable({
  orderId: v.id("orders"),

  // Request
  reason: v.string(),
  reasonCategory: v.union(
    v.literal("damaged"),
    v.literal("wrong_item"),
    v.literal("not_as_described"),
    v.literal("no_longer_needed"),
    v.literal("other")
  ),

  // Items
  items: v.array(v.object({
    orderItemId: v.id("orderItems"),
    quantity: v.number(),
  })),

  // Status
  status: v.union(
    v.literal("requested"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("shipped_back"),
    v.literal("received"),
    v.literal("refunded")
  ),

  // Refund
  refundAmount: v.optional(v.number()),
  refundedAt: v.optional(v.number()),

  // Timestamps
  requestedAt: v.number(),
  processedAt: v.optional(v.number()),
  processedBy: v.optional(v.id("users")),

  notes: v.optional(v.string()),
})
  .index("by_order", ["orderId"])
  .index("by_status", ["status"])
```

---

## Actions

### Customer Actions

| Action | Code | Description | Triggers Event |
|--------|------|-------------|----------------|
| View Order | `order.view` | View order details | `order.viewed` |
| Track Order | `order.track` | View tracking status | `order.tracked` |
| Request Cancel | `order.request_cancel` | Request order cancellation | `order.cancel_requested` |
| Request Return | `order.request_return` | Initiate return process | `return.requested` |
| Download Invoice | `order.download_invoice` | Download PDF invoice | `order.invoice_downloaded` |

### Admin Actions

| Action | Code | Description | Triggers Event |
|--------|------|-------------|----------------|
| Update Status | `order.update_status` | Change order status | `order.status_updated` |
| Add Tracking | `order.add_tracking` | Add shipping tracking | `order.tracking_added` |
| Mark Shipped | `order.mark_shipped` | Mark as shipped | `order.shipped` |
| Mark Delivered | `order.mark_delivered` | Mark as delivered | `order.delivered` |
| Cancel Order | `order.cancel` | Cancel order | `order.cancelled` |
| Approve Return | `return.approve` | Approve return request | `return.approved` |
| Reject Return | `return.reject` | Reject return request | `return.rejected` |
| Process Refund | `order.refund` | Issue refund | `order.refunded` |
| Add Note | `order.add_note` | Add admin note | `order.note_added` |

---

## Events

### Order Events

| Event | Code | Payload | Triggers |
|-------|------|---------|----------|
| Order Placed | `order.placed` | `{ orderId, orderNumber, total, userId }` | Email, Analytics |
| Order Confirmed | `order.confirmed` | `{ orderId, orderNumber }` | Email, Inventory commit |
| Order Processing | `order.processing` | `{ orderId, orderNumber }` | - |
| Order Shipped | `order.shipped` | `{ orderId, trackingNumber, carrier }` | Email, SMS |
| Order Delivered | `order.delivered` | `{ orderId, deliveredAt }` | Email, Review prompt |
| Order Cancelled | `order.cancelled` | `{ orderId, reason, cancelledBy }` | Email, Inventory release |
| Order Refunded | `order.refunded` | `{ orderId, refundAmount }` | Email |

### Return Events

| Event | Code | Payload | Triggers |
|-------|------|---------|----------|
| Return Requested | `return.requested` | `{ orderId, returnId, items }` | Admin notification |
| Return Approved | `return.approved` | `{ returnId, instructions }` | Email with return label |
| Return Rejected | `return.rejected` | `{ returnId, reason }` | Email |
| Return Received | `return.received` | `{ returnId }` | Process refund |
| Return Refunded | `return.refunded` | `{ returnId, refundAmount }` | Email |

---

## Notifications

### Email Notifications

| Notification | Trigger | Recipient | Template |
|--------------|---------|-----------|----------|
| Order Confirmation | `order.confirmed` | Customer | `order-confirmation` |
| Order Shipped | `order.shipped` | Customer | `order-shipped` |
| Order Delivered | `order.delivered` | Customer | `order-delivered` |
| Order Cancelled | `order.cancelled` | Customer | `order-cancelled` |
| Refund Processed | `order.refunded` | Customer | `order-refunded` |
| Return Approved | `return.approved` | Customer | `return-approved` |
| Return Rejected | `return.rejected` | Customer | `return-rejected` |

### Site Notifications

| Notification | Trigger | Recipient | Type |
|--------------|---------|-----------|------|
| Order Shipped | `order.shipped` | Customer | Success |
| Order Delivered | `order.delivered` | Customer | Success |
| Return Update | `return.*` | Customer | Info |
| New Order | `order.placed` | Admin | Persistent |
| Return Request | `return.requested` | Admin | Persistent |

---

## Real-Time Patterns

### Live Order Status (Customer)

```typescript
// Customer sees live status updates
function OrderStatusTracker({ orderId }: { orderId: Id<"orders"> }) {
  // Real-time subscription - status updates instantly
  const order = useQuery(api.orders.get, { orderId });
  const history = useQuery(api.orders.getHistory, { orderId });

  if (order === undefined) return <Skeleton />;

  return (
    <div>
      <StatusBadge status={order.status} />
      <StatusTimeline history={history ?? []} />
      {order.trackingUrl && (
        <TrackingLink
          url={order.trackingUrl}
          carrier={order.shippingCarrier}
        />
      )}
    </div>
  );
}
```

### Real-Time Admin Order Queue

```typescript
// Orders appear live as they're placed
function AdminOrderQueue() {
  const orders = useQuery(api.admin.orders.list, {
    status: "confirmed",
    limit: 50,
  });

  // New orders just appear - no refresh needed
  if (orders === undefined) return <LoadingTable />;

  return (
    <DataTable
      data={orders}
      columns={orderColumns}
      onRowClick={(order) => navigate({ to: `/dashboard/orders/${order._id}` })}
    />
  );
}
```

### Live Order Count Badge

```typescript
// Real-time pending order count in nav
function PendingOrdersBadge() {
  const count = useQuery(api.admin.orders.getPendingCount);

  if (!count) return null;

  return (
    <Badge variant="destructive">{count}</Badge>
  );
}
```

---

## Convex Functions

### Order Queries

```typescript
// Get order with items
export const get = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const order = await ctx.db.get(args.orderId);

    if (!order) return null;

    // Authorization: customer can only see their orders
    if (!identity?.isAdmin && order.userId !== identity?.subject) {
      throw new Error("Unauthorized");
    }

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return { ...order, items };
  },
});

// Get order by tracking token (public)
export const getByTrackingToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("orders")
      .withIndex("by_tracking_token", (q) => q.eq("trackingToken", args.token))
      .unique();

    if (!order) return null;

    // Return limited info for public tracking
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      shippingCarrier: order.shippingCarrier,
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl,
      estimatedDelivery: order.estimatedDelivery,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
    };
  },
});

// Get customer's orders
export const listMine = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const limit = args.limit ?? 20;

    let query = ctx.db
      .query("orders")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject));

    const orders = await query.order("desc").take(limit);

    return orders;
  },
});

// Get order status history
export const getHistory = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orderHistory")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .order("asc")
      .collect();
  },
});
```

### Order Mutations

```typescript
// Update order status (admin)
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const previousStatus = order.status;
    const now = Date.now();

    // Update order
    const updates: Partial<typeof order> = { status: args.status as any };

    // Set timestamp based on status
    switch (args.status) {
      case "confirmed": updates.confirmedAt = now; break;
      case "processing": updates.processedAt = now; break;
      case "shipped": updates.shippedAt = now; break;
      case "delivered": updates.deliveredAt = now; break;
      case "cancelled": updates.cancelledAt = now; break;
    }

    await ctx.db.patch(args.orderId, updates);

    // Record history
    await ctx.db.insert("orderHistory", {
      orderId: args.orderId,
      fromStatus: previousStatus,
      toStatus: args.status,
      actorType: "admin",
      actorId: identity.subject,
      note: args.note,
      timestamp: now,
    });

    // Emit event
    await ctx.scheduler.runAfter(0, internal.events.emit, {
      type: `order.${args.status}`,
      payload: {
        orderId: args.orderId,
        orderNumber: order.orderNumber,
        previousStatus,
        userId: order.userId,
      },
    });

    return { success: true };
  },
});

// Add tracking information
export const addTracking = mutation({
  args: {
    orderId: v.id("orders"),
    carrier: v.string(),
    trackingNumber: v.string(),
    trackingUrl: v.optional(v.string()),
    estimatedDelivery: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    await ctx.db.patch(args.orderId, {
      shippingCarrier: args.carrier,
      trackingNumber: args.trackingNumber,
      trackingUrl: args.trackingUrl,
      estimatedDelivery: args.estimatedDelivery,
    });

    // Record history
    await ctx.db.insert("orderHistory", {
      orderId: args.orderId,
      fromStatus: order.status,
      toStatus: order.status,
      actorType: "admin",
      actorId: identity.subject,
      note: `Tracking added: ${args.carrier} ${args.trackingNumber}`,
      timestamp: Date.now(),
    });

    // Emit event
    await ctx.scheduler.runAfter(0, internal.events.emit, {
      type: "order.tracking_added",
      payload: {
        orderId: args.orderId,
        orderNumber: order.orderNumber,
        carrier: args.carrier,
        trackingNumber: args.trackingNumber,
        userId: order.userId,
      },
    });

    return { success: true };
  },
});

// Request return (customer)
export const requestReturn = mutation({
  args: {
    orderId: v.id("orders"),
    reason: v.string(),
    reasonCategory: v.string(),
    items: v.array(v.object({
      orderItemId: v.id("orderItems"),
      quantity: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    // Verify ownership
    if (order.userId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Verify order is delivered
    if (order.status !== "delivered") {
      throw new Error("Can only return delivered orders");
    }

    // Create return request
    const returnId = await ctx.db.insert("orderReturns", {
      orderId: args.orderId,
      reason: args.reason,
      reasonCategory: args.reasonCategory as any,
      items: args.items,
      status: "requested",
      requestedAt: Date.now(),
    });

    // Emit event
    await ctx.scheduler.runAfter(0, internal.events.emit, {
      type: "return.requested",
      payload: {
        orderId: args.orderId,
        returnId,
        orderNumber: order.orderNumber,
        userId: order.userId,
      },
    });

    return { returnId };
  },
});
```

### Admin Order Queries

```typescript
// List orders with filters
export const list = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    let orders = await ctx.db
      .query("orders")
      .withIndex("by_placed_at")
      .order("desc")
      .take(args.limit ?? 50);

    // Apply filters
    if (args.status) {
      orders = orders.filter((o) => o.status === args.status);
    }

    if (args.search) {
      const search = args.search.toLowerCase();
      orders = orders.filter((o) =>
        o.orderNumber.toLowerCase().includes(search) ||
        o.guestEmail?.toLowerCase().includes(search)
      );
    }

    if (args.dateFrom) {
      orders = orders.filter((o) => o.placedAt >= args.dateFrom!);
    }

    if (args.dateTo) {
      orders = orders.filter((o) => o.placedAt <= args.dateTo!);
    }

    return orders;
  },
});

// Get pending order count
export const getPendingCount = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) return 0;

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .collect();

    return orders.length;
  },
});

// Get fulfillment queue
export const getFulfillmentQueue = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .order("asc")
      .collect();

    // Include items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const items = await ctx.db
          .query("orderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .collect();
        return { ...order, items };
      })
    );

    return ordersWithItems;
  },
});
```

---

## UCP Integration

### Order Tracking via UCP

```typescript
// POST /api/ucp/orders/:orderId/status
export async function ucpGetOrderStatus(orderId: string) {
  const order = await ctx.db.get(orderId as Id<"orders">);

  if (!order) {
    return { error: "Order not found" };
  }

  // UCP standard order status response
  return {
    merchant_order_ref: order.orderNumber,
    status: mapToUcpStatus(order.status),
    created_at: new Date(order.placedAt).toISOString(),
    updated_at: new Date(order.confirmedAt ?? order.placedAt).toISOString(),
    fulfillment: order.shippedAt ? {
      status: order.deliveredAt ? "DELIVERED" : "SHIPPED",
      carrier: order.shippingCarrier,
      tracking_number: order.trackingNumber,
      tracking_url: order.trackingUrl,
      estimated_delivery: order.estimatedDelivery
        ? new Date(order.estimatedDelivery).toISOString()
        : null,
    } : null,
    line_items: await getOrderItems(order._id),
    totals: {
      subtotal: { amount: order.subtotal, currency: order.currency },
      shipping: { amount: order.shippingCost, currency: order.currency },
      tax: { amount: order.taxAmount, currency: order.currency },
      discount: { amount: order.discountAmount, currency: order.currency },
      total: { amount: order.total, currency: order.currency },
    },
  };
}

// Map internal status to UCP status
function mapToUcpStatus(status: string): string {
  const mapping: Record<string, string> = {
    pending: "PENDING",
    confirmed: "CONFIRMED",
    processing: "PROCESSING",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    refunded: "REFUNDED",
  };
  return mapping[status] ?? "UNKNOWN";
}
```

### UCP Fulfillment Webhooks

```typescript
// POST /api/ucp/webhooks/fulfillment
export async function ucpFulfillmentWebhook(event: UcpFulfillmentEvent) {
  switch (event.type) {
    case "shipment.created":
      await addTracking({
        orderId: event.merchant_order_ref,
        carrier: event.carrier,
        trackingNumber: event.tracking_number,
        trackingUrl: event.tracking_url,
      });
      break;

    case "shipment.delivered":
      await updateStatus({
        orderId: event.merchant_order_ref,
        status: "delivered",
        note: "Marked delivered via UCP",
      });
      break;
  }

  return { received: true };
}
```

---

## MCP Integration

### MCP Tools

```typescript
// Get order details
export const getOrder: MCPTool = {
  name: "get_order",
  description: "Get full order details including items and status",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "Order ID" },
      orderNumber: { type: "string", description: "Order number (alternative)" },
    },
  },
  handler: async ({ orderId, orderNumber }) => {
    // Implementation
  },
};

// Get order status
export const getOrderStatus: MCPTool = {
  name: "get_order_status",
  description: "Get current order status and tracking info",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string" },
    },
    required: ["orderId"],
  },
  handler: async ({ orderId }) => {
    const order = await getOrder(orderId);
    return {
      status: order.status,
      tracking: order.trackingNumber ? {
        carrier: order.shippingCarrier,
        number: order.trackingNumber,
        url: order.trackingUrl,
      } : null,
      estimatedDelivery: order.estimatedDelivery,
      timeline: await getOrderHistory(orderId),
    };
  },
};

// List orders
export const listOrders: MCPTool = {
  name: "list_orders",
  description: "List orders with optional filters",
  parameters: {
    type: "object",
    properties: {
      userId: { type: "string" },
      status: { type: "string" },
      limit: { type: "number", default: 10 },
    },
  },
  handler: async ({ userId, status, limit }) => {
    // Implementation
  },
};

// Cancel order
export const cancelOrder: MCPTool = {
  name: "cancel_order",
  description: "Request order cancellation (if eligible)",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      reason: { type: "string" },
    },
    required: ["orderId"],
  },
  handler: async ({ orderId, reason }) => {
    // Implementation with eligibility check
  },
};

// Request return
export const requestReturnMCP: MCPTool = {
  name: "request_return",
  description: "Initiate a return request for delivered order",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            orderItemId: { type: "string" },
            quantity: { type: "number" },
          },
        },
      },
      reason: { type: "string" },
    },
    required: ["orderId", "reason"],
  },
  handler: async ({ orderId, items, reason }) => {
    // Implementation
  },
};
```

### MCP Resources

```typescript
// Order resource
// order://{orderId}
{
  uri: `order://${orderId}`,
  name: `Order ${order.orderNumber}`,
  mimeType: "application/json",
  description: `Order placed ${formatDate(order.placedAt)}`,
}

// Order tracking resource
// order://{orderId}/tracking
{
  uri: `order://${orderId}/tracking`,
  name: `Tracking for ${order.orderNumber}`,
  mimeType: "application/json",
}

// User's order history
// orders://user/{userId}
{
  uri: `orders://user/${userId}`,
  name: `Orders for user`,
  mimeType: "application/json",
}
```

---

## Security

### Authorization Rules

| Resource | Customer | Guest | Admin |
|----------|----------|-------|-------|
| View own orders | ✅ | Via token | ✅ |
| View any order | ❌ | ❌ | ✅ |
| Update status | ❌ | ❌ | ✅ |
| Cancel order | Own only | ❌ | ✅ |
| Request return | Own only | ❌ | ✅ |
| View tracking | Own only | Via token | ✅ |

### Data Protection

- **Address data** - Encrypted at rest, PII handling compliant
- **Payment info** - Only tokens stored, no raw card data
- **Tracking tokens** - Cryptographically random, single-use
- **Guest orders** - Linked by email, can claim post-registration

---

## Business Rules

### Order Status Flow

```
pending → confirmed → processing → shipped → delivered
    ↓         ↓            ↓           ↓
cancelled  cancelled   cancelled    returned
                                      ↓
                                   refunded
```

### Cancellation Rules

| Status | Can Cancel | By Customer | By Admin |
|--------|------------|-------------|----------|
| pending | ✅ | ✅ | ✅ |
| confirmed | ✅ | ✅ (request) | ✅ |
| processing | ⚠️ | Request only | ✅ |
| shipped | ❌ | ❌ | ❌ |
| delivered | ❌ | ❌ | ❌ |

### Return Rules

- Returns allowed within 30 days of delivery
- Items must be in original condition
- Return shipping may be customer responsibility
- Partial returns supported
- Refund to original payment method

---

## UI Components

### Customer Components

```
components/orders/
├── OrderCard.tsx            # Order summary card
├── OrderDetail.tsx          # Full order view
├── OrderTimeline.tsx        # Status timeline
├── OrderItems.tsx           # Line items list
├── TrackingInfo.tsx         # Shipping tracking
├── ReturnRequestForm.tsx    # Return initiation
└── OrderHistoryList.tsx     # Order list page
```

### Admin Components

```
components/admin/orders/
├── OrderTable.tsx           # Data table with actions
├── OrderFilters.tsx         # Status/date filters
├── OrderDetailPanel.tsx     # Side panel view
├── StatusUpdateDialog.tsx   # Change status modal
├── TrackingForm.tsx         # Add tracking form
├── FulfillmentQueue.tsx     # Ready to ship list
├── ReturnRequestCard.tsx    # Return review card
└── OrderMetrics.tsx         # Quick stats cards
```

---

## Testing Requirements

### Unit Tests

- Order status transitions
- Authorization checks
- Return eligibility validation
- Tracking token generation

### Integration Tests

- Full order lifecycle flow
- UCP endpoint responses
- MCP tool invocations
- Email notification triggers

### E2E Tests

- Customer order history journey
- Admin fulfillment workflow
- Return request process
- Public tracking page

---

## Implementation Checklist

### Phase 1: Core Order Management
- [ ] Order schema and tables
- [ ] Order creation from checkout
- [ ] Customer order history page
- [ ] Order detail page with timeline
- [ ] Basic status tracking

### Phase 2: Admin Features
- [ ] Admin order list with filters
- [ ] Status update functionality
- [ ] Tracking number management
- [ ] Admin notes

### Phase 3: Fulfillment
- [ ] Fulfillment queue view
- [ ] Bulk status updates
- [ ] Packing slip generation
- [ ] Shipping label integration

### Phase 4: Returns
- [ ] Return request form
- [ ] Return approval workflow
- [ ] Refund processing
- [ ] Inventory return handling

### Phase 5: UCP/MCP Integration
- [ ] UCP order status endpoint
- [ ] UCP fulfillment webhooks
- [ ] MCP order tools
- [ ] MCP order resources

### Phase 6: Notifications
- [ ] Order confirmation email
- [ ] Shipping notification
- [ ] Delivery confirmation
- [ ] Return status updates

---

## Metrics & Analytics

### Key Metrics to Track

- **Order volume** - Orders per day/week/month
- **Average order value** - Total revenue / orders
- **Fulfillment time** - Confirmed → Shipped duration
- **Delivery rate** - Shipped → Delivered success %
- **Return rate** - Returns / delivered orders
- **Cancellation rate** - Cancelled / total orders

### Real-Time Dashboard Data

```typescript
export const getDashboardMetrics = query({
  handler: async (ctx) => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const orders = await ctx.db.query("orders").collect();
    const recentOrders = orders.filter((o) => o.placedAt > dayAgo);

    return {
      totalOrders: orders.length,
      ordersToday: recentOrders.length,
      revenueToday: recentOrders.reduce((sum, o) => sum + o.total, 0),
      pendingFulfillment: orders.filter((o) => o.status === "processing").length,
      pendingReturns: await getPendingReturnCount(ctx),
    };
  },
});
```

---

**Last Updated:** January 30, 2026
**Next Review:** Before MVP launch
