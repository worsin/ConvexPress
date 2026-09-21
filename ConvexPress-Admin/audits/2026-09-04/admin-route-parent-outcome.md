# Admin nested route repair — source checkpoint

## Confirmed problem and implemented behavior

The generated route tree made the following five list screens parents of detail/settings routes, but those parents rendered only their list and no Outlet. Navigation could update the URL and breadcrumbs while leaving the list on screen. Each parent now renders an Outlet, and its original list lives in a genuine sibling `.index.tsx` route. Existing child paths and ancestor authorization are preserved.

| Parent URL | Child paths now rendered | Source pair under `apps/web/src/routes/_authenticated/_admin` |
| --- | --- | --- |
| `/commerce/attributes` | `/$attributeId` | `commerce/attributes.tsx`, `commerce/attributes.index.tsx` |
| `/commerce/customers` | `/$userId/store-credit` | `commerce/customers.tsx`, `commerce/customers.index.tsx` |
| `/commerce/orders` | `/abandoned`, `/$orderId` | `commerce/orders.tsx`, `commerce/orders.index.tsx` |
| `/commerce/returns` | `/settings`, `/reasons`, `/$returnId` | `commerce/returns.tsx`, `commerce/returns.index.tsx` |
| `/membership/plans` | `/$planId/edit` | `membership/plans.tsx`, `membership/plans.index.tsx` |

Orders and customers retain their original search schemas on the parent. Returns retains its commerceReturns PluginGuard on the parent, covering the child routes as well. Commerce/membership ancestor permission and plugin guards remain unchanged.

`support.index.tsx` now redirects bare `/support` to `/support/analytics` inside the existing tickets PluginGuard. Analytics retains its existing `/admin/support` permission guard. `kb/$articleId.tsx` now recognizes the actual generated `/kb/$articleId` URL (including trailing slash) and redirects to its editor. Pathless authenticated/admin layouts do not add an `/admin` URL segment.

Root separately owns the analogous products split and SearchBox repair; neither source was changed by this slice. The generated route tree includes root's products index plus this slice's six new index routes.

## Verification

- Isolated mounted DOM/memory-router regression passes: five actual parent components, generated parent/index/child metadata, all eight original child paths, index-to-child-to-index navigation, disabled Returns guard, disabled Support guard before redirect, enabled Support redirect, and actual KB beforeLoad redirect. Actual plugin guard code runs with deterministic settings; leaf screens are fixture headings. This is routing proof, not backend-data or RBAC acceptance.
- Orders/customers actual search validators accept valid pagination/search and reject out-of-bounds pagination.
- `bun test apps/web/src/lib/__tests__/admin-route-parents.test.ts`: 1 subprocess test passes; its Node assertions cover the above cases. Test fixtures use the browser conditional export in their isolated Bun process so TanStack's real client subscriptions run under jsdom.
- Admin `bun run check-types`: passes.
- Scoped oxlint: 14 files, zero warnings/errors. Owned source formatted with two-space indentation.
- Generated route tree refreshed using the installed TanStack generator offline; no app/server launch or network operation.
- Global diff-check temporarily reports a concurrent auth-owned media/mutations.ts whitespace edit; that owner was notified. No unrelated source changed to clear it.

Native acceptance remains root-owned and pending for these five route families at this checkpoint. Planned seeded checks: order detail and membership plan edit. Attributes, customer credit, returns, Support, and KB are covered by the scoped routing regression; no live fixtures or full-screen acceptance is claimed.

## Inventory limits

Root native follow-up passed on the actual Aster staging site: order CP-2026-428643 opened `/commerce/orders/xd7xbz61e8wk2ggsvjcty7ar7n8dt1nv`, showing Order Detail, the camp mug SKU/quantity, $38 line amount and saved $45 total. Aster Circle opened `/membership/plans/vn7vc6c4hwn5j4sbyw41yzkvmh8dvdww/edit`, showing Edit Plan, its actual title/slug/priority and no list; Back to plans restored the list. Evidence: `output/aster-house/admin-route-repair/acceptance.json`, `order-detail.png`, `membership-plan-editor.png`. No order or membership mutation was performed. The other route families retain the local routing scope above and are not promoted to full live acceptance.

The read-only inspection followed generated parent relationships into delegated layout components. Posts/pages detail parents are valid because PostDetailLayout supplies an Outlet. Commerce settings, shipping/tax, and settings analytics/integrations have conditional Outlet branches and were not classified as this same defect. This repair does not claim every broken-link symptom shares this cause, nor blanket-fix pathname comparisons.

## Root native evidence received

Order detail passed: CP-2026-428643 at `/commerce/orders/xd7xbz61e8wk2ggsvjcty7ar7n8dt1nv` rendered the mug SKU, quantity, $38 line item and recorded $45 total; the list was absent. Membership native acceptance is still pending in this checkpoint. Root separately proved SearchBox button/Enter behavior after its own repair.
