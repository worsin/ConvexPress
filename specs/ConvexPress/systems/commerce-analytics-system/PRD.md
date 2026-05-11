# PRD: Analytics & Reporting

> **Origin:** Ported from VexCart on 2026-04-22, integrated into ConvexPress.
> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site. Internally, "extensions" are feature-flagged modules (Bundles, Digital, Returns, Reviews, Wishlists, Subscriptions, Add-Ons, Membership) that live in `convex/commerce<Thing>/` with a `<thing>Enabled` settings flag and a `require<Thing>Enabled(ctx)` gate on every mutation/query.
> **Package manager:** Bun. **UI:** Base UI (not Radix). **Styling:** Tailwind v4. **Payments:** Stripe (see `docs/stripe-integration.md`).


> **Status:** DRAFT - Awaiting Review & Enhancement
> **Airtable Record:** recKkxkne6kBUH3mP

---

## Integration with ConvexPress

**Positioning:** internal extension (`commerceAnalytics` — separate from site-wide `analytics`).
**Extension gate:** ``commerce.analytics.analyticsEnabled`` in the Settings system; `requireX(ctx)` helper on every mutation/query. Admin UI hides the nav item when disabled.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/analytics/` (site-wide) + `convex/commerce/reports.ts` (commerce-specific)

**Consumes these ConvexPress systems:**

- **Order System** — revenue, AOV, conversion metrics.
- **Product System** — top products by views, adds, revenue.
- **Customer System** — LTV, churn, cohort analysis.
- **GA4 Integration** — optional passthrough for off-site dashboards.

**WooCommerce analog:** WooCommerce Analytics (native) + Google Analytics Enhanced Ecommerce.

---
## 1. Overview

### 1.1 Purpose

The Analytics & Reporting system provides business intelligence and operational visibility for the shopping cart platform. It enables administrators to track sales performance, product analytics, customer behavior, inventory metrics, and generate exportable reports. Given Convex's limitations with complex aggregations, we adopt a hybrid approach using Convex for real-time data and external analytics services for heavy computations.

### 1.2 Scope

- Sales reports (revenue, orders, average order value)
- Product performance metrics (top sellers, conversion rates)
- Customer analytics (acquisition, retention, lifetime value)
- Inventory reports (stock levels, turnover, valuation)
- Real-time dashboard widgets (Convex-powered)
- Exportable reports (CSV, PDF)
- Scheduled report emails
- Integration with external analytics (optional)

### 1.3 Out of Scope

- Marketing attribution analytics (requires dedicated marketing system)
- A/B testing analytics
- Advanced ML-based predictions
- Real-time visitor analytics (use dedicated tools like Plausible/Fathom)

---

## 2. Dependencies

### 2.1 Required Before This System

| System | Code | Phase | Why Required |
|--------|------|-------|--------------|
| Order Management | ORD-MGT | 4 | Order data for sales reports |
| Product Catalog | CAT-PRD | 2 | Product data for performance metrics |
| Customer Accounts | USR-ACT | 1 | Customer data for analytics |
| Inventory System | INV-STK | 3 | Inventory data for stock reports |

### 2.2 Systems That Depend on This

| System | Code | Phase | Integration Point |
|--------|------|-------|-------------------|
| Admin Dashboard | ADM-DSH | 6 | Dashboard widgets consume analytics |

### 2.3 Integration Hooks to Implement

- Analytics event collection from all systems
- Report generation API
- Export endpoints for CSV/PDF
- Scheduled report job triggers

---

## 3. Routes

### 3.1 Admin Routes (Admin App)

| Route | Path | Layout | Auth Required | Roles |
|-------|------|--------|---------------|-------|
| Analytics Overview | /admin/analytics | _admin | Yes | manager, admin |
| Sales Reports | /admin/analytics/sales | _admin | Yes | manager, admin |
| Product Reports | /admin/analytics/products | _admin | Yes | manager, admin |
| Customer Reports | /admin/analytics/customers | _admin | Yes | manager, admin |
| Inventory Reports | /admin/analytics/inventory | _admin | Yes | manager, admin |
| Report Settings | /admin/analytics/settings | _admin | Yes | admin |

---

## 4. Data Model

### 4.1 Analytics Event Collection

```typescript
// Raw analytics events (high-volume, consider TTL/cleanup)
analytics_events: defineTable({
  eventType: v.string(),           // "page_view", "product_view", "add_to_cart", "purchase"
  entityType: v.optional(v.string()), // "product", "order", "customer"
  entityId: v.optional(v.string()),   // ID of related entity
  userId: v.optional(v.id("user_profiles")),
  sessionId: v.optional(v.string()),
  data: v.optional(v.any()),       // Event-specific data
  timestamp: v.number(),
  date: v.string(),                // "2025-02-03" for daily aggregation
})
  .index("by_type_date", ["eventType", "date"])
  .index("by_entity", ["entityType", "entityId"])
  .index("by_user", ["userId"])
  .index("by_timestamp", ["timestamp"])
```

### 4.2 Pre-Aggregated Metrics (Convex-Friendly)

```typescript
// Daily sales summary (pre-computed)
daily_sales_summary: defineTable({
  date: v.string(),                // "2025-02-03"
  orderCount: v.number(),
  totalRevenue: v.number(),
  totalTax: v.number(),
  totalShipping: v.number(),
  avgOrderValue: v.number(),
  uniqueCustomers: v.number(),
  newCustomers: v.number(),
  returningCustomers: v.number(),
  updatedAt: v.number(),
})
  .index("by_date", ["date"])

// Product performance summary (weekly/monthly)
product_performance: defineTable({
  productId: v.id("products"),
  period: v.string(),              // "2025-W05" or "2025-02"
  periodType: v.union(v.literal("week"), v.literal("month")),
  views: v.number(),
  addToCartCount: v.number(),
  purchaseCount: v.number(),
  revenue: v.number(),
  conversionRate: v.number(),      // purchaseCount / views
  updatedAt: v.number(),
})
  .index("by_product_period", ["productId", "periodType", "period"])
  .index("by_period", ["periodType", "period"])

// Customer lifetime value summary
customer_analytics: defineTable({
  userId: v.id("user_profiles"),
  totalOrders: v.number(),
  totalSpent: v.number(),
  avgOrderValue: v.number(),
  firstOrderDate: v.optional(v.number()),
  lastOrderDate: v.optional(v.number()),
  daysSinceLastOrder: v.optional(v.number()),
  segment: v.optional(v.string()),  // "new", "active", "at_risk", "churned"
  updatedAt: v.number(),
})
  .index("by_segment", ["segment"])
  .index("by_total_spent", ["totalSpent"])

// Inventory snapshots (daily)
inventory_snapshot: defineTable({
  date: v.string(),
  totalSKUs: v.number(),
  totalUnits: v.number(),
  totalValue: v.number(),          // Sum of (stock * cost)
  lowStockCount: v.number(),
  outOfStockCount: v.number(),
  turnoverRate: v.optional(v.number()),
})
  .index("by_date", ["date"])

// Report export jobs
report_exports: defineTable({
  reportType: v.string(),          // "sales", "products", "customers", "inventory"
  dateRange: v.object({
    start: v.string(),
    end: v.string(),
  }),
  format: v.union(v.literal("csv"), v.literal("pdf")),
  status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
  fileUrl: v.optional(v.string()),
  requestedBy: v.id("user_profiles"),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
})
  .index("by_status", ["status"])
  .index("by_user", ["requestedBy"])
```

---

## 5. Architecture

### 5.1 Hybrid Analytics Approach

Given Convex's limitations with complex aggregations:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DATA COLLECTION                             │
├─────────────────────────────────────────────────────────────────┤
│  Events → Convex (analytics_events table)                       │
│  Orders → Already in Convex (order_records)                     │
│  Products → Already in Convex (products)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AGGREGATION LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  Option A: Convex Scheduled Jobs (Simple aggregations)          │
│  - Daily sales summary computation                               │
│  - Product performance rollups                                   │
│  - Customer segment updates                                      │
│                                                                  │
│  Option B: External Service (Complex analytics)                  │
│  - Tinybird (Convex-recommended)                                │
│  - ClickHouse                                                    │
│  - BigQuery                                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  Admin Dashboard → Real-time widgets (Convex queries)           │
│  Reports Page → Pre-computed summaries + on-demand queries      │
│  Exports → Background job generates CSV/PDF                      │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Tinybird Integration (Recommended)

Convex recommends [Tinybird](https://www.tinybird.co/) for analytics:

```typescript
// Send events to Tinybird
export const sendToTinybird = action({
  args: { events: v.array(v.any()) },
  handler: async (ctx, args) => {
    await fetch(`${TINYBIRD_HOST}/v0/events?name=analytics_events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TINYBIRD_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: args.events.map(e => JSON.stringify(e)).join("\n"),
    });
  },
});

// Query Tinybird for aggregations
export const queryTinybird = action({
  args: { pipe: v.string(), params: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const url = new URL(`${TINYBIRD_HOST}/v0/pipes/${args.pipe}.json`);
    if (args.params) {
      Object.entries(args.params).forEach(([k, v]) =>
        url.searchParams.set(k, String(v))
      );
    }
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${TINYBIRD_TOKEN}` },
    });
    return response.json();
  },
});
```

---

## 6. Reports Specification

### 6.1 Sales Reports

**Metrics:**
- Total Revenue (gross, net)
- Order Count
- Average Order Value (AOV)
- Revenue by Day/Week/Month
- Revenue by Product Category
- Payment Method Distribution
- Refund Rate

**Filters:**
- Date Range
- Category
- Payment Method
- Order Status

### 6.2 Product Reports

**Metrics:**
- Top Selling Products (by revenue, by units)
- Product Views
- Add-to-Cart Rate
- Conversion Rate (views → purchase)
- Revenue per Product
- Inventory Turnover

**Filters:**
- Date Range
- Category
- Stock Status

### 6.3 Customer Reports

**Metrics:**
- New vs Returning Customers
- Customer Acquisition (signups over time)
- Customer Lifetime Value (CLV)
- Average Orders per Customer
- Customer Segments (RFM analysis)
- Churn Rate

**Filters:**
- Date Range
- Customer Segment
- First Purchase Date

### 6.4 Inventory Reports

**Metrics:**
- Total Inventory Value
- Stock Levels by Category
- Low Stock Alerts
- Out of Stock Items
- Inventory Turnover Rate
- Dead Stock Identification

**Filters:**
- Category
- Stock Status
- Supplier (future)

---

## 7. User Interface

### 7.1 Components Needed

- [ ] `AnalyticsOverview` - Summary dashboard with KPI cards
- [ ] `SalesChart` - Revenue/orders over time (line chart)
- [ ] `TopProductsTable` - Top sellers with metrics
- [ ] `CustomerSegmentPie` - Customer distribution chart
- [ ] `InventoryHealthCard` - Stock status summary
- [ ] `DateRangePicker` - Date selection for reports
- [ ] `ExportButton` - Trigger CSV/PDF export
- [ ] `ReportTable` - Tabular data with sorting/filtering

### 7.2 Dashboard Widgets

**KPI Cards (Real-Time from Convex):**
- Today's Revenue
- Today's Orders
- Pending Orders
- Low Stock Alerts

**Charts:**
- Revenue Trend (7/30/90 days)
- Top 5 Products
- Orders by Status
- Customer Segments

### 7.3 Chart Library

Use **Recharts** or **Chart.js** for visualizations:

```tsx
import { LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

function RevenueChart({ data }) {
  return (
    <LineChart data={data}>
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Line type="monotone" dataKey="revenue" stroke="#8884d8" />
    </LineChart>
  );
}
```

---

## 8. API Design

### 8.1 Queries (Read Operations)

```typescript
// Get sales summary for date range
export const getSalesSummary = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch pre-computed daily summaries
    const summaries = await ctx.db.query("daily_sales_summary")
      .withIndex("by_date")
      .filter(q =>
        q.and(
          q.gte(q.field("date"), args.startDate),
          q.lte(q.field("date"), args.endDate)
        )
      )
      .collect();

    // Aggregate totals
    return {
      totalRevenue: summaries.reduce((sum, s) => sum + s.totalRevenue, 0),
      totalOrders: summaries.reduce((sum, s) => sum + s.orderCount, 0),
      avgOrderValue: /* calculate */,
      dailyData: summaries,
    };
  },
});

// Get top products for period
export const getTopProducts = query({
  args: {
    period: v.string(),
    periodType: v.union(v.literal("week"), v.literal("month")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const performance = await ctx.db.query("product_performance")
      .withIndex("by_period", q =>
        q.eq("periodType", args.periodType).eq("period", args.period)
      )
      .collect();

    // Sort by revenue and limit
    return performance
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, args.limit ?? 10);
  },
});

// Get customer segments
export const getCustomerSegments = query({
  args: {},
  handler: async (ctx) => {
    const segments = ["new", "active", "at_risk", "churned"];
    const counts = await Promise.all(
      segments.map(async (segment) => {
        const customers = await ctx.db.query("customer_analytics")
          .withIndex("by_segment", q => q.eq("segment", segment))
          .collect();
        return { segment, count: customers.length };
      })
    );
    return counts;
  },
});

// Real-time today's metrics
export const getTodayMetrics = query({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];

    // Count today's orders (real-time)
    const todayOrders = await ctx.db.query("order_records")
      .withIndex("by_created_date")
      .filter(q => q.gte(q.field("createdAt"), startOfToday()))
      .collect();

    return {
      orderCount: todayOrders.length,
      revenue: todayOrders.reduce((sum, o) => sum + o.total, 0),
      // ... more metrics
    };
  },
});
```

### 8.2 Mutations (Write Operations)

```typescript
// Track analytics event
export const trackEvent = mutation({
  args: {
    eventType: v.string(),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const today = new Date().toISOString().split("T")[0];

    await ctx.db.insert("analytics_events", {
      ...args,
      userId: user?._id,
      sessionId: !user ? getSessionId(ctx) : undefined,
      timestamp: Date.now(),
      date: today,
    });
  },
});

// Request report export
export const requestExport = mutation({
  args: {
    reportType: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    format: v.union(v.literal("csv"), v.literal("pdf")),
  },
  handler: async (ctx, args) => {
    const user = await requireAdmin(ctx);

    const exportId = await ctx.db.insert("report_exports", {
      reportType: args.reportType,
      dateRange: { start: args.startDate, end: args.endDate },
      format: args.format,
      status: "pending",
      requestedBy: user._id,
      createdAt: Date.now(),
    });

    // Schedule export job
    await ctx.scheduler.runAfter(0, internal.analytics.generateExport, {
      exportId
    });

    return exportId;
  },
});
```

### 8.3 Internal Functions (Scheduled Jobs)

```typescript
// Daily aggregation job (scheduled)
export const computeDailySummary = internalMutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    // Fetch all orders for the date
    const orders = await ctx.db.query("order_records")
      .filter(q => q.eq(q.field("createdDate"), args.date))
      .collect();

    // Compute aggregates
    const summary = {
      date: args.date,
      orderCount: orders.length,
      totalRevenue: orders.reduce((sum, o) => sum + o.total, 0),
      // ... more computations
    };

    // Upsert summary
    const existing = await ctx.db.query("daily_sales_summary")
      .withIndex("by_date", q => q.eq("date", args.date))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...summary, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("daily_sales_summary", { ...summary, updatedAt: Date.now() });
    }
  },
});

// Product performance rollup (weekly)
export const computeProductPerformance = internalMutation({
  args: { period: v.string(), periodType: v.string() },
  handler: async (ctx, args) => {
    // Aggregate product metrics for the period
    // ...
  },
});

// Customer segmentation update
export const updateCustomerSegments = internalMutation({
  args: {},
  handler: async (ctx) => {
    // RFM analysis to update customer segments
    // Recency: days since last order
    // Frequency: number of orders
    // Monetary: total spent
    // ...
  },
});
```

---

## 9. Scheduled Jobs

### 9.1 Job Schedule

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `computeDailySummary` | Daily at 1 AM | Aggregate previous day's sales |
| `computeProductPerformance` | Weekly on Monday | Rollup product metrics |
| `updateCustomerSegments` | Daily at 2 AM | Update customer RFM segments |
| `cleanupOldEvents` | Daily at 3 AM | Remove analytics_events older than 90 days |
| `inventorySnapshot` | Daily at 4 AM | Capture daily inventory snapshot |

### 9.2 Convex Cron Setup

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

crons.daily(
  "compute-daily-summary",
  { hourUTC: 6, minuteUTC: 0 }, // 1 AM EST
  internal.analytics.computeDailySummaryJob,
);

crons.weekly(
  "compute-product-performance",
  { dayOfWeek: "monday", hourUTC: 6, minuteUTC: 30 },
  internal.analytics.computeProductPerformanceJob,
);

export default crons;
```

---

## 10. Export Functionality

### 10.1 CSV Export

```typescript
export const generateExport = internalAction({
  args: { exportId: v.id("report_exports") },
  handler: async (ctx, args) => {
    const exportJob = await ctx.runQuery(internal.analytics.getExport, {
      exportId: args.exportId
    });

    // Update status
    await ctx.runMutation(internal.analytics.updateExportStatus, {
      exportId: args.exportId,
      status: "processing",
    });

    try {
      // Fetch report data
      const data = await fetchReportData(ctx, exportJob);

      // Generate CSV
      const csv = generateCSV(data, exportJob.reportType);

      // Upload to storage
      const fileUrl = await ctx.storage.store(
        new Blob([csv], { type: "text/csv" })
      );

      // Update with result
      await ctx.runMutation(internal.analytics.updateExportStatus, {
        exportId: args.exportId,
        status: "completed",
        fileUrl,
      });
    } catch (error) {
      await ctx.runMutation(internal.analytics.updateExportStatus, {
        exportId: args.exportId,
        status: "failed",
        error: error.message,
      });
    }
  },
});
```

---

## 11. Security Considerations

### 11.1 Access Control

- Analytics routes require manager or admin role
- Report exports logged for audit trail
- No customer PII in exported reports (anonymize where needed)

### 11.2 Data Retention

- Raw analytics events: 90 days
- Aggregated summaries: Indefinite
- Export files: 7 days auto-delete

---

## 12. Implementation Checklist

### Phase 1: Foundation
- [ ] Analytics event tracking mutation
- [ ] Daily sales summary table and computation
- [ ] Basic queries for dashboard widgets

### Phase 2: Core Features
- [ ] Sales reports page with charts
- [ ] Product performance tracking
- [ ] Customer analytics with segmentation
- [ ] Inventory reports

### Phase 3: Integration
- [ ] Scheduled aggregation jobs
- [ ] CSV export functionality
- [ ] (Optional) Tinybird integration for complex queries

### Phase 4: Polish
- [ ] PDF export
- [ ] Scheduled report emails
- [ ] Dashboard customization
- [ ] Performance optimization

---

## 13. Future Considerations

- **Predictive Analytics:** ML-based sales forecasting
- **Custom Dashboards:** User-configurable widget layouts
- **Cohort Analysis:** Customer retention by cohort
- **Marketing Attribution:** Track conversion sources
- **Real-Time Alerts:** Notification when KPIs hit thresholds

---

## Appendix

### A. Airtable Record IDs

| Entity | Record ID |
|--------|-----------|
| System | recKkxkne6kBUH3mP |
| Routes | rec8ZLJfPoZ90A8uJ |
| Actions | recygvfCrOgPMr566, recdtaZQdd2g2Ky4g, recbH56o4X67BMx9G, recbL5IW35zafMkIn |
| Events | recUMdeZnAoe5vFMZ |

### B. Related Documentation

- [Action Plan](./ACTION-PLAN.md)
- [Admin Dashboard PRD](./the ConvexPress Dashboard System KB (`.claude/docs/DASHBOARD-SYSTEM.md`).md)
- [Convex Crons Documentation](https://docs.convex.dev/scheduling/cron-jobs)
- [Tinybird + Convex Guide](https://www.tinybird.co/docs/guides/convex)

---

**PRD Version:** 0.1 (DRAFT)
**Created:** 2025-02-03
**Last Updated:** 2025-02-03
**Author:** Claude (AI-Generated Draft)
**Status:** Awaiting human review and enhancement
