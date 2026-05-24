# PRD: Site Notification System

> **System Code:** COM-NOT
> **Phase:** 1 of 6
> **Priority:** P1 - High
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose
The Site Notification System delivers real-time in-app notifications to users. It provides immediate feedback through toast notifications and persistent notifications stored in a notification center. This system handles all user-facing alerts from order updates to price drop alerts, creating a unified notification experience across the platform.

### 1.2 Scope
- Toast notification component for transient alerts
- Notification center with bell icon and unread count
- Persistent notification storage and retrieval
- Admin broadcast notifications to user segments
- Event-driven notification dispatch
- Real-time updates via Convex subscriptions

### 1.3 Out of Scope
- Email notifications (see Email Notification System PRD)
- Push notifications (native mobile)
- SMS notifications
- Notification scheduling/delayed delivery
- A/B testing notification content

---

## 2. Dependencies

### 2.1 Required Before This System
| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Notifications are triggered by system events |
| Authentication System | PLT-AUT | 0 | User identity for notification targeting |

### 2.2 Systems That Depend on This
| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Order Management | ORD-MGT | 2 | Order status notifications |
| Shopping Cart | ORD-CRT | 2 | Cart-related notifications |
| Support System | COM-SUP | 3 | Ticket notifications |
| Review System | CNT-REV | 3 | Review moderation notifications |
| Inventory System | BIZ-INV | 3 | Stock alerts |
| All other systems | - | - | Any system can send notifications |

### 2.3 Integration Hooks to Implement
- `sendNotification(userId, templateCode, variables)` - Send single notification
- `broadcastNotification(segment, templateCode, variables)` - Send to multiple users
- `dismissNotification(notificationId)` - Programmatically dismiss
- Convex subscription for real-time notification updates

---

## 3. Routes

> Source: Airtable Routes table

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Notifications | /account/notifications | _dashboard | Yes | Customer |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Notification Templates | /admin/settings/notifications | _admin | Yes | Admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// Site Notification Templates (synced from Airtable)
siteNotificationTemplates: defineTable({
  // Identity
  airtableId: v.string(), // Airtable record ID for sync
  name: v.string(), // "Order Confirmed"
  code: v.string(), // "order.confirmed" derived from event

  // Content
  messageTemplate: v.string(), // "Your order #{orderId} has been confirmed!"
  notificationType: v.union(
    v.literal("success"),
    v.literal("info"),
    v.literal("warning"),
    v.literal("error")
  ),

  // Behavior
  actionUrl: v.optional(v.string()), // "/account/orders/{{orderId}}"
  persistent: v.boolean(), // Store in notification center

  // Targeting
  recipientType: v.union(
    v.literal("customer"),
    v.literal("admin"),
    v.literal("staff"),
    v.literal("custom")
  ),

  // Trigger
  eventCode: v.string(), // Event that triggers this notification

  // Status
  isEnabled: v.boolean(),

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_airtable_id", ["airtableId"])
  .index("by_code", ["code"])
  .index("by_event_code", ["eventCode"])
  .index("by_recipient_type", ["recipientType"]),

// User Notifications (instances)
notifications: defineTable({
  // Recipient
  userId: v.id("users"),

  // Content (snapshot at time of creation)
  templateId: v.optional(v.id("siteNotificationTemplates")),
  message: v.string(), // Rendered message
  type: v.union(
    v.literal("success"),
    v.literal("info"),
    v.literal("warning"),
    v.literal("error")
  ),

  // Navigation
  actionUrl: v.optional(v.string()), // Rendered URL

  // State
  isRead: v.boolean(),
  readAt: v.optional(v.number()),
  isDismissed: v.boolean(),
  dismissedAt: v.optional(v.number()),

  // Metadata
  sourceEvent: v.optional(v.string()), // Event that triggered this
  metadata: v.optional(v.string()), // JSON - additional data

  // Timestamps
  createdAt: v.number(),
  expiresAt: v.optional(v.number()), // Auto-dismiss after this time
})
  .index("by_user", ["userId"])
  .index("by_user_unread", ["userId", "isRead"])
  .index("by_user_created", ["userId", "createdAt"])
  .index("by_expires", ["expiresAt"]),

// Broadcast Notifications (admin-sent)
broadcastNotifications: defineTable({
  // Content
  title: v.optional(v.string()),
  message: v.string(),
  type: v.union(
    v.literal("success"),
    v.literal("info"),
    v.literal("warning"),
    v.literal("error")
  ),
  actionUrl: v.optional(v.string()),

  // Targeting
  segment: v.union(
    v.literal("all"),
    v.literal("customers"),
    v.literal("staff"),
    v.literal("custom")
  ),
  customFilter: v.optional(v.string()), // JSON filter criteria

  // Status
  status: v.union(
    v.literal("draft"),
    v.literal("scheduled"),
    v.literal("sent"),
    v.literal("cancelled")
  ),
  scheduledFor: v.optional(v.number()),
  sentAt: v.optional(v.number()),
  recipientCount: v.optional(v.number()),

  // Audit
  createdBy: v.id("users"),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_scheduled", ["scheduledFor"]),
```

### 4.2 Relationships
- `notifications.userId` → `users._id` (User receiving notification)
- `notifications.templateId` → `siteNotificationTemplates._id` (Template used)
- `broadcastNotifications.createdBy` → `users._id` (Admin who created)

### 4.3 Forward-Looking Fields
| Field | Future System | Purpose |
|-------|---------------|---------|
| `notifications.expiresAt` | Scheduled Tasks | Auto-cleanup of old notifications |
| `broadcastNotifications.scheduledFor` | Scheduled Tasks | Delayed broadcast sending |
| `notifications.metadata` | Analytics | Track notification engagement |

---

## 5. Actions

> Source: Airtable Actions table

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Mark Notification Read | notification.mark_read | Mark notification as read | Customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Send Site Notification | notification.send | Send an in-app notification to user | System |
| Send Broadcast Notification | notification.broadcast | Send notification to all/segment of users | Admin |

---

## 6. Events

> Source: Airtable Events table

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Notification Sent | notification.sent | After notification created | `{ userId, templateCode, notificationId }` |
| Notification Read | notification.read | User marks as read | `{ userId, notificationId }` |
| Broadcast Sent | notification.broadcast_sent | After broadcast delivered | `{ broadcastId, recipientCount }` |

### 6.2 Events Consumed (41 Events Trigger Notifications)

The Site Notification System listens to events from ALL other systems. Below are the 41 notification templates categorized by source:

#### Order Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| order.created | Order Confirmed | Your order #{orderId} has been confirmed! | Success |
| order.processing | Order Processing | Order #{orderId} is being prepared! | Info |
| order.on_hold | Order On Hold | Order #{orderId} is on hold - action may be required | Warning |
| order.cancelled | Order Cancelled | Order #{orderId} has been cancelled | Warning |
| order.delivered | Order Delivered | Your order #{orderId} has been delivered! | Success |

#### Payment Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| payment.confirmed | Payment Confirmed | Payment received for order #{orderId}! | Success |
| payment.failed | Payment Failed | Payment failed for order #{orderId}. Please update your payment method. | Error |
| refund.processed | Refund Issued | Your refund for order #{orderId} has been processed. | Success |

#### Shipping Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| shipping.shipped | Order Shipped | Your order #{orderId} has shipped! | Info |
| shipping.tracking_updated | Tracking Update | Shipping update for order #{orderId}: {{status}} | Info |
| shipping.delivery_exception | Delivery Exception | There's an issue with delivery for order #{orderId} | Warning |

#### Returns Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| return.requested | Return Requested | Your return request has been submitted for order #{orderId} | Info |
| return.approved | Return Approved | Your return request has been approved. | Success |
| return.denied | Return Denied | Your return request for order #{orderId} was not approved | Warning |

#### Review Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| review.approved | Review Published | Your review has been published! | Success |
| review.rejected | Review Rejected | Your review submission was not approved | Info |

#### Inventory Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| inventory.back_in_stock | Back in Stock Alert | {{productName}} is back in stock! | Info |

#### Support Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| support.ticket_created | Ticket Submitted | Your support ticket has been submitted. We'll respond soon! | Success |
| support.ticket_replied | Ticket Reply | You have a new reply on your support ticket. | Info |
| support.ticket_resolved | Ticket Resolved | Your support ticket has been resolved | Success |
| support.ticket_closed | Ticket Closed | Your support ticket has been closed | Info |

#### Account Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| user.registered | Welcome | Welcome to the store! Start shopping and earn rewards. | Success |
| user.profile_updated | Profile Updated | Your profile has been updated | Success |
| user.email_changed | Email Changed | Your email address has been updated successfully | Success |
| user.password_changed | Password Changed | Your password has been changed successfully | Success |

#### Promotion Notifications (Customer)
| Event | Template | Message | Type |
|-------|----------|---------|------|
| wishlist.price_drop | Price Drop Alert | {{productName}} is now ${{newPrice}}! (was ${{oldPrice}}) | Info |
| coupon.applied | Coupon Applied | Discount applied! You're saving ${{discountAmount}} | Success |
| coupon.failed | Coupon Failed | Coupon could not be applied: {{reason}} | Error |

#### Admin Notifications
| Event | Template | Message | Type |
|-------|----------|---------|------|
| order.created | New Order (Admin) | New order #{orderId} received - ${{total}} | Info |
| inventory.low_stock | Low Stock (Admin) | {{productName}} is low on stock ({{currentStock}} remaining) | Warning |
| inventory.out_of_stock | Out of Stock (Admin) | {{productName}} is now out of stock! | Error |
| inventory.adjusted | Inventory Adjusted (Admin) | Inventory adjusted for {{productName}}: {{adjustment}} | Info |
| review.submitted | New Review (Admin) | New review pending moderation | Info |
| review.reported | Review Reported (Admin) | A review has been reported and needs moderation | Warning |
| support.ticket_assigned | Ticket Assigned (Admin) | Support ticket #{{ticketId}} has been assigned to you | Info |
| sync.completed | Sync Completed (Admin) | Sync completed: {{recordsProcessed}} records processed | Success |
| sync.failed | Sync Failed (Admin) | Sync failed: {{syncType}}. Check logs for details. | Error |
| shipping.label_created | Shipping Label Created (Admin) | Shipping label created for order #{orderId} | Success |
| admin.bulk_action_completed | Bulk Action Complete (Admin) | Bulk {{action}} completed: {{count}} records affected | Success |
| admin.export_ready | Data Export Ready (Admin) | Your data export is ready to download | Success |

---

## 7. Notifications

### 7.1 Email Notifications
None - Site notifications do not trigger emails.

### 7.2 Site Notifications
This system IS the site notification system. All 41 templates above are managed by this system.

---

## 8. User Interface

### 8.1 Components Needed

#### Customer Components
- [ ] **NotificationBell** - Bell icon with unread count badge
- [ ] **NotificationDropdown** - Quick view of recent notifications
- [ ] **NotificationCenter** - Full page notification list
- [ ] **NotificationItem** - Individual notification card
- [ ] **Toast** - Transient notification popup
- [ ] **ToastContainer** - Toast positioning and stacking

#### Admin Components
- [ ] **NotificationTemplateList** - List all templates
- [ ] **NotificationTemplateEditor** - Edit template content
- [ ] **BroadcastForm** - Create broadcast notification
- [ ] **BroadcastHistory** - View sent broadcasts
- [ ] **NotificationPreview** - Preview notification rendering

### 8.2 Wireframes

#### Notification Bell (Header)
```
┌─────────────────────────────────────────────┐
│  Logo    [Search...]    Cart   🔔(3)  User  │
│                                    └─ Badge │
└─────────────────────────────────────────────┘
```

#### Notification Dropdown
```
┌────────────────────────────────┐
│ Notifications        Mark All  │
├────────────────────────────────┤
│ ✓ Order #1234 confirmed!      │
│   2 minutes ago                │
├────────────────────────────────┤
│ • Payment received for...      │
│   5 minutes ago                │
├────────────────────────────────┤
│ • Your review has been...      │
│   1 hour ago                   │
├────────────────────────────────┤
│       View All Notifications   │
└────────────────────────────────┘
```

#### Toast Notification
```
                    ┌─────────────────────────────┐
                    │ ✓ Order confirmed!      ✕   │
                    │   Your order #1234 is ready │
                    │           [View Order]      │
                    └─────────────────────────────┘
```

### 8.3 States
- **Loading** - Skeleton for notification list
- **Empty** - "No notifications yet" message
- **Error** - "Unable to load notifications" with retry
- **Unread** - Bold text, dot indicator
- **Read** - Normal text, no indicator

---

## 9. Business Rules

### 9.1 Validation Rules
- Message templates must contain valid variable placeholders
- Action URLs must be valid relative paths
- Broadcast notifications require admin role

### 9.2 Business Logic

#### Toast vs Persistent
| Notification Type | Toast | Persistent |
|-------------------|-------|------------|
| Success (transient) | ✓ | Optional |
| Info (important) | ✓ | ✓ |
| Warning | ✓ | ✓ |
| Error | ✓ | ✓ |

#### Notification Retention
- Keep persistent notifications for **90 days**
- Auto-dismiss read notifications after **30 days**
- Admin can configure retention periods

#### Unread Count
- Count only persistent, non-dismissed notifications
- Cap display at "99+" for large counts
- Update in real-time via Convex subscription

#### Toast Behavior
- Auto-dismiss after **5 seconds** (success/info)
- Auto-dismiss after **8 seconds** (warning)
- Manual dismiss required (error)
- Stack up to **3 toasts** visible
- New toasts push older ones up

### 9.3 Edge Cases
- User has thousands of notifications → Paginate, show recent first
- Notification template disabled after event → Skip silently
- User offline when notification sent → Show on reconnect
- Same event triggers multiple templates → Send all matching
- Broadcast to segment with no users → Log warning, skip

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get user's notifications
export const listNotifications = query({
  args: {
    limit: v.optional(v.number()), // Default 20
    cursor: v.optional(v.string()),
    unreadOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthorized");

    let query = ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc");

    if (args.unreadOnly) {
      query = ctx.db
        .query("notifications")
        .withIndex("by_user_unread", (q) =>
          q.eq("userId", user._id).eq("isRead", false)
        );
    }

    const notifications = await query
      .filter((q) => q.eq(q.field("isDismissed"), false))
      .take(args.limit ?? 20);

    return notifications;
  },
});

// Get unread count
export const getUnreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return 0;

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .filter((q) => q.eq(q.field("isDismissed"), false))
      .collect();

    return unread.length;
  },
});

// Get notification templates (admin)
export const listTemplates = query({
  args: {
    recipientType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    let query = ctx.db.query("siteNotificationTemplates");

    if (args.recipientType) {
      query = query.withIndex("by_recipient_type", (q) =>
        q.eq("recipientType", args.recipientType)
      );
    }

    return await query.collect();
  },
});

// Get broadcast history (admin)
export const listBroadcasts = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    let query = ctx.db.query("broadcastNotifications").order("desc");

    if (args.status) {
      query = query.withIndex("by_status", (q) =>
        q.eq("status", args.status)
      );
    }

    return await query.take(50);
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Mark notification as read
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) {
      throw new Error("Notification not found");
    }

    await ctx.db.patch(args.notificationId, {
      isRead: true,
      readAt: Date.now(),
    });

    // Emit event for analytics
    await dispatchEvent(ctx, "notification.read", {
      userId: user._id,
      notificationId: args.notificationId,
    });
  },
});

// Mark all as read
export const markAllAsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_unread", (q) =>
        q.eq("userId", user._id).eq("isRead", false)
      )
      .collect();

    for (const notification of unread) {
      await ctx.db.patch(notification._id, {
        isRead: true,
        readAt: Date.now(),
      });
    }

    return { count: unread.length };
  },
});

// Dismiss notification
export const dismiss = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) throw new Error("Unauthorized");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.userId !== user._id) {
      throw new Error("Notification not found");
    }

    await ctx.db.patch(args.notificationId, {
      isDismissed: true,
      dismissedAt: Date.now(),
    });
  },
});

// Send notification (internal use)
export const send = internalMutation({
  args: {
    userId: v.id("users"),
    templateCode: v.string(),
    variables: v.object({}), // Dynamic variables
  },
  handler: async (ctx, args) => {
    // Get template
    const template = await ctx.db
      .query("siteNotificationTemplates")
      .withIndex("by_code", (q) => q.eq("code", args.templateCode))
      .unique();

    if (!template || !template.isEnabled) {
      return null; // Template disabled or not found
    }

    // Render message
    const message = renderTemplate(template.messageTemplate, args.variables);
    const actionUrl = template.actionUrl
      ? renderTemplate(template.actionUrl, args.variables)
      : undefined;

    // Create notification
    const notificationId = await ctx.db.insert("notifications", {
      userId: args.userId,
      templateId: template._id,
      message,
      type: template.notificationType,
      actionUrl,
      isRead: false,
      isDismissed: false,
      sourceEvent: template.eventCode,
      metadata: JSON.stringify(args.variables),
      createdAt: Date.now(),
    });

    // Emit event
    await dispatchEvent(ctx, "notification.sent", {
      userId: args.userId,
      templateCode: args.templateCode,
      notificationId,
    });

    return notificationId;
  },
});

// Create broadcast (admin)
export const createBroadcast = mutation({
  args: {
    title: v.optional(v.string()),
    message: v.string(),
    type: v.union(
      v.literal("success"),
      v.literal("info"),
      v.literal("warning"),
      v.literal("error")
    ),
    actionUrl: v.optional(v.string()),
    segment: v.union(
      v.literal("all"),
      v.literal("customers"),
      v.literal("staff"),
      v.literal("custom")
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireRole(ctx, "admin");

    const broadcastId = await ctx.db.insert("broadcastNotifications", {
      ...args,
      status: "draft",
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return broadcastId;
  },
});

// Send broadcast (admin)
export const sendBroadcast = mutation({
  args: {
    broadcastId: v.id("broadcastNotifications"),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast || broadcast.status !== "draft") {
      throw new Error("Broadcast not found or already sent");
    }

    // Get target users based on segment
    const users = await getSegmentUsers(ctx, broadcast.segment);

    // Create notification for each user
    for (const user of users) {
      await ctx.db.insert("notifications", {
        userId: user._id,
        message: broadcast.message,
        type: broadcast.type,
        actionUrl: broadcast.actionUrl,
        isRead: false,
        isDismissed: false,
        createdAt: Date.now(),
      });
    }

    // Update broadcast status
    await ctx.db.patch(args.broadcastId, {
      status: "sent",
      sentAt: Date.now(),
      recipientCount: users.length,
    });

    // Emit event
    await dispatchEvent(ctx, "notification.broadcast_sent", {
      broadcastId: args.broadcastId,
      recipientCount: users.length,
    });

    return { recipientCount: users.length };
  },
});

// Toggle template enabled (admin)
export const toggleTemplate = mutation({
  args: {
    templateId: v.id("siteNotificationTemplates"),
    isEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, "admin");

    await ctx.db.patch(args.templateId, {
      isEnabled: args.isEnabled,
      updatedAt: Date.now(),
    });
  },
});
```

### 10.3 Actions (External/Async Operations)

```typescript
// Sync templates from Airtable
export const syncTemplates = action({
  args: {},
  handler: async (ctx) => {
    const airtableTemplates = await fetchAirtableRecords(
      "Site Notifications",
      "[redacted-airtable-table-id]"
    );

    for (const record of airtableTemplates) {
      await ctx.runMutation(internal.notifications.upsertTemplate, {
        airtableId: record.id,
        name: record.fields.Name,
        code: deriveCodeFromEvent(record.fields.Events),
        messageTemplate: record.fields["Message Template"],
        notificationType: record.fields["Notification Type"].toLowerCase(),
        actionUrl: record.fields["Action URL"],
        persistent: record.fields.Persistent ?? false,
        recipientType: record.fields["Recipient Type"].toLowerCase(),
        eventCode: getEventCode(record.fields.Events),
        isEnabled: record.fields.Status !== "Disabled",
      });
    }

    return { synced: airtableTemplates.length };
  },
});

// Cleanup old notifications
export const cleanupOldNotifications = action({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);

    // Delete read notifications older than 30 days
    await ctx.runMutation(internal.notifications.deleteOldRead, {
      before: thirtyDaysAgo,
    });

    // Delete all notifications older than 90 days
    await ctx.runMutation(internal.notifications.deleteOld, {
      before: ninetyDaysAgo,
    });
  },
});
```

---

## 11. Security Considerations

### 11.1 Authentication Requirements
- Customer notification list: Authenticated users only
- Mark as read/dismiss: Owner of notification only
- Admin templates: Admin role required
- Broadcast: Admin role required

### 11.2 Authorization Rules
```typescript
// Customers can only see their own notifications
const notification = await ctx.db.get(notificationId);
if (notification.userId !== currentUser._id) {
  throw new Error("Unauthorized");
}

// Admin broadcast requires admin role
await requireRole(ctx, "admin");
```

### 11.3 Data Privacy
- Notifications may contain PII (order numbers, names)
- Sanitize variables before rendering
- Implement notification deletion with account deletion
- Don't log notification content in plain text

---

## 12. Testing Strategy

### 12.1 Unit Tests
- Template rendering with various variable types
- Segment filtering logic
- Notification retention rules
- Toast stacking behavior

### 12.2 Integration Tests
- Event → notification pipeline
- Airtable sync accuracy
- Real-time subscription updates
- Broadcast delivery to segments

### 12.3 E2E Tests
- Click notification bell → see dropdown
- Click notification → navigate to action URL
- Mark as read → count decreases
- Admin create and send broadcast

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition (templates, notifications, broadcasts)
- [ ] Airtable sync for templates
- [ ] Basic notification queries

### Phase 2: Core Features
- [ ] Toast component and container
- [ ] Notification bell with unread count
- [ ] Notification dropdown
- [ ] Mark as read/dismiss mutations
- [ ] Event listener for notification dispatch

### Phase 3: Integration
- [ ] Wire up all 41 event triggers
- [ ] Admin template management page
- [ ] Admin broadcast feature
- [ ] Real-time subscription testing

### Phase 4: Polish
- [ ] Toast animations
- [ ] Empty states
- [ ] Error handling
- [ ] Pagination for large lists
- [ ] Notification cleanup job

---

## 14. Future Considerations

1. **Notification Preferences** - User settings for which notifications to receive
2. **Channels** - Expand to push notifications, SMS
3. **Scheduled Notifications** - Time-delayed delivery
4. **Rich Notifications** - Images, buttons, expanded content
5. **Notification Analytics** - Click-through rates, engagement
6. **Smart Bundling** - Combine multiple similar notifications
7. **Priority Levels** - Urgent vs normal notification handling

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Site Notifications | 41 records (see Section 6.2) |

### B. Notification Type Mapping

| Type | Color | Icon | Auto-dismiss |
|------|-------|------|--------------|
| Success | Green | CheckCircle | 5s |
| Info | Blue | Info | 5s |
| Warning | Yellow | AlertTriangle | 8s |
| Error | Red | XCircle | Manual |

### C. Variable Syntax
Templates use double curly braces: `{{variableName}}`
- `{{orderId}}` - Order identifier
- `{{productName}}` - Product name
- `{{total}}` - Order total (formatted)
- `{{status}}` - Status message
- `{{ticketId}}` - Support ticket ID

### D. Related Documentation
- [Action Plan](./ACTION-PLAN.md)
- [Email Notification System](./PRD-EMAIL-NOTIFICATION-SYSTEM.md)
- [Event System](./PRD-EVENT-SYSTEM.md)
- [Tech Stack](../.claude/CLAUDE.md)

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude
