# PRD: Customer Support (Ticket System)

> **Status:** DRAFT - Awaiting Review & Enhancement
> **System Code:** SUP-TKT
> **Phase:** 5 of 6 (Post-Order & Engagement)
> **Priority:** P2 - Medium
> **Complexity:** Medium
> **Airtable Record:** [redacted-airtable-record-id]

---

## 1. Overview

### 1.1 Purpose

The Customer Support system provides a ticket-based support channel integrated with the shopping cart. Customers can submit questions, report issues, and request help with orders. Support staff can manage tickets, view customer order history in context, and provide efficient assistance. The system is tightly integrated with order data to provide relevant context for each support request.

### 1.2 Scope

- Support ticket creation and management
- Contact form on storefront
- Customer ticket history in account dashboard
- Admin ticket queue with assignment and status tracking
- Order context linking (attach ticket to specific order)
- Product context linking (question about specific product)
- Canned responses for common issues
- Ticket priority and categorization
- SLA tracking (response time goals)
- Real-time updates via Convex subscriptions

### 1.3 Out of Scope

- Live chat (separate system, could integrate later)
- Phone support logging
- Knowledge base/FAQ (separate content system)
- AI-powered responses (future enhancement)
- Multi-channel support (social media, etc.)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Customer Accounts | USR-ACT | 1 | Ticket ownership |
| Order Management | ORD-MGT | 4 | Order context for tickets |
| Email Notifications | COM-EML | 1 | Ticket update emails |
| Site Notifications | COM-NOT | 1 | In-app ticket notifications |
| Product Catalog | CAT-PRD | 2 | Product context for pre-sale questions |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Returns & Refunds | SUP-RTN | 5 | Return request tickets |
| Admin Dashboard | ADM-DSH | 6 | Support metrics widgets |
| Analytics & Reporting | ADM-RPT | 6 | Support analytics |

### 2.3 Integration Hooks to Implement

- Ticket creation from order page
- Ticket creation from product page
- Support metrics for dashboard
- Email reply parsing (future)

---

## 3. Routes

### 3.1 Customer-Facing Routes (Website App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Contact Form | /contact | _marketing | No | public |
| My Tickets | /account/tickets | _account | Yes | customer |
| Ticket Detail | /account/tickets/:ticketId | _account | Yes | customer |

### 3.2 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Ticket Queue | /admin/support | _admin | Yes | support, staff, manager, admin |
| Ticket Detail | /admin/support/:ticketId | _admin | Yes | support, staff, manager, admin |
| Canned Responses | /admin/support/canned-responses | _admin | Yes | manager, admin |
| Support Settings | /admin/settings/support | _admin | Yes | admin |

---

## 4. Data Model

### 4.1 Tables

```typescript
// Support tickets
support_tickets: defineTable({
  // Ticket identity
  ticketNumber: v.string(),           // Human-readable: "TKT-2025-001234"

  // Customer info
  userId: v.optional(v.id("user_profiles")), // Null for guest submissions
  guestEmail: v.optional(v.string()), // For guest tickets
  guestName: v.optional(v.string()),

  // Ticket content
  subject: v.string(),
  category: v.union(
    v.literal("order_issue"),
    v.literal("product_question"),
    v.literal("shipping"),
    v.literal("returns"),
    v.literal("billing"),
    v.literal("account"),
    v.literal("technical"),
    v.literal("other"),
  ),

  // Context links
  orderId: v.optional(v.id("order_records")),
  productId: v.optional(v.id("products")),

  // Status workflow
  status: v.union(
    v.literal("open"),           // New, awaiting response
    v.literal("pending_customer"), // Waiting for customer reply
    v.literal("pending_internal"), // Escalated internally
    v.literal("resolved"),       // Closed, issue resolved
    v.literal("closed"),         // Closed, no resolution needed
  ),

  // Priority
  priority: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("urgent"),
  ),

  // Assignment
  assignedTo: v.optional(v.id("user_profiles")), // Support staff

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
  firstResponseAt: v.optional(v.number()),
  resolvedAt: v.optional(v.number()),

  // SLA tracking
  slaDeadline: v.optional(v.number()),      // When response is due
  slaBreach: v.boolean(),                    // Missed SLA
})
  .index("by_ticket_number", ["ticketNumber"])
  .index("by_user", ["userId"])
  .index("by_status", ["status", "createdAt"])
  .index("by_assigned", ["assignedTo", "status"])
  .index("by_priority", ["priority", "status"])
  .index("by_order", ["orderId"])
  .index("by_sla", ["slaBreach", "status"])

// Ticket messages (thread)
ticket_messages: defineTable({
  ticketId: v.id("support_tickets"),

  // Sender
  senderId: v.optional(v.id("user_profiles")), // Null for system messages
  senderType: v.union(
    v.literal("customer"),
    v.literal("staff"),
    v.literal("system"),
  ),

  // Content
  body: v.string(),                       // Message text (HTML or markdown)
  isInternal: v.boolean(),                // Internal note (not visible to customer)

  // Attachments
  attachments: v.optional(v.array(v.object({
    mediaId: v.id("media"),
    filename: v.string(),
    size: v.number(),
  }))),

  createdAt: v.number(),
})
  .index("by_ticket", ["ticketId", "createdAt"])

// Canned responses
canned_responses: defineTable({
  title: v.string(),                      // Internal title
  body: v.string(),                       // Response template
  category: v.optional(v.string()),       // Category filter
  shortcut: v.optional(v.string()),       // Keyboard shortcut (e.g., "#shipping")
  usageCount: v.number(),                 // Track popularity
  createdBy: v.id("user_profiles"),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_category", ["category", "isActive"])
  .index("by_shortcut", ["shortcut"])

// SLA configuration
support_sla_config: defineTable({
  priority: v.string(),
  firstResponseHours: v.number(),         // Hours to first response
  resolutionHours: v.optional(v.number()), // Hours to resolution
  businessHoursOnly: v.boolean(),         // Only count business hours
})
```

---

## 5. Actions

### 5.1 Customer Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Submit Ticket | ticket.submit | Create new support ticket | customer, public |
| Reply to Ticket | ticket.reply | Add message to ticket | customer |
| Close Ticket | ticket.customer_close | Mark issue as resolved | customer |
| Reopen Ticket | ticket.reopen | Reopen closed ticket | customer |

### 5.2 Staff/Admin Actions

| Action | Code | Description | Roles |
|--------|------|-------------|-------|
| Reply to Ticket | ticket.staff_reply | Add staff response | support, staff, manager, admin |
| Add Internal Note | ticket.internal_note | Add private note | support, staff, manager, admin |
| Assign Ticket | ticket.assign | Assign to staff member | manager, admin |
| Change Priority | ticket.change_priority | Update ticket priority | support, staff, manager, admin |
| Change Status | ticket.change_status | Update ticket status | support, staff, manager, admin |
| Merge Tickets | ticket.merge | Combine duplicate tickets | manager, admin |

---

## 6. Events

### 6.1 Events Emitted

| Event | Code | Trigger | Payload |
|-------|------|---------|---------|
| Ticket Created | ticket.created | Customer submits ticket | `{ ticketId, ticketNumber, category, userId? }` |
| Ticket Replied | ticket.replied | New message added | `{ ticketId, messageId, senderType }` |
| Ticket Assigned | ticket.assigned | Ticket assigned to staff | `{ ticketId, assignedTo }` |
| Ticket Resolved | ticket.resolved | Ticket marked resolved | `{ ticketId, resolvedBy }` |
| SLA Breached | ticket.sla_breached | Response time exceeded | `{ ticketId, priority }` |

### 6.2 Events Consumed

| Event | Source System | Handler |
|-------|---------------|---------|
| order.issue_reported | Order Management | Auto-create ticket |
| return.requested | Returns & Refunds | Link return to ticket |

---

## 7. Notifications

### 7.1 Email Notifications

| Name | Trigger Event | Recipient | Template Variables |
|------|---------------|-----------|-------------------|
| Ticket Confirmation | ticket.created | customer | `{{ticketNumber}}, {{subject}}, {{ticketUrl}}` |
| Staff Reply | ticket.replied (staff) | customer | `{{ticketNumber}}, {{replyPreview}}, {{ticketUrl}}` |
| Ticket Resolved | ticket.resolved | customer | `{{ticketNumber}}, {{subject}}` |
| New Ticket Alert | ticket.created | support staff | `{{ticketNumber}}, {{subject}}, {{category}}` |
| SLA Warning | ticket.sla_warning | assigned staff | `{{ticketNumber}}, {{timeRemaining}}` |

### 7.2 Site Notifications

| Name | Trigger Event | Recipient | Message |
|------|---------------|-----------|---------|
| Ticket Update | ticket.replied | customer | "New reply on ticket #{{ticketNumber}}" |
| Ticket Assigned | ticket.assigned | staff | "Ticket #{{ticketNumber}} assigned to you" |
| SLA Breach | ticket.sla_breached | manager | "SLA breached on ticket #{{ticketNumber}}" |

---

## 8. User Interface

### 8.1 Components Needed

- [ ] `ContactForm` - Public contact form
- [ ] `TicketList` - Customer's ticket history
- [ ] `TicketDetail` - Full ticket view with message thread
- [ ] `TicketMessageComposer` - Reply form with attachments
- [ ] `TicketStatusBadge` - Status indicator
- [ ] `TicketPriorityBadge` - Priority indicator
- [ ] `AdminTicketQueue` - Staff ticket list with filters
- [ ] `AdminTicketDetail` - Staff ticket view with actions
- [ ] `CannedResponseSelector` - Quick response picker
- [ ] `InternalNoteIndicator` - Mark internal notes visually
- [ ] `OrderContextCard` - Display linked order info
- [ ] `TicketAssignmentDropdown` - Assign to staff

### 8.2 Contact Form

```
┌────────────────────────────────────────────────────────────────┐
│  Contact Us                                                     │
├────────────────────────────────────────────────────────────────┤
│  How can we help?                                               │
│                                                                 │
│  Name*           [____________________]                         │
│  Email*          [____________________]                         │
│                                                                 │
│  Category*       [Order Issue ▼]                                │
│                   - Order Issue                                  │
│                   - Product Question                             │
│                   - Shipping                                     │
│                   - Returns                                      │
│                   - Billing                                      │
│                   - Account                                      │
│                   - Technical                                    │
│                   - Other                                        │
│                                                                 │
│  Order Number    [____________________] (if applicable)         │
│                                                                 │
│  Subject*        [____________________]                         │
│                                                                 │
│  Message*        [                                              │
│                   ____________________________________          │
│                   ____________________________________          │
│                   ____________________________________]         │
│                                                                 │
│  Attachments     [📎 Add files]                                 │
│                                                                 │
│                  [Submit Request]                               │
└────────────────────────────────────────────────────────────────┘
```

### 8.3 Admin Ticket Queue

```
┌────────────────────────────────────────────────────────────────┐
│  Support Tickets                              [+ New Ticket]   │
├────────────────────────────────────────────────────────────────┤
│  Filters: [Open ▼] [All Priority ▼] [All Category ▼]          │
│           [Assigned to Me □] [Unassigned □] [SLA Breach □]    │
├────────────────────────────────────────────────────────────────┤
│  🔴 TKT-2025-001234  |  Urgent  |  Order Issue               │
│  "Wrong item received"  |  John D.  |  2h ago                 │
│  Order: #ORD-2025-4567  |  Unassigned  |  ⚠️ SLA in 1h        │
├────────────────────────────────────────────────────────────────┤
│  🟡 TKT-2025-001233  |  Medium  |  Product Question          │
│  "Compatibility question"  |  Sarah M.  |  5h ago             │
│  Product: Widget Pro  |  Assigned: Mike S.                    │
├────────────────────────────────────────────────────────────────┤
│  🟢 TKT-2025-001232  |  Low  |  Shipping                     │
│  "When will my order ship?"  |  Guest  |  1d ago             │
│  Order: #ORD-2025-4566  |  Pending Customer                   │
└────────────────────────────────────────────────────────────────┘
```

---

## 9. Business Rules

### 9.1 SLA Configuration (Default)

| Priority | First Response | Resolution Target |
|----------|----------------|-------------------|
| Urgent | 1 hour | 4 hours |
| High | 4 hours | 24 hours |
| Medium | 8 hours | 48 hours |
| Low | 24 hours | 72 hours |

### 9.2 Auto-Priority Rules

- Order issues with pending delivery → High
- Billing/payment issues → High
- Guest tickets → Medium
- Pre-sale product questions → Medium

### 9.3 Status Workflow

```
[Open] → [Pending Customer] → [Resolved]
   ↓           ↓                  ↓
   └──→ [Pending Internal] ──→ [Closed]
                ↑                  ↓
                └────── [Reopen] ──┘
```

### 9.4 Auto-Actions

- Auto-assign to least-loaded support staff (optional)
- Auto-close after 7 days with no customer response (when pending_customer)
- Send satisfaction survey after resolution

---

## 10. API Design

### 10.1 Queries (Read Operations)

```typescript
// Get customer's tickets
export const getMyTickets = query({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    let query = ctx.db.query("support_tickets")
      .withIndex("by_user", q => q.eq("userId", user._id));

    if (args.status) {
      query = query.filter(q => q.eq(q.field("status"), args.status));
    }

    const tickets = await query.order("desc").collect();
    return tickets;
  },
});

// Get ticket with messages
export const getTicket = query({
  args: { ticketId: v.id("support_tickets") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);

    if (!ticket) throw new Error("Ticket not found");

    // Verify access (owner or staff)
    if (ticket.userId !== user?._id && !isStaff(user)) {
      throw new Error("Access denied");
    }

    // Get messages (filter internal if customer)
    let messages = await ctx.db.query("ticket_messages")
      .withIndex("by_ticket", q => q.eq("ticketId", args.ticketId))
      .collect();

    if (!isStaff(user)) {
      messages = messages.filter(m => !m.isInternal);
    }

    // Get linked data
    const order = ticket.orderId ? await ctx.db.get(ticket.orderId) : null;
    const product = ticket.productId ? await ctx.db.get(ticket.productId) : null;

    return { ...ticket, messages, order, product };
  },
});

// Admin: Get ticket queue
export const getTicketQueue = query({
  args: {
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedTo: v.optional(v.id("user_profiles")),
    unassignedOnly: v.optional(v.boolean()),
    slaBreach: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    let tickets = await ctx.db.query("support_tickets")
      .withIndex("by_status", q => q.eq("status", args.status || "open"))
      .collect();

    // Apply filters
    if (args.priority) {
      tickets = tickets.filter(t => t.priority === args.priority);
    }
    if (args.unassignedOnly) {
      tickets = tickets.filter(t => !t.assignedTo);
    }
    if (args.slaBreach) {
      tickets = tickets.filter(t => t.slaBreach);
    }

    // Enrich with customer data
    return Promise.all(tickets.map(async (t) => ({
      ...t,
      customer: t.userId ? await ctx.db.get(t.userId) : null,
    })));
  },
});

// Get canned responses
export const getCannedResponses = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireStaff(ctx);

    let query = ctx.db.query("canned_responses")
      .filter(q => q.eq(q.field("isActive"), true));

    if (args.category) {
      query = query.filter(q => q.eq(q.field("category"), args.category));
    }

    return query.collect();
  },
});
```

### 10.2 Mutations (Write Operations)

```typescript
// Submit new ticket
export const submitTicket = mutation({
  args: {
    subject: v.string(),
    body: v.string(),
    category: v.string(),
    orderId: v.optional(v.id("order_records")),
    productId: v.optional(v.id("products")),
    guestEmail: v.optional(v.string()),
    guestName: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("media"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    // Validate guest fields if not logged in
    if (!user && (!args.guestEmail || !args.guestName)) {
      throw new Error("Guest tickets require email and name");
    }

    // Generate ticket number
    const ticketNumber = await generateTicketNumber(ctx);

    // Determine priority
    const priority = determinePriority(args.category, args.orderId);

    // Calculate SLA deadline
    const slaConfig = await getSLAConfig(ctx, priority);
    const slaDeadline = Date.now() + (slaConfig.firstResponseHours * 60 * 60 * 1000);

    // Create ticket
    const ticketId = await ctx.db.insert("support_tickets", {
      ticketNumber,
      userId: user?._id,
      guestEmail: args.guestEmail,
      guestName: args.guestName,
      subject: args.subject,
      category: args.category,
      orderId: args.orderId,
      productId: args.productId,
      status: "open",
      priority,
      slaDeadline,
      slaBreach: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Create initial message
    await ctx.db.insert("ticket_messages", {
      ticketId,
      senderId: user?._id,
      senderType: "customer",
      body: args.body,
      isInternal: false,
      attachments: args.attachmentIds?.map(id => ({
        mediaId: id,
        filename: "", // Fetch from media
        size: 0,
      })),
      createdAt: Date.now(),
    });

    // Dispatch event
    await dispatchEvent(ctx, "ticket.created", {
      ticketId,
      ticketNumber,
      category: args.category,
      userId: user?._id,
    });

    return { ticketId, ticketNumber };
  },
});

// Reply to ticket (customer or staff)
export const replyToTicket = mutation({
  args: {
    ticketId: v.id("support_tickets"),
    body: v.string(),
    isInternal: v.optional(v.boolean()),
    attachmentIds: v.optional(v.array(v.id("media"))),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);

    if (!ticket) throw new Error("Ticket not found");

    // Determine sender type
    const isStaffMember = await isStaff(ctx);
    const senderType = isStaffMember ? "staff" : "customer";

    // Internal notes only for staff
    if (args.isInternal && !isStaffMember) {
      throw new Error("Only staff can add internal notes");
    }

    // Create message
    const messageId = await ctx.db.insert("ticket_messages", {
      ticketId: args.ticketId,
      senderId: user?._id,
      senderType,
      body: args.body,
      isInternal: args.isInternal || false,
      attachments: args.attachmentIds?.map(id => ({
        mediaId: id,
        filename: "",
        size: 0,
      })),
      createdAt: Date.now(),
    });

    // Update ticket
    const updates: any = { updatedAt: Date.now() };

    if (senderType === "staff" && !args.isInternal) {
      // Staff reply
      updates.status = "pending_customer";
      if (!ticket.firstResponseAt) {
        updates.firstResponseAt = Date.now();
      }
    } else if (senderType === "customer") {
      // Customer reply
      updates.status = "open";
    }

    await ctx.db.patch(args.ticketId, updates);

    // Dispatch event
    await dispatchEvent(ctx, "ticket.replied", {
      ticketId: args.ticketId,
      messageId,
      senderType,
    });

    return messageId;
  },
});

// Assign ticket
export const assignTicket = mutation({
  args: {
    ticketId: v.id("support_tickets"),
    assignedTo: v.id("user_profiles"),
  },
  handler: async (ctx, args) => {
    await requireManager(ctx);

    await ctx.db.patch(args.ticketId, {
      assignedTo: args.assignedTo,
      updatedAt: Date.now(),
    });

    await dispatchEvent(ctx, "ticket.assigned", {
      ticketId: args.ticketId,
      assignedTo: args.assignedTo,
    });
  },
});

// Resolve ticket
export const resolveTicket = mutation({
  args: {
    ticketId: v.id("support_tickets"),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const ticket = await ctx.db.get(args.ticketId);

    // Allow owner or staff to resolve
    if (ticket?.userId !== user?._id && !await isStaff(ctx)) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.ticketId, {
      status: "resolved",
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (args.resolutionNote) {
      await ctx.db.insert("ticket_messages", {
        ticketId: args.ticketId,
        senderId: user?._id,
        senderType: "system",
        body: `Ticket resolved: ${args.resolutionNote}`,
        isInternal: true,
        createdAt: Date.now(),
      });
    }

    await dispatchEvent(ctx, "ticket.resolved", {
      ticketId: args.ticketId,
      resolvedBy: user?._id,
    });
  },
});
```

---

## 11. Scheduled Jobs

### 11.1 SLA Monitoring

```typescript
// Check for SLA breaches (run every 15 minutes)
export const checkSLABreaches = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find tickets past SLA deadline that aren't breached yet
    const tickets = await ctx.db.query("support_tickets")
      .filter(q =>
        q.and(
          q.eq(q.field("slaBreach"), false),
          q.neq(q.field("status"), "resolved"),
          q.neq(q.field("status"), "closed"),
          q.lt(q.field("slaDeadline"), now)
        )
      )
      .collect();

    for (const ticket of tickets) {
      await ctx.db.patch(ticket._id, { slaBreach: true });
      await dispatchEvent(ctx, "ticket.sla_breached", {
        ticketId: ticket._id,
        priority: ticket.priority,
      });
    }
  },
});

// Auto-close stale tickets (run daily)
export const autoCloseStaleTickets = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    const staleTickets = await ctx.db.query("support_tickets")
      .filter(q =>
        q.and(
          q.eq(q.field("status"), "pending_customer"),
          q.lt(q.field("updatedAt"), sevenDaysAgo)
        )
      )
      .collect();

    for (const ticket of staleTickets) {
      await ctx.db.patch(ticket._id, {
        status: "closed",
        updatedAt: Date.now(),
      });

      await ctx.db.insert("ticket_messages", {
        ticketId: ticket._id,
        senderType: "system",
        body: "This ticket was automatically closed due to inactivity.",
        isInternal: false,
        createdAt: Date.now(),
      });
    }
  },
});
```

---

## 12. Security Considerations

### 12.1 Access Control

- Customers can only view their own tickets
- Staff can view all tickets
- Internal notes hidden from customers
- Attachment access verified

### 12.2 Data Privacy

- Customer data visible only to support staff
- Tickets anonymized in analytics
- Guest email not exposed in logs

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Schema definition (tickets, messages, canned responses)
- [ ] Ticket submission mutation
- [ ] Basic ticket queries

### Phase 2: Core Features
- [ ] Contact form page
- [ ] Customer ticket list and detail
- [ ] Staff reply functionality
- [ ] Ticket status management

### Phase 3: Integration
- [ ] Admin ticket queue
- [ ] Order/product context linking
- [ ] Email notifications
- [ ] Canned responses

### Phase 4: Polish
- [ ] SLA tracking and alerts
- [ ] Auto-assignment (optional)
- [ ] Satisfaction surveys
- [ ] Support analytics

---

## 14. Future Considerations

- **Live Chat:** Real-time chat with handoff to tickets
- **AI Responses:** Suggested responses based on similar tickets
- **Knowledge Base Integration:** Link to help articles
- **Multi-Channel:** Email, social media ticket creation
- **Customer Satisfaction (CSAT):** Post-resolution surveys

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | [redacted-airtable-record-id] |
| Routes | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Actions | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Events | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Email Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |
| Site Notifications | [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id], [redacted-airtable-record-id] |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Order Management PRD](./PRD-ORDER-MANAGEMENT.md)
- [Returns & Refunds PRD](./PRD-RETURNS-REFUNDS.md)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
