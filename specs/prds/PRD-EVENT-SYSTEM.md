# PRD: Event System

> **System Code:** PLT-EVT
> **Phase:** 0 (Foundation)
> **Priority:** P0 - Critical
> **Complexity:** Complex
> **Category:** Platform Infrastructure
> **Layer:** Backend

---

## 1. Overview

### 1.1 Purpose

The Event System is the **central nervous system** of the entire e-commerce platform. Every significant action across all 27 systems flows through this dispatcher. When a customer places an order, the Event System fires `order.placed`, which triggers:
- Order confirmation email to customer
- New order notification to admin
- In-app notification to customer
- Inventory decrement
- Analytics tracking
- Audit logging

Without the Event System, each system would need direct integrations with every other system. With it, systems simply emit events and let listeners handle the consequences.

### 1.2 Scope

**In Scope:**
- Central `dispatchEvent()` function for all event emission
- Event type registry (62 event types across all systems)
- Event listener management (subscribe/unsubscribe)
- Event logging for audit trail
- Event history viewer in admin
- Retry mechanism for failed event handlers
- Event payload validation
- Integration with Email Notification System
- Integration with Site Notification System
- Integration with future Analytics System

**Out of Scope:**
- The notification systems themselves (separate PRDs)
- Business logic of event handlers (defined in respective system PRDs)
- Real-time WebSocket push (handled by Convex subscriptions)

### 1.3 Why This Matters

This PRD is informed by the **complete mapping of all 62 events** across every system. We know exactly:
- Every event that will ever be dispatched
- Every email that will be triggered
- Every notification that will be created
- The payload schema for each event

This allows us to build the Event System correctly from day one, not retrofit it later.

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Authentication System | PLT-AUT | 0 | Events must know who triggered them (userId) |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Email Notification System | COM-EML | 1 | Listens to events, sends emails |
| Site Notification System | COM-NOT | 1 | Listens to events, creates notifications |
| Testing & Debug Tools | ADM-TST | 6 | Manual event triggering for testing |
| *All other systems* | * | * | All systems emit events through this |

### 2.3 Integration Hooks to Implement

1. **`dispatchEvent()`** - The core function all systems call
2. **`registerListener()`** - For systems to subscribe to event types
3. **`getEventLog()`** - For admin event history viewer
4. **Event Type Registry** - Enumeration of all valid event types

---

## 3. Complete Event Registry

> **Source:** Airtable Events table
> **Total Events:** 62

### 3.1 Events by Category

#### User & Auth Events (10)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `user.registered` | User Registered | Customer signup | `{ userId, email, name? }` |
| `user.logged_in` | User Logged In | Customer login | `{ userId, email, method, ipAddress? }` |
| `user.logged_out` | User Logged Out | Customer logout | `{ userId, email }` |
| `user.password_reset_requested` | Password Reset Requested | Forgot password | `{ userId, email, resetToken }` |
| `user.password_changed` | Password Changed | Password update | `{ userId, email }` |
| `user.email_changed` | Email Changed | Email update | `{ userId, oldEmail, newEmail }` |
| `user.profile_updated` | Profile Updated | Profile edit | `{ userId, email, changedFields[] }` |
| `user.address_added` | Address Added | Add address | `{ userId, addressId, type }` |
| `user.account_deactivated` | Account Deactivated | Deactivate | `{ userId, email, reason? }` |
| `user.account_deleted` | Account Deleted | GDPR deletion | `{ userId, email, deletedAt }` |

#### Cart Events (5)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `cart.item_added` | Item Added to Cart | Add to cart | `{ cartId, productId, variantId?, quantity, customerId? }` |
| `cart.item_removed` | Item Removed from Cart | Remove item | `{ cartId, productId, variantId?, customerId? }` |
| `cart.updated` | Cart Updated | Quantity change | `{ cartId, changes[], customerId? }` |
| `cart.cleared` | Cart Cleared | Clear cart | `{ cartId, customerId?, itemCount }` |
| `cart.abandoned` | Cart Abandoned | Timeout trigger | `{ cartId, customerId?, email?, items[], total }` |

#### Checkout Events (6)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `checkout.started` | Checkout Started | Begin checkout | `{ checkoutId, cartId, customerId?, itemCount, total }` |
| `checkout.step_completed` | Checkout Step Completed | Step navigation | `{ checkoutId, step, customerId? }` |
| `checkout.shipping_selected` | Shipping Address Selected | Address entry | `{ checkoutId, addressId?, isNewAddress, customerId? }` |
| `checkout.shipping_method_selected` | Shipping Method Selected | Method selection | `{ checkoutId, shippingMethodId, rate, customerId? }` |
| `checkout.abandoned` | Checkout Abandoned | Timeout trigger | `{ checkoutId, lastStep, customerId?, email?, total }` |

#### Order Events (8)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `order.placed` | Order Placed | Complete checkout | `{ orderId, customerId?, email, items[], total, shippingAddress }` |
| `order.confirmed` | Order Confirmed | Payment confirmed | `{ orderId, customerId?, email }` |
| `order.processing` | Order Processing | Status change | `{ orderId, customerId?, email }` |
| `order.shipped` | Order Shipped | Mark shipped | `{ orderId, customerId?, email, trackingNumber, carrier }` |
| `order.delivered` | Order Delivered | Mark delivered | `{ orderId, customerId?, email }` |
| `order.cancelled` | Order Cancelled | Cancel order | `{ orderId, customerId?, email, reason, cancelledBy }` |
| `order.on_hold` | Order On Hold | Hold order | `{ orderId, customerId?, email, reason }` |

#### Payment Events (5)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `payment.initiated` | Payment Initiated | Start payment | `{ orderId, amount, method, customerId? }` |
| `payment.completed` | Payment Completed | Payment success | `{ orderId, paymentIntentId, amount, customerId? }` |
| `payment.failed` | Payment Failed | Payment failure | `{ orderId, error, customerId?, email }` |
| `payment.refunded` | Refund Issued | Process refund | `{ orderId, refundId, amount, customerId?, email }` |
| `payment.method_saved` | Payment Method Saved | Save card | `{ customerId, paymentMethodId, type, last4 }` |

#### Inventory Events (4)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `inventory.low_stock` | Low Stock Alert | Stock threshold | `{ productId, productName, currentStock, threshold }` |
| `inventory.out_of_stock` | Out of Stock | Stock depleted | `{ productId, productName }` |
| `inventory.back_in_stock` | Back in Stock | Restocked | `{ productId, productName, currentStock }` |
| `inventory.adjusted` | Inventory Adjusted | Manual adjustment | `{ productId, variantId?, adjustment, newStock, reason, adjustedBy }` |

#### Product Events (6)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `product.created` | Product Created | Create product | `{ productId, name, sku, createdBy }` |
| `product.updated` | Product Updated | Edit product | `{ productId, changedFields[], updatedBy }` |
| `product.published` | Product Published | Publish | `{ productId, name, publishedBy }` |
| `product.unpublished` | Product Unpublished | Unpublish | `{ productId, name, unpublishedBy, reason? }` |
| `product.deleted` | Product Deleted | Delete | `{ productId, name, deletedBy }` |
| `product.price_changed` | Product Price Changed | Price update | `{ productId, name, oldPrice, newPrice, changedBy }` |

#### Shipping Events (4)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `shipping.label_created` | Shipping Label Created | Generate label | `{ orderId, trackingNumber, carrier, labelUrl }` |
| `shipping.tracking_updated` | Tracking Updated | Carrier webhook | `{ orderId, trackingNumber, status, location?, timestamp }` |
| `shipping.delivery_exception` | Delivery Exception | Carrier webhook | `{ orderId, trackingNumber, exceptionType, details }` |

#### Review Events (4)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `review.submitted` | Review Submitted | Submit review | `{ reviewId, productId, customerId, rating, text }` |
| `review.approved` | Review Approved | Admin approve | `{ reviewId, productId, customerId }` |
| `review.rejected` | Review Rejected | Admin reject | `{ reviewId, productId, customerId, reason }` |
| `review.reported` | Review Reported | User report | `{ reviewId, reportedBy, reason }` |

#### Support Events (5)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `support.ticket_created` | Ticket Created | Create ticket | `{ ticketId, customerId?, email, subject, message }` |
| `support.ticket_reply` | Ticket Reply Received | Staff reply | `{ ticketId, customerId?, email, message }` |
| `support.ticket_assigned` | Ticket Assigned | Assign ticket | `{ ticketId, assignedTo, assignedBy }` |
| `support.ticket_resolved` | Ticket Resolved | Mark resolved | `{ ticketId, customerId?, email, resolvedBy }` |
| `support.ticket_closed` | Ticket Closed | Close ticket | `{ ticketId, customerId?, email, closedBy }` |

#### Return Events (4)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `return.requested` | Return Requested | Request return | `{ returnId, orderId, customerId, email, reason, items[] }` |
| `return.approved` | Return Approved | Admin approve | `{ returnId, orderId, customerId, email }` |
| `return.denied` | Return Denied | Admin deny | `{ returnId, orderId, customerId, email, reason }` |

#### Wishlist Events (3)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `wishlist.item_added` | Item Added to Wishlist | Add item | `{ wishlistId, productId, customerId }` |
| `wishlist.item_removed` | Item Removed from Wishlist | Remove item | `{ wishlistId, productId, customerId }` |
| `wishlist.shared` | Wishlist Shared | Share wishlist | `{ wishlistId, customerId, sharedWith[], method }` |

#### Coupon Events (4)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `coupon.created` | Coupon Created | Create coupon | `{ discountId, code, type, value, createdBy }` |
| `coupon.applied` | Coupon Applied | Apply coupon | `{ cartId, couponCode, discountId, discountAmount, customerId? }` |
| `coupon.failed` | Coupon Failed | Invalid coupon | `{ cartId, couponCode, reason, customerId? }` |
| `coupon.expired` | Coupon Expired | Expiration | `{ discountId, code, usageCount }` |

#### Admin Events (5)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `admin.logged_in` | Admin Logged In | Admin login | `{ adminId, email, ipAddress? }` |
| `admin.settings_changed` | Settings Changed | Update settings | `{ adminId, settingKey, oldValue, newValue }` |
| `admin.bulk_action` | Bulk Action Performed | Bulk operation | `{ adminId, action, entityType, count, ids[] }` |
| `admin.data_exported` | Data Exported | Export data | `{ adminId, exportType, recordCount, format }` |
| `admin.user_role_changed` | User Role Changed | Change role | `{ adminId, userId, oldRole, newRole }` |

#### System Events (2)

| Event Code | Name | Triggered By | Payload |
|------------|------|--------------|---------|
| `system.sync_completed` | Sync Completed | Airtable sync | `{ syncType, recordsProcessed, duration }` |
| `system.sync_failed` | Sync Failed | Sync failure | `{ syncType, error }` |

---

## 4. Event-to-Notification Mapping

> This is the complete mapping of which events trigger which notifications.
> The Event System uses this to route events to the correct notification handlers.

### 4.1 Events → Email Notifications

| Event Code | Email Notification | Recipient | Priority |
|------------|-------------------|-----------|----------|
| `user.registered` | Welcome Email | Customer | Immediate |
| `user.password_reset_requested` | Password Reset | Customer | Immediate |
| `user.password_changed` | Password Changed Notification | Customer | Immediate |
| `user.email_changed` | Email Change Confirmation | Customer (new) | Immediate |
| `user.email_changed` | Email Change Notification | Customer (old) | Immediate |
| `user.account_deactivated` | Account Deactivated | Customer | Immediate |
| `user.account_deleted` | Account Deleted | Customer | Immediate |
| `cart.abandoned` | Abandoned Cart Reminder | Customer | Batched |
| `checkout.abandoned` | Checkout Abandoned Reminder | Customer | Immediate |
| `order.placed` | Order Confirmation | Customer | Immediate |
| `order.placed` | New Order (Admin) | Admin | Immediate |
| `order.confirmed` | Order Confirmed | Customer | Immediate |
| `order.processing` | Order Processing | Customer | Immediate |
| `order.shipped` | Shipping Notification | Customer | Immediate |
| `order.delivered` | Delivery Confirmation | Customer | Immediate |
| `order.delivered` | Review Request | Customer | Batched |
| `order.cancelled` | Order Cancelled | Customer | Immediate |
| `order.on_hold` | Order On Hold | Customer | Immediate |
| `payment.completed` | Payment Received | Customer | Immediate |
| `payment.failed` | Payment Failed | Customer | Immediate |
| `payment.refunded` | Refund Processed | Customer | Immediate |
| `inventory.low_stock` | Low Stock Alert (Admin) | Admin | Batched |
| `inventory.out_of_stock` | Out of Stock Alert (Admin) | Admin | Immediate |
| `inventory.back_in_stock` | Back in Stock Notification | Customer | Immediate |
| `product.price_changed` | Price Drop Alert | Customer | Batched |
| `shipping.tracking_updated` | Tracking Update | Customer | Immediate |
| `shipping.delivery_exception` | Delivery Exception Alert | Customer | Immediate |
| `review.submitted` | New Review (Admin) | Admin | Batched |
| `review.approved` | Review Published | Customer | Batched |
| `review.rejected` | Review Rejected | Customer | Batched |
| `review.reported` | Review Reported (Admin) | Admin | Batched |
| `support.ticket_created` | Support Ticket Confirmation | Customer | Immediate |
| `support.ticket_created` | New Support Ticket (Admin) | Admin | Immediate |
| `support.ticket_reply` | Support Ticket Reply | Customer | Immediate |
| `support.ticket_resolved` | Ticket Resolved | Customer | Immediate |
| `support.ticket_closed` | Ticket Closed | Customer | Immediate |
| `return.requested` | Return Request Received | Customer | Immediate |
| `return.approved` | Return Approved | Customer | Immediate |
| `return.denied` | Return Denied | Customer | Immediate |
| `wishlist.shared` | Wishlist Shared | Recipients | Immediate |
| `coupon.expired` | Coupon Expiring (Admin) | Admin | Batched |
| `admin.user_role_changed` | Role Changed | Customer | Immediate |
| `system.sync_failed` | Sync Failed Alert (Admin) | Admin | Immediate |

### 4.2 Events → Site Notifications

| Event Code | Site Notification | Recipient | Persistent |
|------------|------------------|-----------|------------|
| `user.registered` | Welcome | Customer | No |
| `user.password_changed` | Password Changed | Customer | No |
| `user.email_changed` | Email Changed | Customer | No |
| `user.profile_updated` | Profile Updated | Customer | No |
| `order.placed` | Order Confirmed | Customer | Yes |
| `order.placed` | New Order (Admin) | Admin | Yes |
| `order.confirmed` | Order Processing | Customer | Yes |
| `order.processing` | Order Processing | Customer | No |
| `order.shipped` | Order Shipped | Customer | Yes |
| `order.delivered` | Order Delivered | Customer | Yes |
| `order.cancelled` | Order Cancelled | Customer | Yes |
| `order.on_hold` | Order On Hold | Customer | Yes |
| `payment.completed` | Payment Confirmed | Customer | Yes |
| `payment.failed` | Payment Failed | Customer | Yes |
| `payment.refunded` | Refund Issued | Customer | Yes |
| `inventory.low_stock` | Low Stock (Admin) | Admin | Yes |
| `inventory.out_of_stock` | Out of Stock (Admin) | Admin | Yes |
| `inventory.back_in_stock` | Back in Stock Alert | Customer | Yes |
| `inventory.adjusted` | Inventory Adjusted (Admin) | Admin | No |
| `product.price_changed` | Price Drop Alert | Customer | Yes |
| `shipping.label_created` | Shipping Label Created (Admin) | Admin | No |
| `shipping.tracking_updated` | Tracking Update | Customer | Yes |
| `shipping.delivery_exception` | Delivery Exception | Customer | Yes |
| `review.submitted` | New Review (Admin) | Admin | Yes |
| `review.approved` | Review Published | Customer | Yes |
| `review.rejected` | Review Rejected | Customer | Yes |
| `review.reported` | Review Reported (Admin) | Admin | Yes |
| `support.ticket_created` | Ticket Submitted | Customer | Yes |
| `support.ticket_reply` | Ticket Reply | Customer | Yes |
| `support.ticket_assigned` | Ticket Assigned (Admin) | Admin | Yes |
| `support.ticket_resolved` | Ticket Resolved | Customer | Yes |
| `support.ticket_closed` | Ticket Closed | Customer | Yes |
| `return.requested` | Return Requested | Customer | Yes |
| `return.approved` | Return Approved | Customer | Yes |
| `return.denied` | Return Denied | Customer | Yes |
| `coupon.applied` | Coupon Applied | Customer | No |
| `coupon.failed` | Coupon Failed | Customer | No |
| `admin.bulk_action` | Bulk Action Complete (Admin) | Admin | No |
| `admin.data_exported` | Data Export Ready (Admin) | Admin | Yes |
| `system.sync_completed` | Sync Completed (Admin) | Admin | No |
| `system.sync_failed` | Sync Failed (Admin) | Admin | Yes |

---

## 5. Routes

### 5.1 Admin Routes

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Event Log | `/admin/system/events` | _admin | Yes | Admin |

---

## 6. Data Model

### 6.1 Tables

```typescript
// convex/schema.ts

// Event Types - Synced from Airtable
eventTypes: defineTable({
  code: v.string(),           // "order.placed"
  name: v.string(),           // "Order Placed"
  category: v.string(),       // "Order"
  description: v.optional(v.string()),
  payloadSchema: v.string(),  // JSON schema for validation
  status: v.union(v.literal("active"), v.literal("planned"), v.literal("inactive")),
})
  .index("by_code", ["code"])
  .index("by_category", ["category"])
  .index("by_status", ["status"]),

// Event Log - Immutable audit trail
eventLog: defineTable({
  eventType: v.string(),      // Event code
  payload: v.any(),           // Event payload

  // Actor information
  actorType: v.union(
    v.literal("user"),
    v.literal("admin"),
    v.literal("system"),
    v.literal("guest")
  ),
  actorId: v.optional(v.id("users")),

  // Metadata
  timestamp: v.number(),
  source: v.string(),         // Which system dispatched
  correlationId: v.optional(v.string()), // For tracing related events

  // Processing status
  processed: v.boolean(),
  processingErrors: v.optional(v.array(v.object({
    handler: v.string(),
    error: v.string(),
    timestamp: v.number(),
  }))),
})
  .index("by_type", ["eventType"])
  .index("by_timestamp", ["timestamp"])
  .index("by_actor", ["actorType", "actorId"])
  .index("by_correlation", ["correlationId"])
  .index("by_processed", ["processed"]),

// Event Listeners - Which handlers listen to which events
eventListeners: defineTable({
  eventType: v.string(),      // Event code to listen for
  handler: v.string(),        // Handler function name
  system: v.string(),         // Which system owns this handler
  priority: v.number(),       // Execution order (lower = first)
  enabled: v.boolean(),
  async: v.boolean(),         // Run async or blocking
})
  .index("by_event", ["eventType", "enabled"])
  .index("by_system", ["system"]),
```

### 6.2 Type Definitions

```typescript
// types/events.ts

// Union of all event codes
export type EventCode =
  // User & Auth
  | "user.registered"
  | "user.logged_in"
  | "user.logged_out"
  | "user.password_reset_requested"
  | "user.password_changed"
  | "user.email_changed"
  | "user.profile_updated"
  | "user.address_added"
  | "user.account_deactivated"
  | "user.account_deleted"
  // Cart
  | "cart.item_added"
  | "cart.item_removed"
  | "cart.updated"
  | "cart.cleared"
  | "cart.abandoned"
  // Checkout
  | "checkout.started"
  | "checkout.step_completed"
  | "checkout.shipping_selected"
  | "checkout.shipping_method_selected"
  | "checkout.abandoned"
  // Order
  | "order.placed"
  | "order.confirmed"
  | "order.processing"
  | "order.shipped"
  | "order.delivered"
  | "order.cancelled"
  | "order.on_hold"
  // Payment
  | "payment.initiated"
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.method_saved"
  // Inventory
  | "inventory.low_stock"
  | "inventory.out_of_stock"
  | "inventory.back_in_stock"
  | "inventory.adjusted"
  // Product
  | "product.created"
  | "product.updated"
  | "product.published"
  | "product.unpublished"
  | "product.deleted"
  | "product.price_changed"
  // Shipping
  | "shipping.label_created"
  | "shipping.tracking_updated"
  | "shipping.delivery_exception"
  // Review
  | "review.submitted"
  | "review.approved"
  | "review.rejected"
  | "review.reported"
  // Support
  | "support.ticket_created"
  | "support.ticket_reply"
  | "support.ticket_assigned"
  | "support.ticket_resolved"
  | "support.ticket_closed"
  // Return
  | "return.requested"
  | "return.approved"
  | "return.denied"
  // Wishlist
  | "wishlist.item_added"
  | "wishlist.item_removed"
  | "wishlist.shared"
  // Coupon
  | "coupon.created"
  | "coupon.applied"
  | "coupon.failed"
  | "coupon.expired"
  // Admin
  | "admin.logged_in"
  | "admin.settings_changed"
  | "admin.bulk_action"
  | "admin.data_exported"
  | "admin.user_role_changed"
  // System
  | "system.sync_completed"
  | "system.sync_failed";

// Payload type mapping
export interface EventPayloads {
  "user.registered": {
    userId: Id<"users">;
    email: string;
    name?: string;
  };
  "order.placed": {
    orderId: Id<"orders">;
    customerId?: Id<"users">;
    email: string;
    items: OrderItem[];
    total: number;
    shippingAddress: Address;
  };
  // ... (all 62 event payloads)
}

// Generic event dispatch type
export interface DispatchEventArgs<T extends EventCode> {
  type: T;
  payload: EventPayloads[T];
  correlationId?: string;
}
```

---

## 7. Actions

### 7.1 System Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Dispatch Event | `event.dispatch` | Emit an event to all listeners | System, Admin |
| View Event Log | `event.view_log` | View event history | Admin |

---

## 8. API Design

### 8.1 Core Dispatch Function

```typescript
// convex/events/dispatch.ts

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { EventCode, EventPayloads } from "../../types/events";

/**
 * Primary event dispatch function.
 * Called by all systems to emit events.
 */
export const dispatchEvent = mutation({
  args: {
    type: v.string(),           // EventCode
    payload: v.any(),           // EventPayloads[type]
    correlationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    // Determine actor
    const actorType = identity
      ? (identity.role === "admin" ? "admin" : "user")
      : "guest";
    const actorId = identity?.subject;

    // Log the event
    const eventId = await ctx.db.insert("eventLog", {
      eventType: args.type,
      payload: args.payload,
      actorType,
      actorId,
      timestamp: Date.now(),
      source: getCallingSystem(args.type),
      correlationId: args.correlationId,
      processed: false,
      processingErrors: [],
    });

    // Schedule async processing
    await ctx.scheduler.runAfter(0, internal.events.process.processEvent, {
      eventId,
    });

    return eventId;
  },
});

/**
 * Internal event processor.
 * Executes all registered listeners for an event.
 */
export const processEvent = internalMutation({
  args: { eventId: v.id("eventLog") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processed) return;

    // Get all enabled listeners for this event type
    const listeners = await ctx.db
      .query("eventListeners")
      .withIndex("by_event", (q) =>
        q.eq("eventType", event.eventType).eq("enabled", true)
      )
      .collect();

    // Sort by priority
    listeners.sort((a, b) => a.priority - b.priority);

    const errors: Array<{ handler: string; error: string; timestamp: number }> = [];

    // Execute each listener
    for (const listener of listeners) {
      try {
        // Dynamic handler invocation based on listener.handler
        await executeHandler(ctx, listener.handler, event);
      } catch (error) {
        errors.push({
          handler: listener.handler,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        });
      }
    }

    // Mark as processed
    await ctx.db.patch(args.eventId, {
      processed: true,
      processingErrors: errors.length > 0 ? errors : undefined,
    });
  },
});
```

### 8.2 Listener Registration

```typescript
// convex/events/listeners.ts

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Register a new event listener.
 * Called during system initialization.
 */
export const registerListener = mutation({
  args: {
    eventType: v.string(),
    handler: v.string(),
    system: v.string(),
    priority: v.optional(v.number()),
    async: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Check if listener already exists
    const existing = await ctx.db
      .query("eventListeners")
      .filter((q) =>
        q.and(
          q.eq(q.field("eventType"), args.eventType),
          q.eq(q.field("handler"), args.handler)
        )
      )
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("eventListeners", {
      eventType: args.eventType,
      handler: args.handler,
      system: args.system,
      priority: args.priority ?? 100,
      enabled: true,
      async: args.async ?? true,
    });
  },
});

/**
 * Get all listeners for debugging/admin.
 */
export const getListeners = query({
  args: { eventType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.eventType) {
      return await ctx.db
        .query("eventListeners")
        .withIndex("by_event", (q) => q.eq("eventType", args.eventType))
        .collect();
    }
    return await ctx.db.query("eventListeners").collect();
  },
});
```

### 8.3 Event Log Queries

```typescript
// convex/events/log.ts

import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * Get event log with filtering.
 * Used by admin event viewer.
 */
export const getEventLog = query({
  args: {
    eventType: v.optional(v.string()),
    actorId: v.optional(v.id("users")),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    limit: v.optional(v.number()),
    includeErrors: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db.query("eventLog").withIndex("by_timestamp");

    // Apply time filters
    if (args.startTime && args.endTime) {
      // Time range query
    }

    let events = await query.order("desc").take(args.limit ?? 100);

    // Post-filter by type if specified
    if (args.eventType) {
      events = events.filter((e) => e.eventType === args.eventType);
    }

    // Post-filter by actor if specified
    if (args.actorId) {
      events = events.filter((e) => e.actorId === args.actorId);
    }

    // Filter to only errors if requested
    if (args.includeErrors === false) {
      events = events.filter((e) => !e.processingErrors?.length);
    }

    return events;
  },
});

/**
 * Get event statistics.
 * Used by admin dashboard.
 */
export const getEventStats = query({
  args: {
    period: v.union(v.literal("hour"), v.literal("day"), v.literal("week")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const periodMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };

    const startTime = now - periodMs[args.period];

    const events = await ctx.db
      .query("eventLog")
      .withIndex("by_timestamp")
      .filter((q) => q.gte(q.field("timestamp"), startTime))
      .collect();

    // Group by event type
    const byType: Record<string, number> = {};
    let errorCount = 0;

    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
      if (event.processingErrors?.length) errorCount++;
    }

    return {
      total: events.length,
      byType,
      errorCount,
      period: args.period,
    };
  },
});
```

### 8.4 Helper Functions for Systems

```typescript
// convex/events/helpers.ts

import { dispatchEvent } from "./dispatch";
import type { EventCode, EventPayloads, DispatchEventArgs } from "../../types/events";

/**
 * Type-safe event dispatcher.
 * Use this in other systems for full type checking.
 */
export function createEventDispatcher<T extends EventCode>(
  ctx: MutationCtx,
  type: T
) {
  return async (payload: EventPayloads[T], correlationId?: string) => {
    return await dispatchEvent(ctx, {
      type,
      payload,
      correlationId,
    });
  };
}

/**
 * Example usage in Order Management:
 *
 * const dispatchOrderPlaced = createEventDispatcher(ctx, "order.placed");
 * await dispatchOrderPlaced({
 *   orderId,
 *   customerId,
 *   email: customer.email,
 *   items: orderItems,
 *   total: orderTotal,
 *   shippingAddress,
 * });
 */
```

---

## 9. Default Listeners

> These listeners are registered during system initialization.
> Each links an event to its notification handlers.

### 9.1 Email Notification Listeners

```typescript
// Registered by Email Notification System (Phase 1)

const emailListeners = [
  { eventType: "user.registered", handler: "email.sendWelcome", priority: 10 },
  { eventType: "user.password_reset_requested", handler: "email.sendPasswordReset", priority: 10 },
  { eventType: "order.placed", handler: "email.sendOrderConfirmation", priority: 10 },
  { eventType: "order.placed", handler: "email.sendNewOrderAdmin", priority: 20 },
  { eventType: "order.shipped", handler: "email.sendShippingNotification", priority: 10 },
  { eventType: "order.delivered", handler: "email.sendDeliveryConfirmation", priority: 10 },
  { eventType: "order.delivered", handler: "email.sendReviewRequest", priority: 100 }, // Batched, low priority
  { eventType: "payment.failed", handler: "email.sendPaymentFailed", priority: 10 },
  { eventType: "inventory.low_stock", handler: "email.sendLowStockAdmin", priority: 50 },
  { eventType: "cart.abandoned", handler: "email.sendAbandonedCart", priority: 100 }, // Batched
  // ... all 43 email mappings
];
```

### 9.2 Site Notification Listeners

```typescript
// Registered by Site Notification System (Phase 1)

const siteNotificationListeners = [
  { eventType: "user.registered", handler: "notification.createWelcome", priority: 10 },
  { eventType: "order.placed", handler: "notification.createOrderConfirmed", priority: 10 },
  { eventType: "order.placed", handler: "notification.createNewOrderAdmin", priority: 20 },
  { eventType: "order.shipped", handler: "notification.createOrderShipped", priority: 10 },
  { eventType: "payment.failed", handler: "notification.createPaymentFailed", priority: 10 },
  { eventType: "inventory.low_stock", handler: "notification.createLowStockAdmin", priority: 10 },
  { eventType: "coupon.applied", handler: "notification.createCouponApplied", priority: 10 }, // Toast
  { eventType: "coupon.failed", handler: "notification.createCouponFailed", priority: 10 }, // Toast
  // ... all 47 notification mappings
];
```

---

## 10. Admin UI: Event Log Viewer

### 10.1 Features

- **Real-time event stream** - Watch events as they happen
- **Filter by event type** - Dropdown of all 62 event types
- **Filter by category** - User, Cart, Order, Payment, etc.
- **Filter by time range** - Last hour, today, custom range
- **Search by actor** - Find events by user ID
- **View payload details** - Expand to see full event data
- **Error highlighting** - Failed handlers shown in red
- **Export** - Download event log as CSV/JSON

### 10.2 Components Needed

- [ ] `EventLogTable` - Main data table with virtual scrolling
- [ ] `EventTypeFilter` - Multi-select dropdown for event types
- [ ] `EventCategoryFilter` - Category grouping filter
- [ ] `DateRangePicker` - Time range selection
- [ ] `EventDetailDrawer` - Slide-out panel for event details
- [ ] `EventPayloadViewer` - JSON viewer for payload
- [ ] `EventStatsCards` - Summary statistics cards

---

## 11. Testing Strategy

### 11.1 Unit Tests

- `dispatchEvent` correctly logs events
- Payload validation rejects invalid data
- Listeners are invoked in priority order
- Errors in one handler don't block others
- `correlationId` links related events

### 11.2 Integration Tests

- Event → Email notification flow
- Event → Site notification flow
- Event log queries return correct data
- Listener registration is idempotent

### 11.3 Testing Tools (Phase 6)

The Testing & Debug Tools system will provide:
- Manual event trigger UI (select event type, enter payload)
- Event replay (re-process a logged event)
- Listener enable/disable toggles
- Event flood protection testing

---

## 12. Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Define event type enum with all 62 events
- [ ] Create `eventLog` table schema
- [ ] Create `eventTypes` table schema
- [ ] Create `eventListeners` table schema
- [ ] Implement `dispatchEvent` mutation
- [ ] Implement `processEvent` internal mutation
- [ ] Implement `registerListener` mutation
- [ ] Create TypeScript types for all payloads

### Phase 2: Event Processing
- [ ] Implement listener priority ordering
- [ ] Implement error handling per listener
- [ ] Implement retry mechanism for failed handlers
- [ ] Implement correlation ID tracking
- [ ] Add payload validation against schemas

### Phase 3: Queries & Admin
- [ ] Implement `getEventLog` query
- [ ] Implement `getEventStats` query
- [ ] Implement `getListeners` query
- [ ] Build Event Log Viewer route
- [ ] Build EventLogTable component
- [ ] Build filter components
- [ ] Build EventDetailDrawer

### Phase 4: Integration
- [ ] Seed event types from Airtable
- [ ] Register default email listeners
- [ ] Register default notification listeners
- [ ] Test end-to-end event flows
- [ ] Performance testing with high event volume

---

## 13. Performance Considerations

### 13.1 Event Volume Estimates

| Scenario | Events/Hour | Events/Day |
|----------|-------------|------------|
| Low traffic store | 100 | 2,400 |
| Medium store | 1,000 | 24,000 |
| High traffic store | 10,000 | 240,000 |

### 13.2 Optimization Strategies

1. **Async processing** - Events are logged immediately, processed async
2. **Batching** - Low-priority notifications batched (abandoned cart emails)
3. **Indexing** - Strategic indexes on eventLog for query performance
4. **Retention policy** - Archive events older than 90 days
5. **Rate limiting** - Prevent event floods from buggy systems

---

## 14. Security Considerations

### 14.1 Event Access Control

- Only Admin role can view event log
- Only System/Admin can dispatch arbitrary events
- User events are automatically scoped to that user

### 14.2 Sensitive Data

- PII in payloads (emails, addresses) follows data retention policy
- Payment details (card numbers) NEVER stored in payloads
- Event log supports GDPR data deletion requests

### 14.3 Audit Trail

- Events are immutable once logged
- No DELETE operation on eventLog table
- All admin actions logged as events themselves

---

## 15. Future Considerations

### 15.1 Webhooks (Future)

- External webhook destinations for events
- Configurable per event type
- Retry with exponential backoff

### 15.2 Event Sourcing (Future)

- Rebuild system state from event log
- Time-travel debugging
- Analytics data warehouse sync

### 15.3 Real-time Dashboard (Future)

- Live event feed in admin
- Event volume graphs
- Alert thresholds for anomalies

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Route (Event Log) | [redacted-airtable-record-id] |

### B. Event Categories (from Airtable)

| Category | Event Count |
|----------|-------------|
| User & Auth | 10 |
| Cart | 5 |
| Checkout | 6 |
| Order | 8 |
| Payment | 5 |
| Inventory | 4 |
| Product | 6 |
| Shipping | 4 |
| Review | 4 |
| Support | 5 |
| Return | 4 |
| Wishlist | 3 |
| Coupon | 4 |
| Admin | 5 |
| System | 2 |
| **Total** | **62** |

### C. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [PRD Template](./PRD-TEMPLATE.md)
- [Email Notification System PRD](./PRD-EMAIL-NOTIFICATION-SYSTEM.md) (TODO)
- [Site Notification System PRD](./PRD-SITE-NOTIFICATION-SYSTEM.md) (TODO)

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
