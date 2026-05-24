# List-Table Standardization Plan

**Status:** Ready to execute
**Owner:** `/experts:admin-list-table-ui` for UI work, per-system experts for backend queries
**Trigger:** `/admin/commerce/products` displays 735 products with no search, sort, filter, pagination, or bulk actions. Same gap exists across every Commerce listing page and several Tools pages.

---

## Diagnosis (one paragraph)

The standardized WordPress-style list-table system **already exists, is implemented, and is in production use** by Posts, Pages, Users, Comments, Media, API Keys, and Webhooks. Shared components live in `apps/web/src/components/shared/` and shared hooks in `apps/web/src/hooks/`. The gap is **not** that the system is missing — the gap is that the Commerce pages (ported from VexCart, which had no shared abstractions) were brought over with their own bespoke inline state and never wired into the shared system. Tools pages (roles, events, capabilities) skipped it too. Every Commerce backend list query also has scaling problems (`.take(2000)`, no pagination, no counts query).

---

## What Already Exists (do not rebuild)

### Shared components — `apps/web/src/components/shared/`

| Component | Purpose |
|---|---|
| `ListTable.tsx` | Generic table with column defs, sort, selection, row actions, Quick Edit slot, skeleton, empty state |
| `ListTableToolbar.tsx` | Bulk-actions slot + filters slot + search slot |
| `StatusTabs.tsx` | Tab strip with live count badges (All \| Status A \| Status B \| Trash) |
| `BulkActions.tsx` | Dropdown + Apply, with per-action capability gating + destructive confirm |
| `SearchBox.tsx` | Debounced search input (300ms) with clear button |
| `Pagination.tsx` | Total count, first/prev/next/last, current page input, per-page selector |
| `InlineActions.tsx` | Hover row actions (`Edit \| Quick Edit \| Trash \| View`) with capability gating |
| `EmptyState.tsx` | Title + description + optional action button |
| `TableSkeleton.tsx` | Column-aware skeleton matching layout |
| `ScreenOptions.tsx` | Collapsible panel: column visibility + per-page (localStorage-persisted) |
| `ConfirmDialog.tsx` | The ONLY allowed dialog — for destructive bulk actions |

### Shared hooks — `apps/web/src/hooks/`

| Hook | Purpose |
|---|---|
| `useListTable.ts` | URL-state parsing (TanStack Router search params), sort, pagination, search, screen options, status tabs with counts merged |
| `useBulkSelection.ts` | Header checkbox, indeterminate state, persistent selection across pages |
| `useDebounce.ts` | Generic debounce |
| `useScreenOptions.ts` | localStorage-persisted column visibility + per-page |

### Established types — `apps/web/src/types/list-table.ts`

`ColumnDef<T>`, `ListTableConfig<T>`, `ListTableSearchParams`, `StatusTab`, `BulkAction`, `RowAction<T>`, `PaginatedResult<T>`, `ScreenOptionsState`.

### Reference implementations to copy from

- `components/posts/PostListTable.tsx` — full post listing with Quick Edit
- `routes/_authenticated/_admin/api-keys/-components/api-key-table.tsx` — flat list with status tabs
- `routes/_authenticated/_admin/webhooks/-components/webhook-table.tsx` — flat list with status tabs
- `components/comments/CommentListTable.tsx` — moderation-style status tabs
- `components/media/MediaListTable.tsx` — grid/list view-mode toggle variant

---

## Pages That Need Migration

### Tier 1 — Commerce, demo-blocking (PRIORITY)

| Route | Current state | Status tabs | Sortable cols | Filters | Bulk actions | Search fields |
|---|---|---|---|---|---|---|
| `/admin/commerce/products` | Bare list of 735, no controls | All, Published, Draft, Private, Trash | title, price, stock, type, updatedAt | productType (simple/variable/external), category, stockStatus | Trash, Restore, Delete, Change status | title, sku, slug |
| `/admin/commerce/orders` | Backend `.take(2000)` truncates 12,860 → 2,000; no UI controls | All, Pending, Processing, On-hold, Completed, Cancelled, Refunded, Failed | orderNumber, customer, total, status, createdAt | dateRange, paymentMethod, shippingMethod, customerId | Mark processing, Mark completed, Mark cancelled, Print, Refund | orderNumber, customer email, customer name |
| `/admin/commerce/customers` | Bare list of 7,950 | All, With orders, No orders, VIP | name, email, totalOrders, totalSpent, lastOrderAt, createdAt | hasOrders, dateRange | Email, Export, Delete | name, email |
| `/admin/commerce/orders/abandoned` | Bare list | All, Recovered, Lost | createdAt, customer, cartTotal | dateRange | Email recovery, Mark lost | customer email |
| `/admin/commerce/discounts` | Inline filter only | All, Active, Scheduled, Expired, Disabled | code, type, usage, expiresAt | type, status | Enable, Disable, Delete | code, description |
| `/admin/commerce/categories` | Bare list | (flat, no tabs) | name, slug, productCount | parent | Delete | name |
| `/admin/commerce/attributes` | Bare list | (flat) | name, slug, valueCount | — | Delete | name |
| `/admin/commerce/returns` | Bare list | All, Pending, Approved, Rejected, Refunded | createdAt, orderNumber, customer, status | dateRange, reason | Approve, Reject, Refund | orderNumber |
| `/admin/commerce/bundles` | Bare list | All, Published, Draft | title, price, status | — | Delete | title |
| `/admin/commerce/digital` | Bare list | All, Active, Disabled | filename, productTitle, downloads | productId | Delete | filename, productTitle |
| `/admin/commerce/payments` | Bare list | All, Captured, Pending, Refunded, Failed | createdAt, amount, provider, status | provider, dateRange, status | Refund | reference, customer |

### Tier 2 — Tools / Settings

| Route | Current state | Status tabs | Sortable cols | Filters | Bulk actions | Search fields |
|---|---|---|---|---|---|---|
| `/admin/tools/roles` | Search + inline only | All, Custom, System | name, level, userCount | — | Delete (custom only) | name |
| `/admin/tools/events` | No pagination, in-memory | All, Active, Disabled | name, eventCode, category | category, status | — | name, eventCode |
| `/admin/tools/capabilities` | No pagination, in-memory | All | name, actionCode, category | category | — | name, actionCode |
| `/admin/tools/wordpress-sync` (sites + jobs) | Custom-only | per-site status | createdAt, status | siteId | — | siteUrl, name |
| `/admin/tools/audit-log` | Already wired (timeline) | — | timestamp | userId, action, dateRange | — | message |

### Tier 3 — Already migrated (verify only, no work)

Posts, Pages, Users, Comments, Media, API Keys, Webhooks. Sanity-check each renders with `useListTable` and the shared toolbar.

---

## Backend Query Contract (every entity must match this)

The shared `useListTable` hook expects two queries per entity:

### `entity.list(args)` → `PaginatedResult<T>`

```ts
args: {
  status?: string;            // active status tab
  search?: string;            // debounced 300ms
  orderBy?: string;           // column key
  orderDir?: "asc" | "desc";
  page?: number;              // 1-based
  perPage?: number;           // default 20, max 100
  // entity-specific:
  // categoryId?, authorId?, dateFrom?, dateTo?, productId?, customerId?, etc.
}
returns: {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}
```

### `entity.counts(args)` → `Record<string, number>`

```ts
args: {
  // optional filters that should affect count totals
  search?: string;
  // entity-specific filters
}
returns: {
  all: number;
  [statusKey: string]: number;  // publish: 28, draft: 10, trash: 1
}
```

### Implementation rules

1. **No `.collect()` on bounded tables.** Use `.paginate({ cursor, numItems: perPage })` or index-scoped `.take()` with offset/limit math.
2. **Search uses Convex search indexes** when available (e.g., `withSearchIndex("by_title", q => q.search("title", search))`). For tables without a search index, add one in `schema/{system}.ts`.
3. **Sort uses indexes** that match the sort column (`.withIndex("by_createdAt").order("desc")`). If a sort column lacks an index, add it.
4. **Counts queries must NOT do full collects.** Use indexed counts (Convex aggregates if added) or scoped `.take()` per status. For tables that exceed `take` budget, defer counts to a denormalized counter table updated by mutations.
5. **Read-budget aware.** Every query must stay under 16MB read / 32K rows. If a join would push past the budget, paginate the parent and enrich page-by-page (see how `commerce/orders.ts:enrichOrder` should be fixed).

### Bulk-mutation contract

Each entity needs the bulk mutations its UI references. Pattern:

```ts
export const bulkTrash = mutation({
  args: { ids: v.array(v.id("commerce_products")) },
  handler: async (ctx, { ids }) => {
    await requireCan(ctx, "commerce.products.delete");
    for (const id of ids) {
      await ctx.db.patch(id, { status: "trash", trashedAt: Date.now() });
    }
    return { count: ids.length };
  },
});
```

Mutations must be idempotent and emit events (`emitEvent("commerce.products.bulk_trashed", ...)`).

---

## Migration Recipe (per page)

Repeat this recipe for every Tier 1 + Tier 2 page. Each page is ~1–2 hours when the backend is already there, ~3–5 hours when backend needs to be built.

### Step 1 — Backend (system expert owns)

1. In the entity's queries file, replace the bare `list` with the paginated/sortable/filterable signature above.
2. Add `counts` query. Use indexed scans, or a denormalized counter if the table is huge.
3. Add any missing schema indexes (e.g., `commerce_orders.by_createdAt`, `commerce_products.by_status`, `commerce_products.by_sku` already exists).
4. Add bulk mutations (`bulkTrash`, `bulkRestore`, `bulkDelete`, `bulkChangeStatus`, etc.).
5. Each bulk mutation calls `requireCan(ctx, "<capability>")` and emits an event.

### Step 2 — Frontend (admin-list-table-ui expert owns)

1. Create `apps/web/src/components/{entity}/{Entity}ListTable.tsx`.
2. Define `ColumnDef<T>[]`, `StatusTab[]`, `BulkAction[]`, `RowAction<T>[]`, `ListTableConfig<T>`.
3. Use `useListTable({ config, data, counts })`.
4. Render `<StatusTabs>`, `<ListTableToolbar>` (with `<BulkActions>`, entity-specific filter dropdowns, `<SearchBox>`), `<ListTable>`, `<Pagination>`.
5. Add `validateSearch: zodSchema` to the route file (TanStack Router URL state).
6. Quick Edit only when needed (Posts/Pages style). For most commerce entities, full-page edit only.

### Step 3 — Wire route

Replace the route component body with `<{Entity}ListTable />` wrapped in `<RoutePermissionGuard requiredAccess="...">`.

### Step 4 — Verification

- URL state: change a filter → URL updates → reload preserves state.
- Real-time: another tab changes a row → first tab reflects change.
- Pagination: total count is right, last page works, perPage 5/20/50/100 all render.
- Empty state: search for nonsense → empty state shows.
- Bulk actions: select 3 rows → trash → toast → rows disappear → counts update.
- Capability gating: log in as Editor → "Delete" actions hidden.

---

## Rollout Phasing

### Phase 0 — Audit (½ day)

Verify each Tier 3 page (Posts/Pages/Users/Comments/Media/API Keys/Webhooks) is correctly wired. Fix any drift. **No new code expected.**

### Phase 1 — Commerce critical (3–4 days)

Order matters — orders is the most broken (truncates at 2000):

1. **Orders** — backend completely rewritten (paginated, indexed, denormalized counts), then frontend ListTable
2. **Products** — backend `.take(2000)` → paginated; add `by_status` + `by_productType` indexes; frontend ListTable
3. **Customers** — backend paginated + counts; frontend ListTable
4. **Discounts** — backend paginated + counts; frontend ListTable
5. **Categories** + **Attributes** — flat lists, smaller scope

### Phase 2 — Commerce remainder (1–2 days)

6. Returns
7. Bundles
8. Digital
9. Payments
10. Abandoned orders

### Phase 3 — Tools (1 day)

11. Roles
12. Events
13. Capabilities
14. WordPress-sync sites/jobs

---

## Expert Dispatch

Per CLAUDE.md, expert work is delegated. Dispatch order:

| Step | Expert | Scope |
|---|---|---|
| Phase 0 audit | `/experts:admin-list-table-ui` | Verify Posts/Pages/Users/Comments/Media wiring; report drift |
| Backend: products | (commerce — no expert assigned) | Rewrite `commerce/products.ts:list` + add `counts`; add bulk mutations |
| Backend: orders | (commerce) | Rewrite `commerce/orders.ts:list` + add `counts`; add bulk mutations |
| Backend: customers | (commerce) | Same shape |
| Backend: discounts/categories/attrs/returns/bundles/digital/payments | (commerce) | Same shape per entity |
| Backend: roles | `/experts:role-capability-system` | Add paginated `list` + `counts` |
| Backend: events | `/experts:event-dispatcher-system` | Add paginated `list` + `counts` |
| Backend: capabilities | `/experts:role-capability-system` | Add paginated `list` + `counts` |
| All frontend ListTable components | `/experts:admin-list-table-ui` | One per page; reference PostListTable patterns |
| Schema index additions | `/experts:convex-deployment` | Each new index requires deploy + verify |

> **Note:** There's no dedicated commerce-system expert. Either spin one up via `/experts:ui-expert-builder`, or have me drive the backend work directly since I already have the context from the WP/Woo sync work.

---

## Acceptance Criteria

- Every Tier 1 + Tier 2 page renders with `<StatusTabs>`, `<ListTableToolbar>`, `<ListTable>`, `<Pagination>` from the shared library.
- All filter/sort/search/page state lives in URL search params (browser back/forward and shareable URLs work).
- All list queries are budget-safe with 100K+ rows in the table.
- All bulk actions are gated by capability and emit events.
- All listings show real-time updates when another tab changes data.
- 12,860 orders are paginated correctly — no truncation, no missing rows.
- Demo customer can find any order/customer/product by typing in the search box.

---

## Open Questions (decide before kickoff)

1. **Commerce expert:** Stand up a `/experts:commerce-system` or have me handle backend directly? Recommendation: have me handle it — I already know the schema and the WordPress-sync code that writes into these tables.
2. **Counts strategy for huge tables:** For `commerce_orders` (12,860 rows) the per-status `.take()` approach works today; at 100K+ orders it needs a denormalized counter table. Do we add it now or defer?
3. **Quick Edit on commerce pages:** WordPress has Quick Edit on posts/pages. Commerce typically doesn't. Confirm: products and orders → full-page edit only, no Quick Edit.
4. **Trash semantics:** Posts/Pages use a Trash status. Does an order need a Trash status, or does "Cancelled" + "Refunded" cover it? Recommendation: orders never trash; trash applies only to products, discounts, bundles, digital files.
5. **Per-page default sort:** Orders should default to `createdAt desc`. Products by `updatedAt desc`. Customers by `createdAt desc`. Confirm.
