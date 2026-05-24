# Product Add-Ons System — Implementation Guide

**Companion to:** `./PRD.md`
**Target branch:** `feat/commerce-addons` (new, branched from `main`)
**Deployment strategy:** Incremental per phase, `npx convex deploy --typecheck=disable` between phases, full type-check on final phase (per `CLAUDE.md` convention).
**Expert ownership:** This system should be delegated to a new **Product Add-Ons System Expert** (to be created via `/create-expert`). Until the expert exists, the commerce and admin-editor experts co-own.

---

## Overall Sequencing

The work divides into **9 phases**, each independently deployable. Each phase ends with a checkpoint: schema deploys, typecheck passes where scoped, feature toggle off = zero-risk merge.

| Phase | Scope | Deliverable | Typecheck |
|-------|-------|-------------|-----------|
| 0 | Expert & docs | Expert knowledge doc, airtable record | N/A |
| 1 | Schema + settings flag | Tables exist, feature-flag plumbing | Disabled |
| 2 | Backend CRUD | Group + field mutations/queries + guards | Disabled |
| 3 | Runtime (validate + price) | Formula parser, validators, pricing engine | Disabled |
| 4 | Cart integration | addItem extended, snapshot into metadata | Disabled |
| 5 | Order snapshot | buildOrderItemMetadata extended | Disabled |
| 6 | Admin UI — list + group editor | Groups list, field editor, preview | Disabled |
| 7 | Admin UI — product tab | Tab inside CommerceProductEditor | Disabled |
| 8 | Storefront UI | ProductAddOnsSection, cart display, cart-edit | Enabled |
| 9 | Import/export + WooCommerce adapter | JSON round-trip + Woo import | Full typecheck |

---

## Phase 0 — Expert & Planning

**Tasks**
1. Create System Expert record in Airtable (base `[redacted-airtable-base-id]`, table `[redacted-airtable-table-id]`):
   - Name: "Product Add-Ons System Expert"
   - Slash command: `/experts:product-addons-system`
   - Knowledge doc path: `.claude/docs/PRODUCT-ADDONS-SYSTEM.md`
2. Author `.claude/docs/PRODUCT-ADDONS-SYSTEM.md` summarizing this PRD at a reference density.
3. Author `.claude/commands/experts/product-addons-system.md` slash command.
4. Register expert in `.claude/CLAUDE.md` registry table.
5. Update `CLAUDE.md` dispatch quick-reference with add-on routing.

**Exit:** expert can be dispatched via `/experts:product-addons-system` and will self-load its knowledge doc.

---

## Phase 1 — Schema & Settings Flag

### Files to add

**`ConvexPress-Admin/packages/backend/convex/schema/commerceAddOns.ts`** — new
```ts
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const commerceAddOnsTables = {
  commerce_addon_groups: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("archived")),
    displayLayout: v.union(v.literal("inline"), v.literal("accordion"), v.literal("tabs"), v.literal("popup"), v.literal("wizard")),
    displayPosition: v.union(v.literal("above_atc"), v.literal("below_atc"), v.literal("after_gallery"), v.literal("after_description")),
    sortOrder: v.number(),
    assignment: v.any(),             // see PRD §3.2; validator tightened later
    conditions: v.optional(v.array(v.any())),
    disableAddToCartWhenInvalid: v.boolean(),
    allowRepeater: v.boolean(),
    repeaterMin: v.optional(v.number()),
    repeaterMax: v.optional(v.number()),
    repeaterAutoFromQuantity: v.optional(v.boolean()),
    roleRestriction: v.optional(v.array(v.id("roles"))),
    sourceMeta: v.optional(v.any()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_sortOrder", ["sortOrder"])
    .index("by_createdAt", ["createdAt"]),

  commerce_addon_fields: defineTable({
    groupId: v.id("commerce_addon_groups"),
    fieldType: v.string(),           // enumerated in runtime; keep string for schema flexibility
    label: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    required: v.boolean(),
    sortOrder: v.number(),
    options: v.optional(v.array(v.any())),
    validation: v.optional(v.any()),
    pricing: v.any(),                // see PRD §3.6
    conditions: v.optional(v.array(v.any())),
    displayHints: v.optional(v.any()),
    sourceMeta: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_group_sortOrder", ["groupId", "sortOrder"])
    .index("by_slug", ["slug"]),
};
```

**Modify `convex/schema.ts`** — import + spread `commerceAddOnsTables`.

### Settings flag

**Modify `convex/settings/defaults.ts`:**
- Add `commerceAddOnsEnabled: boolean` to `PluginsSettings`.
- Add `commerceAddOnsEnabled: false` to `PLUGINS_DEFAULTS`.

**Modify `convex/settings/validators.ts`:**
- Add `commerceAddOnsEnabled: v.boolean()`.

### Deployment
```bash
cd ConvexPress-Admin && npx convex deploy --typecheck=disable
```

**Exit:** Tables exist; feature flag togglable from admin Settings → Plugins (already rendered via registry once registered in Phase 6).

---

## Phase 2 — Backend CRUD

### Files to add

```
ConvexPress-Admin/packages/backend/convex/commerceAddOns/
  helpers.ts      # enablement guards (mirror commerceBundles/helpers.ts)
  mutations.ts    # group + field CRUD
  queries.ts      # list, get, resolveGroupsForProduct
  runtime.ts      # (stubs — filled in Phase 3)
  internals.ts    # stubs
  README.md       # architecture overview (mirror commerceBundles/README.md)
```

**`helpers.ts`** — pattern from `commerceBundles/helpers.ts`:
```ts
import { ConvexError } from "convex/values";
import type { CommerceCtx } from "../commerce/helpers";
import { getPluginSettings } from "../commerce/helpers";

export async function isCommerceAddOnsEnabled(ctx: CommerceCtx): Promise<boolean> {
  const settings = await getPluginSettings(ctx);
  return settings.commerceEnabled && (settings as any).commerceAddOnsEnabled;
}

export async function requireCommerceAddOnsEnabled(ctx: CommerceCtx): Promise<void> {
  if (!(await isCommerceAddOnsEnabled(ctx))) {
    throw new ConvexError({ code: "commerce_addons_disabled", message: "Commerce Add-Ons is disabled." });
  }
}
```

**Mutations to implement:**
- `createGroup`, `updateGroup`, `archiveGroup`, `duplicateGroup`, `reorderGroups`
- `createField`, `updateField`, `deleteField`, `duplicateField`, `reorderFields`
- `assignGroupToProducts({ groupId, productIds, mode: "add"|"replace"|"remove" })`

Each mutation:
1. `await requireCommerce Enabled(ctx)` then `await requireCommerceAddOnsEnabled(ctx)`
2. `await requireCan(ctx, "manage_options")`
3. Validate input with Zod or Convex validators
4. Write with `updatedAt: Date.now()`
5. Emit event via `emitEvent(ctx, "commerce.addons.group.*", payload)`
6. Audit-log via `logAudit(ctx, { action, before, after })`

**Queries to implement:**
- `listGroups({ status?, search?, paginationOpts })`
- `getGroup({ groupId })` (returns group + fields)
- `getFieldsForGroup({ groupId })`
- `resolveGroupsForProduct({ productId })` — **public query**, powers storefront
  - Reads product → expands categoryIds + tagIds + productType.
  - Queries all active groups; filters by assignment rules; applies exclusions; sorts by `sortOrder`.
  - Returns groups + fully hydrated fields array.
  - Performance target: p95 ≤ 30ms. Consider a materialized lookup table if this becomes a hot path in Phase 11.

### Deployment
```bash
cd ConvexPress-Admin && npx convex deploy --typecheck=disable
```

**Exit:** All CRUD callable from backend; `resolveGroupsForProduct` returns correct results given manually seeded test data.

---

## Phase 3 — Runtime (Validation + Pricing)

### Files to add

**`commerceAddOns/runtime.ts`**:
```ts
// Public exports
export function validateSelections(group, fields, selections): { ok: boolean; errors: ValidationError[] };
export function computeAddOnContributions(fields, selections, basePrice, qty, currencyCode):
  { perUnitDelta: number; lineSurcharge: number; breakdown: AddOnBreakdownEntry[] };
export function evaluateFormula(expression: string, scope: Record<string, number>): number;
export function evaluateLookup(table: LookupTable, scope: Record<string, string | number>): number;
export function evaluateConditions(conditions, selections): boolean;
```

### Dependencies
- Add `expr-eval` or `mathjs` (sandboxed/strict) to `ConvexPress-Admin/packages/backend/package.json` for formula evaluation.
- NEVER use `eval`, `Function` constructor, or `vm`.

### Tests
Create a companion test file: `commerceAddOns/runtime.test.ts` (use Convex test harness or vitest if already in repo):
- Every pricing model produces correct output on golden inputs.
- Formula evaluator rejects: function references, prototype access, infinite recursion, too-long expressions (>200 chars).
- Lookup fallback fires when no row matches.
- Conditional logic — AND / OR / nested — tested exhaustively.

### Shared package consideration
If the storefront needs the same runtime for live price previews, **extract to `packages/shared-commerce-addons`** and consume from both `packages/backend` and `apps/web` (website). If not needed, defer.

**Exit:** runtime functions importable and exhaustively tested; no deployment needed (pure TS).

---

## Phase 4 — Cart Integration

### Files to modify

**`convex/commerce/cart.ts`** — `addItem` mutation:
1. Extend args: `addOnSelections: v.optional(v.array(v.any()))`.
2. After loading product, call `resolveGroupsForProduct` server-side (never trust client-provided definitions).
3. Call `validateSelections(groups, fields, selections)` — if invalid, throw `ConvexError({ code: "invalid_addon_selections" })`.
4. Call `computeAddOnContributions(...)` → `{ perUnitDelta, lineSurcharge, breakdown }`.
5. Compute final `unitPriceAmount = basePrice + perUnitDelta` (and floor at 0).
6. Compute `lineTotalAmount = unitPriceAmount × qty + lineSurcharge`.
7. Snapshot `metadata.addOns = breakdown`, `metadata.addOnsLineSurcharge = lineSurcharge`, `metadata.addOnSummary = humanSummary(breakdown)`.
8. Merge with existing metadata (preserve bundle data, variant data).

**`convex/commerce/cart.ts`** — `updateItem` mutation:
- Add a `replaceAddOnSelections` path — recomputes price and snapshot.

**`convex/commerce/cartHelpers.ts`**:
- Extend `buildCartItemVariantMetadata` to accept `addOnBreakdown` and include in metadata.
- Extend `resolveCartItemUnitPrice` to accept `addOnPerUnitDelta` and add it (after variant/bundle resolution).

### Test
Manually seed a product + group + field, call `addItem` with selections, verify `commerce_cart_items` row has correct `unitPriceAmount`, `lineTotalAmount`, `metadata.addOns`.

### Deployment
```bash
npx convex deploy --typecheck=disable
```

**Exit:** Cart accepts add-on selections; pricing math correct; metadata snapshot complete.

---

## Phase 5 — Order Snapshot

### Files to modify

**`convex/commerce/orderBundleHelpers.ts`** (despite the name, handles metadata for all line items):
- `buildOrderItemMetadata(item)` — already spreads `item.metadata`; add a small extension:
```ts
return {
  ...item.metadata,
  productTitle: item.productTitle,
  variantTitle: item.variantTitle,
  optionSummary: item.optionSummary,
  variantSku: item.variantSku,
  // add-ons pass through via spread; no change needed
  addOnSummary: item.metadata?.addOnSummary,
};
```

### Test
Place a test order through the checkout flow; verify `commerce_order_items.metadata.addOns` matches `commerce_cart_items.metadata.addOns`.

**Exit:** Add-on data survives cart → order transition with no loss.

---

## Phase 6 — Admin UI (List + Group Editor)

### Files to add

```
ConvexPress-Admin/apps/web/src/
  routes/_authenticated/_admin/commerce/
    addons.tsx                        # list page
    addons.new.tsx                    # create
    addons.$groupId.tsx               # edit (tabs)
    addons.$groupId.preview.tsx       # preview
    addons.settings.tsx               # global settings
  components/commerce/addons/
    AddOnGroupsTable.tsx              # WordPress-style list table
    AddOnGroupEditor.tsx              # tabbed editor shell
    AddOnFieldsTab.tsx                # drag-drop field list + field sheet
    AddOnFieldEditorSheet.tsx         # full field editor
    AddOnAssignmentTab.tsx            # product/category/tag picker
    AddOnDisplayTab.tsx               # layout, position, repeater
    AddOnConditionsTab.tsx            # condition rule builder
    AddOnSettingsTab.tsx              # status, slug, disableAddToCart
    AddOnLivePreview.tsx              # renders ProductAddOnsSection with mock
    FieldTypePicker.tsx               # modal to choose type
    ConditionRuleBuilder.tsx          # reusable for group & field
    PricingRuleBuilder.tsx            # switch on type, render sub-fields
    FormulaTokenPicker.tsx            # insert field slugs into formula
    LookupTableEditor.tsx             # grid editor
    OptionsListEditor.tsx             # for dropdown/radio/checkbox/swatch options
```

### Plugin registry

**`apps/web/src/lib/plugins/registry.ts`:**
- Add `"commerceAddOns"` to `AdminPluginId`.
- Add `commerceAddOnsEnabled: boolean` to `PluginSettingsValues`.
- Add `ADMIN_PLUGINS` entry:
```ts
{
  id: "commerceAddOns",
  title: "Product Add-Ons",
  description: "Customizable options and add-ons for products with custom pricing.",
  icon: Puzzle,
  settingsKey: "commerceAddOnsEnabled",
  navSectionIds: [],
  adminAccessPrefixes: ["/admin/commerce/addons"],
  routePrefixes: [],
}
```

**`apps/web/src/lib/admin-shell/nav-config.ts`** — add child under commerce:
```ts
{
  id: "commerce-addons",
  label: "Product Add-Ons",
  to: "/commerce/addons",
  pluginId: "commerceAddOns",
}
```

### UI conventions
- Base UI only (per CLAUDE.md). Never Radix.
- No popups for content management — every edit route is a full page.
- No hardcoded colors; use CSS variables.
- Match existing `CommerceProductEditor` and bundles-admin patterns.

### Regenerate TanStack Router
```bash
cd ConvexPress-Admin/apps/web && bunx tsr generate
```
(This updates `routeTree.gen.ts`.)

**Exit:** Admin can create a group, add all 22 field types, configure pricing/validation/conditions, save, see it in the list, duplicate, archive.

---

## Phase 7 — Admin UI (Product Tab)

### Files to modify

**`apps/web/src/components/commerce/CommerceProductEditor.tsx`:**
- Add "Add-Ons" tab in the tab array.
- Tab content: query `resolveGroupsForProduct({ productId })`; render matched groups with inheritance badges.
- "Override ordering" toggle — persists to a product-scoped ordering override (decide: either new table `commerce_product_addon_overrides` or store in `commerce_products.addOnOverrides` metadata bag).
- "+ Create group for this product only" → navigate to `/admin/commerce/addons/new?scope=product:$productId`.

**Exit:** Product editor surfaces matched add-on groups; admin can create product-scoped groups inline.

---

## Phase 8 — Storefront UI

### Files to add/modify

**`ConvexPress-Website/apps/web/src/components/commerce/ProductAddOnsSection.tsx`** — new:
- Fetches groups via `api.commerce.addOns.resolveGroupsForProduct`.
- Renders groups at their `displayPosition` with their `displayLayout`.
- Form state shape: `{ [groupId]: { [fieldSlug]: value, ... }, ... }` with repeater: `{ [groupId]: [{ [fieldSlug]: value }, ...] }`.
- Live price: calls `computeAddOnContributions` client-side (from shared package if extracted in Phase 3, or via a dedicated `api.commerce.addOns.previewPrice` query for a simpler first pass — the query is lighter cache-wise than porting the runtime).
- Validation on blur + on Add-to-Cart.
- File uploads: drag-drop zone → immediate upload via Media System → mediaId stored in selection.

**`ConvexPress-Website/apps/web/src/routes/_marketing/products/$slug.tsx`:**
- Import and render `ProductAddOnsSection` in the configured position (driven by group `displayPosition`).
- Pass form state into `addToCart` mutation call under `addOnSelections`.

**Cart page** — wherever cart lines render (likely `components/commerce/CartLine.tsx`):
- Render `metadata.addOns` as `Label: Value — $delta` rows under the product title.
- Pencil icon opens a flyout hosting the same `ProductAddOnsSection` in edit mode, bound to `updateItem({ cartItemId, replaceAddOnSelections })`.

**Order confirmation email + PDF invoice:**
- Extend templates (likely in `commerceOrders/emailTemplates.ts` or similar) to render `metadata.addOns` rows.

**Admin order view** (`apps/web/src/routes/_authenticated/_admin/commerce/orders.$orderId.tsx`):
- Render add-on rows under each line item.
- For file-upload fields: show thumbnail + download link.

### Feature flag flip
After QA passes, flip `commerceAddOnsEnabled` in Settings → Plugins on the dev site first, then staging, then production.

**Exit:** End-to-end flow works — configure add-ons in admin, shopper sees them on product page, adds to cart, edits in cart, checks out, receives email with add-ons, admin sees order with add-ons and file attachments.

---

## Phase 9 — Import/Export + WooCommerce Adapter

### Files to add

**`commerceAddOns/internals.ts`:**
- `exportGroups({ groupIds })` → JSON payload with groups + fields + option definitions + media references (by ID, not body).
- `importGroups({ payload, mode: "create" | "upsert_by_slug" })` → creates/updates with full validation.
- `importFromWooCommerce({ wooAddOnsPayload })` → adapter that maps WooCommerce Product Add-Ons export structure to our schema, stashing unknown fields under `sourceMeta.woo`.

### WooCommerce field mapping (reference — encode in adapter)

| Woo field | ConvexPress field |
|-----------|-------------------|
| `name` | `group.name` or `field.label` |
| `priority` | `group.sortOrder` |
| `fields[].type = multiple_choice` + `display = select` | `fieldType = dropdown` |
| `fields[].type = multiple_choice` + `display = radio` | `fieldType = radio` |
| `fields[].type = checkbox` | `fieldType = checkbox` |
| `fields[].type = custom_text` | `fieldType = short_text` |
| `fields[].type = custom_textarea` | `fieldType = long_text` |
| `fields[].type = file_upload` | `fieldType = file_upload` |
| `fields[].type = custom_price` | `fieldType = customer_defined_price` |
| `fields[].type = input_multiplier` | `fieldType = quantity` |
| `fields[].type = datepicker` | `fieldType = date` |
| `fields[].type = heading` | `fieldType = heading` |
| `fields[].options[].price_type = flat_fee` | `pricing.type = flat_once` |
| `fields[].options[].price_type = quantity_based` | `pricing.type = flat_per_quantity` |
| `fields[].options[].price_type = percentage_based` | `pricing.type = percentage` |
| `fields[].restrictions = letters/numbers/email/...` | `validation.formatHint` |
| `restrict_to_categories` | `assignment.categoryIds` |

Unknown/advanced plugin fields (conditional logic from EPO/Barn2 etc.) → `sourceMeta.woo` or `sourceMeta.epo` untouched.

### Full type-check
Final phase — flip `--typecheck=disable` off:
```bash
cd ConvexPress-Admin && npx convex deploy
```
Resolve any remaining type errors end-to-end.

**Exit:** JSON round-trip export/import works; WooCommerce Product Add-Ons imports via the Woo sync pipeline preserve every field.

---

## Cross-Cutting Concerns

### Capability registration
Add capabilities (if finer-grained than `manage_options`):
- `commerce_addons.read` — view groups
- `commerce_addons.write` — create/edit groups
- `commerce_addons.delete` — archive/delete

Register in role-capability system seed data; grant Administrator all, Editor `read`+`write` by default.

### Audit log entries
Every mutation emits an audit entry with `{ action, resourceType: "commerce_addon_group", resourceId, before, after }`.

### Events emitted
- `commerce.addons.group.created`
- `commerce.addons.group.updated`
- `commerce.addons.group.deleted`
- `commerce.addons.field.created / updated / deleted`
- `commerce.addons.line.configured` (cart add)
- `commerce.addons.line.edited` (cart edit)

Register in the events table and in the event-dispatcher PRD's event catalog.

### Email notifications
No new email templates needed — existing order-confirmation template just renders the new metadata rows. Update the template to handle `metadata.addOns` array.

### Search indexing
Add-on-configured products do not need separate search indexing. However, `addOnSummary` on order items is searchable — add to order search index in the Search System if not already covered.

### Analytics hooks
Phase 8 should fire `analytics.track` events for `addon.impression`, `addon.selection`, `addon.purchase`. Feed into Analytics System.

### Performance checks per phase
- Phase 2: `resolveGroupsForProduct` p95 ≤ 30ms on a product with 100 candidate groups.
- Phase 4: `cart.addItem` with add-ons p95 ≤ 150ms (includes validation + pricing).
- Phase 8: first meaningful paint of product page unchanged (add-ons lazy load).

### Testing strategy
- **Runtime (Phase 3):** exhaustive unit tests on every pricing model and condition operator.
- **Backend CRUD (Phase 2):** integration tests with seeded groups covering every assignment-resolution case.
- **Cart integration (Phase 4):** integration tests — create product, group, field; add to cart with selections; assert snapshot + pricing.
- **Storefront (Phase 8):** Playwright MCP — full golden-path flow: configure in admin → shop → cart → checkout → order email. Then edge cases: required field empty, conditional hide, repeater, file upload, cart-page edit.
- **WooCommerce import (Phase 9):** golden-file test — a captured real WooCommerce export should import and re-export byte-identical (modulo ordering).

### Documentation
- `.claude/docs/PRODUCT-ADDONS-SYSTEM.md` — expert reference doc.
- `commerceAddOns/README.md` — architecture overview.
- Inline JSDoc on every exported runtime function.
- Admin tooltips linking to a help article per field type (content authored in Phase 6).

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Formula evaluator RCE | Sandboxed parser only; no `eval`, no `Function`; unit tests against known exploits |
| Performance of `resolveGroupsForProduct` at scale | Index-driven queries; consider materialized view if >200 groups per store |
| Schema drift between ConvexPress and WooCommerce source | `sourceMeta` bag preserves unknown fields; round-trip tests flag drift |
| Admin authoring complexity | Phased UI rollout: start with simple types (text/radio/checkbox), layer in formula/lookup/repeater behind an "Advanced" feature toggle in Phase 6 |
| File-upload abuse (storage exhaustion) | Magic-byte validation; `fileMaxSizeBytes`; `fileMaxCount`; rate-limit per session |
| Cart recompute thrash on every keystroke | Debounce 250ms on client; server pricing only on `addItem` / `updateItem` — never on read |
| Breaking existing cart/order schema | All additions are in `metadata.*` — never rename or remove existing fields; additive only |
| Feature-flag gap (shoppers configure add-ons, admin disables mid-session) | Server re-validates on `addItem`; if plugin disabled, reject with friendly error and strip add-ons from cart |

---

## Deployment Checklist

Before merging to `main`:

- [ ] All 9 phases deployed to staging in order
- [ ] `npx convex deploy` (no `--typecheck=disable`) passes
- [ ] Playwright golden-path test green
- [ ] Feature flag default = `false` in production PLUGINS_DEFAULTS
- [ ] Audit log entries verified
- [ ] Events emitted and visible in event dispatcher
- [ ] Admin help content authored for every field type
- [ ] `.claude/docs/PRODUCT-ADDONS-SYSTEM.md` final
- [ ] Expert slash command `/experts:product-addons-system` dispatches correctly
- [ ] Airtable records updated (Systems, System Experts, Events, Actions)
- [ ] Order email template re-tested with add-ons
- [ ] PDF invoice re-tested with add-ons
- [ ] PRD checklist §15 Acceptance Criteria all green
