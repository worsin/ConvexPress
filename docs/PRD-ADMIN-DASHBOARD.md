# PRD: Admin Dashboard (ADM-DSH)

## Overview

**System ID:** ADM-DSH
**Category:** Business Management
**Priority:** P0 (Critical Path)
**Complexity:** Medium
**Status:** Not Started

### Purpose

The Admin Dashboard is the real-time command center for store operations. It provides live metrics, instant alerts, and actionable insights—all updating automatically without page refresh. This is where Convex's reactive architecture truly shines.

### Convex-Native Value

Traditional admin dashboards require manual refresh or polling for updates. Our Convex-native dashboard delivers:

- **Live Revenue Counters** - Watch revenue tick up in real-time as orders complete
- **Instant Order Notifications** - New orders appear immediately without refresh
- **Real-Time Inventory Alerts** - Low stock warnings appear the moment thresholds are crossed
- **Live Visitor Count** - See active shoppers browsing right now
- **Dynamic Conversion Funnel** - Watch users move through checkout in real-time

---

## Dependencies

### Requires

| System | Dependency Type | Purpose |
|--------|-----------------|---------|
| Auth System (USR-ATH) | Hard | Admin authentication |
| Order Management (ORD-MGT) | Soft | Order metrics and queue |
| Inventory System (BIZ-INV) | Soft | Stock alerts |
| Product Catalog (CAT-PRD) | Soft | Product metrics |
| Shopping Cart (ORD-CRT) | Soft | Active carts data |

### Required By

| System | Dependency Type | Purpose |
|--------|-----------------|---------|
| None | - | Top-level consumer |

---

## Routes

### Dashboard Routes

| Route | Path | Role | Description |
|-------|------|------|-------------|
| Dashboard Home | `/dashboard` | Admin | Main command center |
| Analytics | `/dashboard/analytics` | Admin | Deep analytics view |
| Live Activity | `/dashboard/activity` | Admin | Real-time activity feed |
| Alerts | `/dashboard/alerts` | Admin | Active alerts list |

---

## Data Model

### Dashboard Metrics (Real-time computed, not stored)

```typescript
// These are computed via queries, not stored
interface DashboardMetrics {
  // Revenue
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  revenueChange: number; // % vs previous period

  // Orders
  ordersToday: number;
  ordersThisWeek: number;
  ordersPending: number;
  ordersProcessing: number;

  // Inventory
  lowStockCount: number;
  outOfStockCount: number;

  // Activity
  activeVisitors: number;
  activeCarts: number;
  checkoutsInProgress: number;

  // Performance
  conversionRate: number;
  averageOrderValue: number;
  cartAbandonmentRate: number;
}
```

### Alerts Table

```typescript
alerts: defineTable({
  // Type
  type: v.union(
    v.literal("low_stock"),
    v.literal("out_of_stock"),
    v.literal("high_value_order"),
    v.literal("failed_payment"),
    v.literal("return_requested"),
    v.literal("review_flagged"),
    v.literal("system_error")
  ),

  // Priority
  priority: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),

  // Content
  title: v.string(),
  message: v.string(),
  metadata: v.optional(v.string()), // JSON

  // Reference
  entityType: v.optional(v.string()), // "product", "order", etc.
  entityId: v.optional(v.string()),

  // Status
  status: v.union(
    v.literal("active"),
    v.literal("acknowledged"),
    v.literal("resolved"),
    v.literal("dismissed")
  ),

  // Timestamps
  createdAt: v.number(),
  acknowledgedAt: v.optional(v.number()),
  acknowledgedBy: v.optional(v.id("users")),
  resolvedAt: v.optional(v.number()),
})
  .index("by_status", ["status"])
  .index("by_priority", ["priority"])
  .index("by_type", ["type"])
  .index("by_created", ["createdAt"])
```

### Activity Feed Table

```typescript
activityFeed: defineTable({
  // Activity type
  type: v.union(
    v.literal("order_placed"),
    v.literal("order_shipped"),
    v.literal("product_created"),
    v.literal("product_updated"),
    v.literal("customer_registered"),
    v.literal("review_posted"),
    v.literal("inventory_updated"),
    v.literal("coupon_used")
  ),

  // Content
  title: v.string(),
  description: v.optional(v.string()),
  metadata: v.optional(v.string()), // JSON

  // Actor
  actorType: v.union(
    v.literal("customer"),
    v.literal("admin"),
    v.literal("system"),
    v.literal("agent")
  ),
  actorId: v.optional(v.string()),
  actorName: v.optional(v.string()),

  // Reference
  entityType: v.optional(v.string()),
  entityId: v.optional(v.string()),

  timestamp: v.number(),
})
  .index("by_timestamp", ["timestamp"])
  .index("by_type", ["type"])
```

### Presence Tracking (for active visitors)

```typescript
adminPresence: defineTable({
  sessionId: v.string(),
  userId: v.optional(v.id("users")),

  // Current page
  currentPath: v.string(),
  currentProductId: v.optional(v.id("products")),
  currentCartId: v.optional(v.id("carts")),

  // Device info
  deviceType: v.union(
    v.literal("desktop"),
    v.literal("mobile"),
    v.literal("tablet")
  ),
  source: v.optional(v.string()), // UTM source

  // Timestamps
  startedAt: v.number(),
  lastActiveAt: v.number(),

  // Funnel stage
  stage: v.union(
    v.literal("browsing"),
    v.literal("product_view"),
    v.literal("cart"),
    v.literal("checkout"),
    v.literal("completed")
  ),
})
  .index("by_session", ["sessionId"])
  .index("by_last_active", ["lastActiveAt"])
  .index("by_stage", ["stage"])
```

---

## Real-Time Patterns

### Live Dashboard Metrics

```typescript
// Real-time metrics subscription
function DashboardHome() {
  // All these update LIVE - no refresh needed
  const metrics = useQuery(api.admin.dashboard.getMetrics);
  const recentOrders = useQuery(api.admin.dashboard.getRecentOrders, { limit: 5 });
  const alerts = useQuery(api.admin.dashboard.getActiveAlerts);
  const activity = useQuery(api.admin.dashboard.getActivityFeed, { limit: 10 });

  if (metrics === undefined) return <DashboardSkeleton />;

  return (
    <div className="grid gap-6">
      {/* Revenue updates in real-time */}
      <MetricsRow>
        <MetricCard
          title="Revenue Today"
          value={formatCurrency(metrics.revenueToday)}
          change={metrics.revenueChange}
        />
        <MetricCard
          title="Orders Today"
          value={metrics.ordersToday}
        />
        <MetricCard
          title="Active Visitors"
          value={metrics.activeVisitors}
          live
        />
        <MetricCard
          title="Conversion Rate"
          value={`${metrics.conversionRate}%`}
        />
      </MetricsRow>

      {/* Alerts appear instantly when triggered */}
      <AlertsPanel alerts={alerts ?? []} />

      {/* New orders appear live */}
      <RecentOrdersCard orders={recentOrders ?? []} />

      {/* Activity feed updates automatically */}
      <ActivityFeed items={activity ?? []} />
    </div>
  );
}
```

### Live Revenue Counter

```typescript
// Watch revenue tick up in real-time
function LiveRevenueCounter() {
  const revenue = useQuery(api.admin.dashboard.getTodayRevenue);

  return (
    <AnimatedNumber value={revenue ?? 0} prefix="$" />
  );
}
```

### Real-Time Conversion Funnel

```typescript
// See users move through funnel live
function ConversionFunnel() {
  const funnel = useQuery(api.admin.dashboard.getLiveFunnel);

  if (!funnel) return <FunnelSkeleton />;

  return (
    <FunnelChart
      stages={[
        { name: "Browsing", count: funnel.browsing },
        { name: "Product View", count: funnel.productView },
        { name: "Add to Cart", count: funnel.cart },
        { name: "Checkout", count: funnel.checkout },
        { name: "Purchase", count: funnel.completed },
      ]}
    />
  );
}
```

### Live Activity Feed

```typescript
// Activities appear instantly
function LiveActivityFeed() {
  const activities = useQuery(api.admin.dashboard.getActivityFeed, {
    limit: 20,
  });

  return (
    <div className="space-y-2">
      {activities?.map((activity) => (
        <ActivityItem
          key={activity._id}
          activity={activity}
          // New items animate in
          className="animate-slide-in"
        />
      ))}
    </div>
  );
}
```

---

## Convex Functions

### Dashboard Metrics Query

```typescript
export const getMetrics = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    const now = Date.now();
    const dayStart = getStartOfDay(now);
    const weekStart = getStartOfWeek(now);
    const monthStart = getStartOfMonth(now);

    // Get orders
    const allOrders = await ctx.db.query("orders").collect();
    const todayOrders = allOrders.filter((o) => o.placedAt >= dayStart);
    const weekOrders = allOrders.filter((o) => o.placedAt >= weekStart);
    const monthOrders = allOrders.filter((o) => o.placedAt >= monthStart);

    // Get inventory alerts
    const products = await ctx.db.query("products").collect();
    const lowStock = products.filter(
      (p) => p.stockCount > 0 && p.stockCount <= p.lowStockThreshold
    );
    const outOfStock = products.filter((p) => p.stockCount === 0);

    // Get active presence (last 5 minutes)
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const activePresence = await ctx.db
      .query("adminPresence")
      .withIndex("by_last_active")
      .filter((q) => q.gte(q.field("lastActiveAt"), fiveMinutesAgo))
      .collect();

    // Active carts (updated in last 30 minutes)
    const thirtyMinutesAgo = now - 30 * 60 * 1000;
    const activeCarts = await ctx.db
      .query("carts")
      .filter((q) => q.gte(q.field("lastActivityAt"), thirtyMinutesAgo))
      .collect();

    // Calculate conversion rate
    const sessionsToday = activePresence.filter((p) => p.startedAt >= dayStart);
    const completedToday = todayOrders.filter(
      (o) => o.status !== "cancelled"
    ).length;
    const conversionRate = sessionsToday.length > 0
      ? (completedToday / sessionsToday.length) * 100
      : 0;

    // Average order value
    const aov = todayOrders.length > 0
      ? todayOrders.reduce((sum, o) => sum + o.total, 0) / todayOrders.length
      : 0;

    return {
      revenueToday: todayOrders.reduce((sum, o) => sum + o.total, 0),
      revenueThisWeek: weekOrders.reduce((sum, o) => sum + o.total, 0),
      revenueThisMonth: monthOrders.reduce((sum, o) => sum + o.total, 0),

      ordersToday: todayOrders.length,
      ordersThisWeek: weekOrders.length,
      ordersPending: allOrders.filter((o) => o.status === "confirmed").length,
      ordersProcessing: allOrders.filter((o) => o.status === "processing").length,

      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,

      activeVisitors: activePresence.length,
      activeCarts: activeCarts.length,
      checkoutsInProgress: activePresence.filter(
        (p) => p.stage === "checkout"
      ).length,

      conversionRate: Math.round(conversionRate * 100) / 100,
      averageOrderValue: Math.round(aov),
      cartAbandonmentRate: calculateAbandonmentRate(activeCarts, todayOrders),
    };
  },
});
```

### Live Funnel Query

```typescript
export const getLiveFunnel = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const activePresence = await ctx.db
      .query("adminPresence")
      .withIndex("by_last_active")
      .filter((q) => q.gte(q.field("lastActiveAt"), fiveMinutesAgo))
      .collect();

    return {
      browsing: activePresence.filter((p) => p.stage === "browsing").length,
      productView: activePresence.filter((p) => p.stage === "product_view").length,
      cart: activePresence.filter((p) => p.stage === "cart").length,
      checkout: activePresence.filter((p) => p.stage === "checkout").length,
      completed: activePresence.filter((p) => p.stage === "completed").length,
    };
  },
});
```

### Active Alerts Query

```typescript
export const getActiveAlerts = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    return await ctx.db
      .query("alerts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .order("desc")
      .take(20);
  },
});
```

### Activity Feed Query

```typescript
export const getActivityFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    return await ctx.db
      .query("activityFeed")
      .withIndex("by_timestamp")
      .order("desc")
      .take(args.limit ?? 20);
  },
});
```

### Alert Mutations

```typescript
export const acknowledgeAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    await ctx.db.patch(args.alertId, {
      status: "acknowledged",
      acknowledgedAt: Date.now(),
      acknowledgedBy: identity.subject as Id<"users">,
    });
  },
});

export const dismissAlert = mutation({
  args: { alertId: v.id("alerts") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.isAdmin) throw new Error("Unauthorized");

    await ctx.db.patch(args.alertId, {
      status: "dismissed",
    });
  },
});
```

### Create Alert (Internal)

```typescript
export const createAlert = internalMutation({
  args: {
    type: v.string(),
    priority: v.string(),
    title: v.string(),
    message: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("alerts", {
      ...args,
      type: args.type as any,
      priority: args.priority as any,
      status: "active",
      createdAt: Date.now(),
    });
  },
});
```

### Log Activity (Internal)

```typescript
export const logActivity = internalMutation({
  args: {
    type: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    actorType: v.string(),
    actorId: v.optional(v.string()),
    actorName: v.optional(v.string()),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("activityFeed", {
      ...args,
      type: args.type as any,
      actorType: args.actorType as any,
      timestamp: Date.now(),
    });
  },
});
```

---

## Event-Driven Alert Creation

### Automatic Alert Triggers

```typescript
// Called by inventory system when stock changes
export const checkLowStock = internalMutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product) return;

    if (product.stockCount === 0) {
      await ctx.runMutation(internal.admin.dashboard.createAlert, {
        type: "out_of_stock",
        priority: "high",
        title: `Out of Stock: ${product.name}`,
        message: `${product.name} (${product.sku}) is now out of stock.`,
        entityType: "product",
        entityId: args.productId,
      });
    } else if (product.stockCount <= product.lowStockThreshold) {
      await ctx.runMutation(internal.admin.dashboard.createAlert, {
        type: "low_stock",
        priority: "medium",
        title: `Low Stock: ${product.name}`,
        message: `${product.name} has only ${product.stockCount} units remaining.`,
        entityType: "product",
        entityId: args.productId,
      });
    }
  },
});

// Called by order system for high-value orders
export const checkHighValueOrder = internalMutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) return;

    const threshold = 50000; // $500 in cents

    if (order.total >= threshold) {
      await ctx.runMutation(internal.admin.dashboard.createAlert, {
        type: "high_value_order",
        priority: "low",
        title: `High Value Order: ${order.orderNumber}`,
        message: `Order ${order.orderNumber} placed for ${formatCurrency(order.total)}.`,
        entityType: "order",
        entityId: args.orderId,
      });
    }
  },
});
```

---

## MCP Integration

### MCP Tools (Admin-Only)

```typescript
// Get dashboard metrics
export const getDashboardMetricsMCP: MCPTool = {
  name: "get_dashboard_metrics",
  description: "Get real-time dashboard metrics (admin only)",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async () => {
    // Returns current metrics
  },
};

// Get low stock alerts
export const getLowStockAlertsMCP: MCPTool = {
  name: "get_low_stock_alerts",
  description: "Get products with low or no stock (admin only)",
  parameters: {
    type: "object",
    properties: {
      includeOutOfStock: { type: "boolean", default: true },
    },
  },
  handler: async ({ includeOutOfStock }) => {
    // Returns low stock products
  },
};

// Get pending orders
export const getPendingOrdersMCP: MCPTool = {
  name: "get_pending_orders",
  description: "Get orders awaiting fulfillment (admin only)",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", default: 10 },
    },
  },
  handler: async ({ limit }) => {
    // Returns pending orders
  },
};
```

### MCP Resources

```typescript
// Admin metrics resource
// admin://metrics
{
  uri: "admin://metrics",
  name: "Dashboard Metrics",
  mimeType: "application/json",
  description: "Real-time dashboard metrics",
}

// Active alerts resource
// admin://alerts
{
  uri: "admin://alerts",
  name: "Active Alerts",
  mimeType: "application/json",
  description: "Current active alerts",
}

// Pending orders resource
// admin://orders/pending
{
  uri: "admin://orders/pending",
  name: "Pending Orders",
  mimeType: "application/json",
  description: "Orders awaiting fulfillment",
}
```

---

## UI Components

### Dashboard Components

```
components/admin/dashboard/
├── MetricCard.tsx           # Single metric display
├── MetricsRow.tsx           # Row of metric cards
├── AnimatedNumber.tsx       # Animated counter
├── AlertsPanel.tsx          # Active alerts list
├── AlertItem.tsx            # Single alert row
├── ActivityFeed.tsx         # Activity stream
├── ActivityItem.tsx         # Single activity entry
├── RecentOrdersCard.tsx     # Recent orders widget
├── ConversionFunnel.tsx     # Funnel visualization
├── LiveVisitorCount.tsx     # Active visitors indicator
├── RevenueChart.tsx         # Revenue over time
└── DashboardSkeleton.tsx    # Loading state
```

---

## Security

### Authorization

- All dashboard queries require `isAdmin` check
- MCP tools require admin authentication
- Activity feed never exposes sensitive customer data

### Data Exposure

- Customer PII not shown in activity feed
- Payment details never exposed
- Only aggregated metrics for non-order data

---

## Business Rules

### Alert Priority

| Priority | Response Time | Examples |
|----------|---------------|----------|
| Critical | Immediate | System down, payment failures |
| High | < 1 hour | Out of stock bestseller |
| Medium | < 4 hours | Low stock, return request |
| Low | Next day | High-value order, review posted |

### Auto-Resolve Alerts

- Low stock alerts resolve when restocked
- Out of stock alerts resolve when inventory added
- Failed payment alerts resolve when retried successfully

### Activity Feed Retention

- Keep last 1000 activities
- Archive older to cold storage
- Auto-cleanup via scheduled job

---

## Testing Requirements

### Unit Tests

- Metrics calculation accuracy
- Alert trigger conditions
- Activity feed population

### Integration Tests

- Real-time subscription updates
- Alert creation from events
- MCP tool authorization

### E2E Tests

- Dashboard load and display
- Alert acknowledge flow
- Activity feed updates

---

## Implementation Checklist

### Phase 1: Core Dashboard
- [ ] Dashboard layout and routing
- [ ] Metrics cards with real-time updates
- [ ] Recent orders widget
- [ ] Basic activity feed

### Phase 2: Alerts System
- [ ] Alerts table and schema
- [ ] Alert creation triggers
- [ ] Alerts panel UI
- [ ] Acknowledge/dismiss actions

### Phase 3: Activity Feed
- [ ] Activity feed table
- [ ] Activity logging from events
- [ ] Feed UI with animations
- [ ] Activity type icons

### Phase 4: Analytics
- [ ] Revenue chart
- [ ] Conversion funnel
- [ ] Time period selectors
- [ ] Export functionality

### Phase 5: MCP Integration
- [ ] Admin MCP tools
- [ ] MCP resources
- [ ] Authorization checks

---

**Last Updated:** January 30, 2026
**Next Review:** Before MVP launch
