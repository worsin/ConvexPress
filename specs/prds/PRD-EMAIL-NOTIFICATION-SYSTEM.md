# PRD: Email Notification System

> **System Code:** COM-EML
> **Phase:** 1 of 6
> **Priority:** P0 - Critical
> **Complexity:** Medium

---

## 1. Overview

### 1.1 Purpose

The Email Notification System handles all transactional email communication for the shopping cart platform. It provides a centralized, event-driven email delivery infrastructure that responds to system events (orders, shipments, password resets, etc.) by sending templated emails through the Resend API. The system includes admin tools for managing email templates, viewing send history, and monitoring delivery status.

### 1.2 Scope

**In Scope:**
- Email template storage and management
- Event-triggered email dispatch
- Resend API integration
- Email queue with retry logic
- Template variable substitution
- Admin template editor (view/edit)
- Send history and delivery status
- Email enable/disable toggles per template

**Out of Scope:**
- Marketing email campaigns (bulk sends)
- Email list management
- A/B testing
- Advanced analytics (open rates, click rates)
- Custom SMTP configuration
- Newsletter subscriptions

### 1.3 Design Philosophy

**Event-Driven Architecture:** Emails are never sent directly. The Event System emits events, and the Email Notification System listens and responds. This decouples email logic from business logic and ensures consistent, auditable communication.

**Templates as Data:** Email templates are stored in the database, synced from Airtable, and editable by admins. No hardcoded email content.

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Event System | PLT-EVT | 0 | Email sends are triggered by events |
| Airtable Sync System | PLT-SYN | 2 | Templates sync from Airtable (optional initial sync) |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Authentication System | PLT-AUT | 0 | Password reset, welcome emails |
| Order Management | ORD-MGT | 4 | Order confirmation, shipping, delivery |
| Customer Support | SUP-TKT | 5 | Ticket notifications |
| Returns & Refunds | SUP-RTN | 5 | Return status emails |
| Reviews & Ratings | CON-REV | 5 | Review request, moderation emails |

### 2.3 Integration Hooks to Implement

| Hook | Purpose | Used By |
|------|---------|---------|
| `sendEmail(templateId, recipient, variables)` | Queue email for sending | Event handlers |
| `getEmailTemplate(event)` | Get template for event | Email dispatcher |
| `previewEmail(templateId, variables)` | Preview rendered email | Admin UI |
| `resendEmail(emailLogId)` | Resend a failed email | Admin UI |
| `getEmailHistory(filters)` | Query send history | Admin UI |

---

## 3. Email Templates

> Source: Airtable Email Notifications table

### 3.1 Template Categories

| Category | Count | Description |
|----------|-------|-------------|
| **Order** | 8 | Order lifecycle (placed, shipped, delivered, cancelled) |
| **Auth** | 3 | Password reset, welcome, password changed |
| **Account** | 5 | Email change, account deactivated/deleted |
| **Payment** | 3 | Payment received, failed, refund processed |
| **Support** | 5 | Ticket created, reply, resolved, closed |
| **Returns** | 4 | Return requested, approved, denied, refund |
| **Reviews** | 4 | Review request, published, rejected, reported (admin) |
| **Inventory** | 3 | Low stock, out of stock, back in stock |
| **Cart** | 2 | Abandoned cart, abandoned checkout |
| **Wishlist** | 2 | Shared wishlist, price drop |
| **Admin** | 4 | New order, new ticket, sync failed, coupon expired |

**Total: 43 Email Templates**

### 3.2 Complete Template List

| Name | Event Code | Subject | Recipient | Priority |
|------|------------|---------|-----------|----------|
| Welcome Email | `user.registered` | Welcome to {{storeName}}! | Customer | Immediate |
| Password Reset | `user.password_reset_requested` | Reset Your Password | Customer | Immediate |
| Password Changed | `user.password_changed` | Your Password Was Changed | Customer | Immediate |
| Email Change Confirmation | `user.email_changed` | Confirm Your New Email Address | Customer | Immediate |
| Email Change Notification | `user.email_changed` | Your Email Address Was Changed | Customer | Immediate |
| Account Deactivated | `user.account_deactivated` | Your Account Has Been Deactivated | Customer | Immediate |
| Account Deleted | `user.account_deleted` | Your Account Has Been Deleted | Customer | Immediate |
| Role Changed | `admin.user_role_changed` | Your Account Permissions Have Changed | Customer | Immediate |
| Order Confirmation | `order.placed` | Order Confirmed - #{orderId} | Customer | Immediate |
| Order Confirmed | `order.confirmed` | Order Confirmed - #{orderId} is being prepared | Customer | Immediate |
| Order Processing | `order.processing` | Your Order is Being Prepared - #{orderId} | Customer | Immediate |
| Order On Hold | `order.on_hold` | Action Required - Order #{orderId} On Hold | Customer | Immediate |
| Order Cancelled | `order.cancelled` | Order Cancelled - #{orderId} | Customer | Immediate |
| Shipping Notification | `order.shipped` | Your Order Has Shipped - #{orderId} | Customer | Immediate |
| Delivery Confirmation | `order.delivered` | Your Order Has Been Delivered | Customer | Immediate |
| Tracking Update | `shipping.tracking_updated` | Shipping Update - Order #{orderId} | Customer | Immediate |
| Delivery Exception | `shipping.delivery_exception` | Delivery Issue with Order #{orderId} | Customer | Immediate |
| Payment Received | `payment.succeeded` | Payment Confirmed - Order #{orderId} | Customer | Immediate |
| Payment Failed | `payment.failed` | Payment Issue with Your Order | Customer | Immediate |
| Refund Processed | `payment.refunded` | Refund Processed - #{orderId} | Customer | Immediate |
| Return Request Received | `return.requested` | Return Request Received - #{orderId} | Customer | Immediate |
| Return Approved | `return.approved` | Your Return Has Been Approved | Customer | Immediate |
| Return Denied | `return.denied` | Return Request Update | Customer | Immediate |
| Support Ticket Confirmation | `support.ticket_created` | Support Ticket Created - #{{ticketId}} | Customer | Immediate |
| Support Ticket Reply | `support.ticket_reply` | Reply to Your Support Ticket | Customer | Immediate |
| Ticket Resolved | `support.ticket_resolved` | Your Support Ticket Has Been Resolved | Customer | Immediate |
| Ticket Closed | `support.ticket_closed` | Support Ticket Closed - #{{ticketId}} | Customer | Immediate |
| Review Request | `order.delivered` | How was your order? Leave a review! | Customer | Batched |
| Review Published | `review.approved` | Your Review Has Been Published! | Customer | Batched |
| Review Rejected | `review.rejected` | Update on Your Review Submission | Customer | Batched |
| Abandoned Cart | `cart.abandoned` | You left items in your cart | Customer | Batched |
| Checkout Abandoned | `checkout.abandoned` | Complete Your Order - Items Reserved | Customer | Immediate |
| Wishlist Shared | `wishlist.shared` | {{userName}} shared a wishlist with you! | Customer | Immediate |
| Price Drop Alert | `product.price_dropped` | Price Drop! {{productName}} is now on sale | Customer | Batched |
| Back in Stock | `inventory.restocked` | {{productName}} is Back in Stock! | Customer | Immediate |
| New Order (Admin) | `order.placed` | New Order Received - #{orderId} | Admin | Immediate |
| New Support Ticket (Admin) | `support.ticket_created` | New Support Ticket - #{{ticketId}} | Admin | Immediate |
| New Review (Admin) | `review.submitted` | New Review Pending Moderation | Admin | Batched |
| Review Reported (Admin) | `review.reported` | Review Reported - Action Required | Admin | Batched |
| Low Stock Alert (Admin) | `inventory.low_stock` | Low Stock Alert: {{productName}} | Admin | Batched |
| Out of Stock Alert (Admin) | `inventory.out_of_stock` | Out of Stock: {{productName}} | Admin | Immediate |
| Sync Failed Alert (Admin) | `sync.failed` | Sync Failed: {{syncType}} | Admin | Immediate |
| Coupon Expiring (Admin) | `coupon.expired` | Coupon Expired: {{couponCode}} | Admin | Batched |

---

## 4. Routes

> Source: Airtable Routes table

### 4.1 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Email Templates | `/admin/settings/emails` | _admin | Yes | Admin |

---

## 5. Data Model

### 5.1 Tables

```typescript
// admin-app/packages/backend/convex/schema.ts

// Email templates - synced from Airtable
emailTemplates: defineTable({
  name: v.string(),                    // "Order Confirmation"
  description: v.optional(v.string()), // Template purpose description
  eventCode: v.string(),               // "order.placed" - event that triggers this
  subjectTemplate: v.string(),         // "Order Confirmed - #{orderId}"
  bodyHtml: v.string(),                // HTML body with variables
  bodyText: v.optional(v.string()),    // Plain text fallback
  recipientType: v.union(
    v.literal("customer"),             // Send to customer email
    v.literal("admin"),                // Send to admin email
    v.literal("staff"),                // Send to assigned staff
    v.literal("custom")                // Use recipient from event payload
  ),
  provider: v.string(),                // "resend" or "sendgrid"
  priority: v.union(
    v.literal("immediate"),            // Send immediately
    v.literal("batched")               // Queue for batch sending
  ),
  isEnabled: v.boolean(),              // Toggle on/off
  status: v.union(
    v.literal("draft"),
    v.literal("active"),
    v.literal("disabled")
  ),

  // Design
  layoutId: v.optional(v.id("emailLayouts")), // Optional wrapper layout

  // Airtable sync
  airtableId: v.optional(v.string()),
  syncedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_event", ["eventCode"])
  .index("by_status", ["status"])
  .index("by_airtable_id", ["airtableId"]),

// Email layouts (master templates)
emailLayouts: defineTable({
  name: v.string(),                    // "Default", "Marketing", "Transactional"
  headerHtml: v.string(),              // Header HTML with logo
  footerHtml: v.string(),              // Footer HTML with unsubscribe, etc.
  styles: v.optional(v.string()),      // CSS styles
  isDefault: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}),

// Email queue - pending sends
emailQueue: defineTable({
  templateId: v.id("emailTemplates"),
  recipientEmail: v.string(),
  recipientName: v.optional(v.string()),
  variables: v.string(),               // JSON string of template variables
  eventId: v.optional(v.id("eventLog")), // Link to triggering event
  priority: v.union(
    v.literal("immediate"),
    v.literal("batched")
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("processing"),
    v.literal("sent"),
    v.literal("failed"),
    v.literal("cancelled")
  ),
  attempts: v.number(),                // Retry count
  maxAttempts: v.number(),             // Max retries (default 3)
  lastAttemptAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  scheduledFor: v.optional(v.number()), // For delayed sends
  sentAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_status", ["status"])
  .index("by_priority_status", ["priority", "status"])
  .index("by_scheduled", ["scheduledFor"])
  .index("by_recipient", ["recipientEmail"]),

// Email send log - history
emailLog: defineTable({
  templateId: v.id("emailTemplates"),
  templateName: v.string(),            // Denormalized for history
  eventCode: v.string(),               // Denormalized for filtering
  recipientEmail: v.string(),
  recipientName: v.optional(v.string()),
  recipientType: v.string(),           // "customer", "admin", etc.
  subject: v.string(),                 // Rendered subject
  variables: v.string(),               // JSON of variables used
  status: v.union(
    v.literal("sent"),
    v.literal("delivered"),
    v.literal("bounced"),
    v.literal("complained"),
    v.literal("failed")
  ),
  provider: v.string(),                // "resend"
  providerId: v.optional(v.string()),  // Resend message ID
  error: v.optional(v.string()),       // Error message if failed
  metadata: v.optional(v.string()),    // JSON of provider response
  sentAt: v.number(),
  deliveredAt: v.optional(v.number()),
  openedAt: v.optional(v.number()),    // If tracking enabled
  clickedAt: v.optional(v.number()),   // If tracking enabled
})
  .index("by_recipient", ["recipientEmail"])
  .index("by_template", ["templateId"])
  .index("by_event", ["eventCode"])
  .index("by_status", ["status"])
  .index("by_sent_at", ["sentAt"]),

// Email preferences per user
emailPreferences: defineTable({
  userId: v.id("users"),
  // Opt-out of specific categories
  orderEmails: v.boolean(),            // Default: true
  shippingEmails: v.boolean(),         // Default: true
  reviewRequests: v.boolean(),         // Default: true
  cartReminders: v.boolean(),          // Default: true
  wishlistAlerts: v.boolean(),         // Default: true
  supportEmails: v.boolean(),          // Default: true
  // Global opt-out
  unsubscribedAt: v.optional(v.number()),
  unsubscribeReason: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"]),
```

### 5.2 Relationships

```
emailTemplates
  ↓ (one-to-many)
emailQueue.templateId
  ↓ (one-to-many)
emailLog.templateId

emailLayouts
  ↓ (one-to-many)
emailTemplates.layoutId

users
  ↓ (one-to-one)
emailPreferences.userId
```

### 5.3 Template Variables

Standard variables available to all templates:

| Variable | Type | Description |
|----------|------|-------------|
| `{{storeName}}` | string | Store name from settings |
| `{{storeUrl}}` | string | Base URL |
| `{{supportEmail}}` | string | Support email address |
| `{{currentYear}}` | number | Current year for copyright |
| `{{unsubscribeUrl}}` | string | Unsubscribe link |

Event-specific variables are passed in the event payload.

---

## 6. Actions

> Source: Airtable Actions table

### 6.1 System Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Send Email | `email.send` | Send a transactional email via template | System |

### 6.2 Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Manage Email Templates | `email.manage_templates` | View and edit email templates | Admin |
| View Email History | `email.view_history` | View sent email log and delivery status | Manager, Admin |

---

## 7. Events

### 7.1 Events Consumed

The Email Notification System listens to ALL events that have associated email templates. Here are the key events:

| Event | Handler | Templates Triggered |
|-------|---------|---------------------|
| `user.registered` | sendWelcomeEmail | Welcome Email |
| `user.password_reset_requested` | sendPasswordResetEmail | Password Reset |
| `order.placed` | sendOrderConfirmation | Order Confirmation, New Order (Admin) |
| `order.shipped` | sendShippingNotification | Shipping Notification |
| `order.delivered` | sendDeliveryConfirmation | Delivery Confirmation, Review Request |
| `payment.failed` | sendPaymentFailedEmail | Payment Failed |
| `support.ticket_created` | sendTicketConfirmation | Support Ticket Confirmation, New Ticket (Admin) |
| ... | ... | ... |

### 7.2 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Email Sent | `email.sent` | After successful send | `{ emailLogId: Id, templateId: Id, recipient: string }` |
| Email Failed | `email.failed` | After all retries exhausted | `{ queueId: Id, templateId: Id, recipient: string, error: string }` |
| Email Delivered | `email.delivered` | Webhook from provider | `{ emailLogId: Id, providerId: string }` |
| Email Bounced | `email.bounced` | Webhook from provider | `{ emailLogId: Id, bounceType: string }` |

---

## 8. Notifications

### 8.1 Admin Notifications

| Event | Notification |
|-------|--------------|
| `email.failed` | Critical alert if important emails fail |
| High bounce rate | Warning notification |

---

## 9. User Interface

### 9.1 Components Needed

**Admin App:**

- [ ] `EmailTemplateList` - List all templates with filters
- [ ] `EmailTemplateCard` - Template row with status toggle
- [ ] `EmailTemplateEditor` - Edit subject and body
- [ ] `TemplateVariableHelper` - Show available variables
- [ ] `EmailPreview` - Preview rendered email
- [ ] `EmailHistoryTable` - Searchable send history
- [ ] `EmailHistoryDetail` - Single email details
- [ ] `ResendButton` - Resend failed email
- [ ] `TemplateToggle` - Enable/disable template

### 9.2 Admin UI: Email Templates Page

```
/admin/settings/emails

┌─────────────────────────────────────────────────────────────────┐
│  Email Templates                     [Sync from Airtable] 🔄    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [All] [Order] [Auth] [Support] [Admin]     🔍 Search...       │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📧 Order Confirmation                                     │  │
│  │ Event: order.placed • Recipient: Customer                 │  │
│  │ Subject: Order Confirmed - #{orderId}                     │  │
│  │                                                           │  │
│  │ Priority: Immediate         Status: Active [Toggle ✓]     │  │
│  │                                      [Preview] [Edit]     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📧 Shipping Notification                                  │  │
│  │ Event: order.shipped • Recipient: Customer                │  │
│  │ Subject: Your Order Has Shipped - #{orderId}              │  │
│  │                                                           │  │
│  │ Priority: Immediate         Status: Active [Toggle ✓]     │  │
│  │                                      [Preview] [Edit]     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 📧 Review Request                                         │  │
│  │ Event: order.delivered • Recipient: Customer              │  │
│  │ Subject: How was your order? Leave a review!              │  │
│  │                                                           │  │
│  │ Priority: Batched           Status: Active [Toggle ✓]     │  │
│  │                                      [Preview] [Edit]     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Template Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Template: Order Confirmation                   [X Close]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Name: [Order Confirmation__________________]                   │
│                                                                 │
│  Event Trigger: order.placed (Read-only)                        │
│  Recipient Type: [Customer ▼]                                   │
│  Priority: [Immediate ▼]                                        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Subject Line:                                                  │
│  [Order Confirmed - #{orderId}________________________]         │
│                                                                 │
│  Available Variables: {{orderId}}, {{customer_name}},           │
│  {{order_total}}, {{items}}, {{shipping_address}}               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Email Body:                                            [HTML]  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ <h1>Thank you for your order!</h1>                      │   │
│  │                                                         │   │
│  │ <p>Hi {{customer_name}},</p>                            │   │
│  │                                                         │   │
│  │ <p>We've received your order <strong>#{orderId}</strong>│   │
│  │ and it's being prepared for shipment.</p>               │   │
│  │                                                         │   │
│  │ <h2>Order Summary</h2>                                  │   │
│  │ {{#each items}}                                         │   │
│  │   <div>{{name}} x {{quantity}} - {{price}}</div>        │   │
│  │ {{/each}}                                               │   │
│  │                                                         │   │
│  │ <p><strong>Total: {{order_total}}</strong></p>          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Preview Email]              [Cancel]  [Save Changes]          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Email History

```
/admin/settings/emails/history

┌─────────────────────────────────────────────────────────────────┐
│  Email History                          Last 30 days ▼         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [All] [Sent] [Delivered] [Failed]     🔍 Search recipient...  │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ Template        │ Recipient          │ Status  │ Sent     ││
│  ├────────────────────────────────────────────────────────────┤│
│  │ Order Confirm   │ john@example.com   │ ✓ Sent  │ 2m ago   ││
│  │ Shipping Note   │ jane@example.com   │ ✓ Sent  │ 15m ago  ││
│  │ Password Reset  │ bob@example.com    │ ✓ Sent  │ 1h ago   ││
│  │ Review Request  │ alice@example.com  │ ✗ Failed│ 2h ago   ││
│  │ Welcome Email   │ new@example.com    │ ✓ Sent  │ 3h ago   ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  Showing 1-20 of 1,234 emails                    [← Prev] [Next →]│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.5 States

| State | Description | UI Behavior |
|-------|-------------|-------------|
| Loading | Fetching templates | Skeleton list |
| Empty | No templates (shouldn't happen) | Sync prompt |
| Saving | Updating template | Disabled form, spinner |
| Preview | Rendering email preview | Modal with rendered HTML |
| Sending | Resending email | Loading button |

---

## 10. Business Rules

### 10.1 Validation Rules

| Rule | Description |
|------|-------------|
| Subject required | Subject template cannot be empty |
| Body required | HTML body cannot be empty |
| Valid event | Event code must exist in Event System |
| Unique event | Only one active template per event (unless different recipient types) |

### 10.2 Business Logic

**Email Dispatch Flow:**
1. Event System emits event
2. Email listener queries for templates matching event code
3. For each template:
   a. Check if enabled
   b. Check recipient preferences (if customer email)
   c. Render subject and body with event payload variables
   d. Add to email queue
4. Queue processor sends emails via Resend
5. On success: Log to emailLog, emit `email.sent`
6. On failure: Retry up to 3 times, then fail permanently

**Priority Handling:**
- **Immediate:** Sent within seconds
- **Batched:** Collected and sent in hourly batches (reduces cost, allows digest)

**Recipient Resolution:**
```typescript
function resolveRecipient(template, event, ctx) {
  switch (template.recipientType) {
    case "customer":
      return event.payload.email;
    case "admin":
      return ctx.settings.adminEmail;
    case "staff":
      return getAssignedStaffEmail(event);
    case "custom":
      return event.payload.recipientEmail;
  }
}
```

### 10.3 Edge Cases

| Case | Handling |
|------|----------|
| User unsubscribed | Skip send, log as "skipped" |
| Invalid email format | Log error, don't queue |
| Template disabled | Skip send, no logging |
| Event has no templates | Silent no-op |
| Resend API down | Retry with exponential backoff |
| Duplicate sends | Dedupe by event ID + template ID |

---

## 11. API Design

### 11.1 Queries (Read Operations)

```typescript
// List email templates
export const listTemplates = query({
  args: {
    category: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.manage_templates");

    let templates = await ctx.db.query("emailTemplates").collect();

    if (args.status) {
      templates = templates.filter((t) => t.status === args.status);
    }

    return templates;
  },
});

// Get template by event code
export const getTemplateByEvent = query({
  args: { eventCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailTemplates")
      .withIndex("by_event", (q) => q.eq("eventCode", args.eventCode))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();
  },
});

// Get email history
export const getEmailHistory = query({
  args: {
    recipient: v.optional(v.string()),
    templateId: v.optional(v.id("emailTemplates")),
    eventCode: v.optional(v.string()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.view_history");

    let query = ctx.db.query("emailLog").withIndex("by_sent_at").order("desc");

    const logs = await query.take(args.limit || 50);

    // Filter in memory (Convex limitation)
    let filtered = logs;
    if (args.recipient) {
      filtered = filtered.filter((l) =>
        l.recipientEmail.includes(args.recipient!)
      );
    }
    if (args.status) {
      filtered = filtered.filter((l) => l.status === args.status);
    }

    return filtered;
  },
});

// Preview email with variables
export const previewEmail = query({
  args: {
    templateId: v.id("emailTemplates"),
    variables: v.optional(v.string()), // JSON string
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.manage_templates");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    const vars = args.variables ? JSON.parse(args.variables) : getSampleVariables(template.eventCode);

    return {
      subject: renderTemplate(template.subjectTemplate, vars),
      body: renderTemplate(template.bodyHtml, vars),
    };
  },
});
```

### 11.2 Mutations (Write Operations)

```typescript
// Update email template
export const updateTemplate = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    subjectTemplate: v.optional(v.string()),
    bodyHtml: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    priority: v.optional(v.union(v.literal("immediate"), v.literal("batched"))),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.manage_templates");

    const { templateId, ...updates } = args;

    const template = await ctx.db.get(templateId);
    if (!template) throw new Error("Template not found");

    await ctx.db.patch(templateId, {
      ...updates,
      updatedAt: Date.now(),
    });

    return templateId;
  },
});

// Toggle template enabled/disabled
export const toggleTemplate = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.manage_templates");

    await ctx.db.patch(args.templateId, {
      isEnabled: args.enabled,
      status: args.enabled ? "active" : "disabled",
      updatedAt: Date.now(),
    });

    return args.templateId;
  },
});

// Queue email for sending (internal use)
export const queueEmail = mutation({
  args: {
    templateId: v.id("emailTemplates"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    variables: v.string(),
    eventId: v.optional(v.id("eventLog")),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");
    if (!template.isEnabled) return null; // Silently skip disabled templates

    return await ctx.db.insert("emailQueue", {
      templateId: args.templateId,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      variables: args.variables,
      eventId: args.eventId,
      priority: template.priority,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
      scheduledFor: args.scheduledFor,
      createdAt: Date.now(),
    });
  },
});

// Resend a failed email
export const resendEmail = mutation({
  args: { emailLogId: v.id("emailLog") },
  handler: async (ctx, args) => {
    await checkPermission(ctx, "email.view_history");

    const log = await ctx.db.get(args.emailLogId);
    if (!log) throw new Error("Email not found");

    // Re-queue
    return await ctx.db.insert("emailQueue", {
      templateId: log.templateId,
      recipientEmail: log.recipientEmail,
      recipientName: log.recipientName,
      variables: log.variables,
      priority: "immediate",
      status: "pending",
      attempts: 0,
      maxAttempts: 1,
      createdAt: Date.now(),
    });
  },
});
```

### 11.3 Actions (External/Async Operations)

```typescript
// Process email queue (scheduled task)
export const processEmailQueue = action({
  args: {},
  handler: async (ctx) => {
    // Get pending emails
    const pending = await ctx.runQuery(internal.email.getPendingEmails, {
      limit: 50,
    });

    let sent = 0;
    let failed = 0;

    for (const email of pending) {
      try {
        // Mark as processing
        await ctx.runMutation(internal.email.markProcessing, {
          queueId: email._id,
        });

        // Get template
        const template = await ctx.runQuery(internal.email.getTemplate, {
          templateId: email.templateId,
        });

        // Render email
        const variables = JSON.parse(email.variables);
        const subject = renderTemplate(template.subjectTemplate, variables);
        const body = renderTemplate(template.bodyHtml, variables);

        // Send via Resend
        const result = await sendViaResend({
          to: email.recipientEmail,
          subject,
          html: body,
        });

        // Log success
        await ctx.runMutation(internal.email.logSuccess, {
          queueId: email._id,
          templateId: email.templateId,
          templateName: template.name,
          eventCode: template.eventCode,
          recipientEmail: email.recipientEmail,
          recipientName: email.recipientName,
          subject,
          variables: email.variables,
          providerId: result.id,
        });

        sent++;
      } catch (error) {
        // Handle failure
        await ctx.runMutation(internal.email.handleFailure, {
          queueId: email._id,
          error: error.message,
        });
        failed++;
      }
    }

    return { sent, failed };
  },
});

// Send via Resend API
async function sendViaResend(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend API error: ${response.statusText}`);
  }

  return await response.json();
}

// Event listener: Handle all events for email dispatch
export const handleEventForEmail = action({
  args: {
    eventCode: v.string(),
    payload: v.string(), // JSON
  },
  handler: async (ctx, args) => {
    // Get templates for this event
    const templates = await ctx.runQuery(api.email.getTemplateByEvent, {
      eventCode: args.eventCode,
    });

    if (templates.length === 0) return { queued: 0 };

    const payload = JSON.parse(args.payload);
    let queued = 0;

    for (const template of templates) {
      // Check recipient preferences if customer email
      if (template.recipientType === "customer" && payload.userId) {
        const canSend = await ctx.runQuery(internal.email.checkPreferences, {
          userId: payload.userId,
          eventCode: args.eventCode,
        });
        if (!canSend) continue;
      }

      // Resolve recipient
      const recipient = resolveRecipient(template, payload);

      // Queue email
      await ctx.runMutation(api.email.queueEmail, {
        templateId: template._id,
        recipientEmail: recipient,
        recipientName: payload.customer_name || payload.name,
        variables: args.payload,
      });

      queued++;
    }

    return { queued };
  },
});
```

---

## 12. Security Considerations

### 12.1 Authentication Requirements

| Route/Action | Requirement |
|--------------|-------------|
| View templates | Admin role |
| Edit templates | Admin role |
| View history | Manager+ role |
| Resend email | Manager+ role |

### 12.2 Authorization Rules

1. **No Direct Sends:** Emails can only be sent via events, not directly
2. **API Key Protection:** Resend API key is server-side only
3. **No Customer Edit:** Customers cannot edit templates
4. **Audit Trail:** All sends are logged

### 12.3 Data Privacy

1. **Email addresses are PII** - Handle according to GDPR
2. **Variables may contain PII** - Log variables are admin-only
3. **Unsubscribe required** - All emails must have unsubscribe link
4. **No sensitive data in subjects** - Subjects may be visible in previews

---

## 13. Testing Strategy

### 13.1 Unit Tests

- [ ] Template rendering with variables
- [ ] Recipient resolution logic
- [ ] Queue processing logic
- [ ] Retry/failure handling

### 13.2 Integration Tests

- [ ] Event → Queue → Send flow
- [ ] Resend API integration (use test mode)
- [ ] Webhook handling
- [ ] Preference checks

### 13.3 E2E Tests

- [ ] Admin edits template
- [ ] Admin previews email
- [ ] Admin views history
- [ ] Admin resends failed email

---

## 14. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition for templates, queue, log
- [ ] Basic template CRUD
- [ ] Queue processing action
- [ ] Resend API integration

### Phase 2: Core Features
- [ ] Admin templates page
- [ ] Template editor
- [ ] Preview functionality
- [ ] Enable/disable toggles

### Phase 3: Integration
- [ ] Event listener setup
- [ ] Hook into Event System
- [ ] History view
- [ ] Resend functionality

### Phase 4: Polish
- [ ] Email preferences
- [ ] Batch processing
- [ ] Webhook handling
- [ ] Error monitoring

---

## 15. Future Considerations

1. **Email Analytics** - Open/click tracking
2. **A/B Testing** - Test subject lines
3. **Marketing Campaigns** - Bulk email sends
4. **Multiple Providers** - SendGrid fallback
5. **Email Builder** - Visual WYSIWYG editor
6. **Digest Emails** - Combine multiple notifications

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Route | [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Templates | (See Email Notifications table - 43 records) |

### B. Resend Configuration

```env
RESEND_API_KEY=re_xxxxxxxx
FROM_EMAIL=orders@yourstore.com
ADMIN_EMAIL=admin@yourstore.com
```

### C. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Event System PRD](./PRD-EVENT-SYSTEM.md)
- [Airtable Sync System PRD](./PRD-AIRTABLE-SYNC.md) (when created)
- [Resend Documentation](https://resend.com/docs)

---

**PRD Version:** 1.0
**Created:** January 30, 2025
**Last Updated:** January 30, 2025
**Author:** Claude (AI Assistant)
