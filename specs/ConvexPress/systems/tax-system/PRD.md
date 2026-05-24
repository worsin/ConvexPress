# PRD: Tax System

> **Project:** ConvexPress — a unified CMS + commerce platform (WordPress + WooCommerce replacement). Commerce is not a separate app; it is a first-class layer inside ConvexPress alongside posts, pages, media, users, and taxonomies. Every commerce feature is either **baked into the commerce core** or **gated as an internal extension** via `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts` (feature flags, not a third-party marketplace).
> **Two-app architecture:** `ConvexPress-Admin/` (TanStack Router SPA, Convex Auth) owns the Convex database + all mutations. `ConvexPress-Website/` (TanStack Start SSR, Clerk auth) is a read-only consumer.
> **Roles (WordPress-standard):** Administrator / Editor / Author / Contributor / Subscriber. Customer-facing UIs serve `Subscriber` + guests.
> **No third-party plugin/theme marketplace.** AI builds custom per-site.
> **Package manager:** Bun. **UI:** Base UI. **Styling:** Tailwind v4. **Payments:** Stripe (see `agents/knowledge/stripe-integration.md`).
> **Canonical path:** `specs/ConvexPress/systems/tax-system/PRD.md`
> **Airtable Record:** `[redacted-airtable-record-id]` ("Tax System")
> **Expert:** `/experts:tax-system` (to be created; knowledge doc at `.claude/docs/TAX-SYSTEM.md`)
> **Status:** FEATURE-COMPLETE for in-house rules engine path; Stripe Tax provider integration planned for Wave 11.

---

## Integration with ConvexPress

**Positioning:** baked into commerce core.
**Code lives at:** `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts` (655 lines today) + `schema/commerce.ts:commerce_tax_rules`.
**Admin UI:** `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.tax.tsx`.

**Consumes these ConvexPress systems:**

- **Settings System** — reads `taxRateBasis` ("billing" / "shipping" / "store"), `pricesIncludeTax`, default store country/state; future `commerce.payments.taxProviderMode` (`"rules" | "stripe"`) gates live Stripe Tax.
- **Product System** — reads `commerce_products.taxClass` + `commerce_product_variants.taxClass` (string key matching a rule's `taxClass`). Future: `commerce_products.isTaxable: v.boolean()`.
- **Cart System** — cart displays a tax preview via `calculateTaxForLinesFromRules` (display-only; authoritative total is computed at checkout).
- **Checkout System** — calls `calculateTaxForLinesFromRules` with the buyer's chosen billing/shipping address (selected by `taxRateBasis`) and freezes the result onto `commerce_orders.taxAmount` at finalize.
- **Order System** — stores scalar `taxAmount` today; will store per-line `taxAmount` + `commerce_order_tax_lines` breakdown after Wave 11.
- **Commerce Subscriptions** — `subscription_invoices` carry their own `taxAmount`. Renewal invoices call the same engine.
- **Customer System** — future `users.isTaxExempt` + `users.taxExemptId` (VAT ID) short-circuit tax to zero with a reverse-charge metadata tag.
- **Shipping System** — future: tax on shipping-line items gated by `shippingTaxClass` setting.
- **Event Dispatcher** — emits `tax.rule_created`, `tax.rule_updated`, `tax.rate_changed` events (for audit + compliance log).
- **Role & Capability System** — `commerce.tax.manage` capability gates every mutation.

**WooCommerce analog:** WooCommerce tax rates + Standard/Reduced/Zero tax classes, plus the TaxJar + Avalara extension pattern. We match the native WooCommerce feature set and use Stripe Tax (when enabled) as the TaxJar/Avalara-equivalent certified provider.

---

## 1. Overview

### 1.1 Purpose

The Tax System is ConvexPress's authoritative sales-tax calculator. It backs
cart previews, checkout finalization, subscription renewals, proration
invoices, and order audit trails. It is designed to operate in two modes:

1. **Rules engine (default)** — deterministic in-house calculation against an
   admin-managed `commerce_tax_rules` table, supporting
   country/state/postal matching, multiple tax classes (standard / reduced
   / zero / custom), and tax-inclusive vs tax-exclusive pricing.
2. **Stripe Tax (Wave 11 planned)** — offload jurisdiction + nexus tracking
   to Stripe when `commerce.payments.taxProviderMode === "stripe"`. Falls
   back to the rules engine for unsupported regions.

### 1.2 Scope

**In Scope:**

- Admin-managed tax rule CRUD with country / state / postal-pattern matching.
- Multiple tax classes (string-keyed) — standard / reduced-rate / zero-rate + custom.
- Tax-inclusive pricing (`pricesIncludeTax` setting) with correct un-grossing on invoices.
- `taxRateBasis` routing — use billing, shipping, or store address for rate lookup.
- Per-class grouping + per-class rate calculation (multi-class carts apply the right rate per line).
- Free-tier ($0) short-circuit — no API calls, just a recorded transaction ID.
- Settings-first key resolution for Stripe Tax (`stripeSecretKey` + future `taxProviderMode`).
- Provider fallback — if Stripe Tax call fails, log + fall back to rules engine (deploy safety).
- Sales tax breakdown reporting — sales by jurisdiction / tax class for compliance.
- Rate history / effective dates — audit log of every tax-rule edit.
- Integration with checkout, cart preview, and subscription-renewal pipelines.
- Public `checkTaxPreview` query for cart display.
- Admin-only `calculateTaxAuthoritative` query for checkout finalization.

**Out of Scope (deferred or owned elsewhere):**

- Shipping-cost tax classes are *configured* here but the shipping total they apply to is owned by **Shipping System** PRDs.
- Discounts / coupon pre-tax vs post-tax math — **Discount System** PRD owns the stacking rule; Tax System consumes the final discounted subtotal.
- VAT ID validation against VIES — belongs to **Customer System** (tax-exempt flag setter); Tax System only reads the resulting flag.
- 1099-K / sales reports dashboards — **Commerce Analytics System** owns the visualizations; Tax System exposes query data.

### 1.3 Key Differentiators

- **Deterministic in-house rules** — no external dependency by default. Offline-safe, no per-call provider fee, no rate-limit blast radius.
- **Provider-pluggable** — Stripe Tax integration lands as a drop-in when `taxProviderMode === "stripe"` without touching the rule schema.
- **Per-class grouping** — a mixed cart with `standard` (TVs) + `reduced-rate` (groceries) + `zero-rate` (books) computes three sub-totals and applies the right rate to each, exactly like WooCommerce.
- **Authoritative at checkout only** — the cart preview is allowed to drift slightly (display); the checkout finalization freezes tax with the address + rules at that instant.

---

## 2. Data Model

### 2.1 `commerce_tax_rules` (exists)

```ts
commerce_tax_rules: defineTable({
  name: v.string(),                 // "California sales tax"
  countryCode: v.string(),          // "US"
  stateCode: v.optional(v.string()),// "CA"
  postalPattern: v.optional(v.string()), // "94*" — star-glob supported
  ratePercent: v.number(),          // 7.25
  taxClass: v.optional(v.string()), // "standard" | "reduced-rate" | "zero-rate" | custom
  isActive: v.boolean(),
  priority: v.optional(v.number()), // for ordering overlapping rules
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_country_state", ["countryCode", "stateCode"])
  .index("by_active", ["isActive"])
  .index("by_tax_class", ["taxClass"]);
```

### 2.2 `commerce_tax_classes` (Wave 11 — not yet created)

```ts
commerce_tax_classes: defineTable({
  code: v.string(),       // "reduced-rate"
  label: v.string(),      // "Reduced Rate (groceries, books)"
  description: v.optional(v.string()),
  isDefault: v.boolean(), // true on "standard" only
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_code", ["code"])
  .index("by_default", ["isDefault"]);
```

**Why add:** today `taxClass` is a free-form string — admins can typo it
and mismatched strings silently fall to the default rate. A managed list
prevents this + drives the Tax Class selector in the product editor.

### 2.3 `commerce_order_tax_lines` (Wave 11)

```ts
commerce_order_tax_lines: defineTable({
  orderId: v.id("commerce_orders"),
  orderItemId: v.optional(v.id("commerce_order_items")),
  ruleId: v.optional(v.id("commerce_tax_rules")),
  taxClass: v.optional(v.string()),
  jurisdictionLabel: v.string(),     // "CA / US" or "EU VAT DE"
  taxableAmount: v.number(),         // cents
  ratePercent: v.number(),           // 7.25
  taxAmount: v.number(),             // cents
  provider: v.optional(v.string()),  // "rules" | "stripe"
  createdAt: v.number(),
})
  .index("by_order", ["orderId"])
  .index("by_order_item", ["orderItemId"]);
```

**Why add:** today `commerce_orders.taxAmount` is a scalar. Compliance
audits (especially EU VAT quarterly returns, US multi-state nexus) need
per-jurisdiction + per-rate breakdown. This table is the authoritative
audit trail — write once at checkout finalize, read by reports.

### 2.4 `commerce_tax_rate_history` (Wave 11)

```ts
commerce_tax_rate_history: defineTable({
  ruleId: v.id("commerce_tax_rules"),
  changedBy: v.id("users"),
  changedAt: v.number(),
  before: v.any(),  // serialized rule snapshot
  after: v.any(),
  reason: v.optional(v.string()),
})
  .index("by_rule", ["ruleId"])
  .index("by_changed_at", ["changedAt"]);
```

**Why add:** a rate edited mid-quarter must still compute correctly for
orders that predate the change. Today edits mutate `commerce_tax_rules`
live and the "what rate was applied" answer requires ordering lookup
against paid-at timestamps. Writing a history row gives compliance the
unambiguous audit trail.

### 2.5 Product / variant / user additions (Wave 11)

```ts
// Add to commerce_products + commerce_product_variants:
isTaxable: v.optional(v.boolean()), // default true; false for gift cards,
                                     // digital services exempt by jurisdiction,
                                     // donation products, etc.

// Add to users (or commerce_customer_profiles):
isTaxExempt: v.optional(v.boolean()),
taxExemptId: v.optional(v.string()),       // VAT ID / reseller certificate
taxExemptReason: v.optional(v.string()),   // "B2B reverse-charge" | "Nonprofit" | …
taxExemptVerifiedAt: v.optional(v.number()),
```

### 2.6 Settings — `commerce.payments`

Existing (confirmed wired):
- `taxRateBasis: "billing" | "shipping" | "store"`
- `pricesIncludeTax: boolean`
- `stripePublishableKey`, `stripeSecretKey`, `stripeWebhookSecret`
- `subscriptionChargingEnabled: boolean` (governs live renewal charging)

Wave 11 additions:
- `taxProviderMode: "rules" | "stripe"` (default `"rules"`)
- `shippingTaxClass: string` (default `null` — no shipping tax; set to e.g. `"standard"` to tax shipping lines)
- `commerceSubscriptionsInvoiceCounter` already exists (Wave 10.3) and has no relation to tax — noted here only because Wave 10.3 added the same settings-section pattern we're reusing for tax counters.

---

## 3. Functions

### 3.1 Admin CRUD (exists)

```
commerce.tax.list             — query,    list all rules
commerce.tax.getById          — query,    single rule
commerce.tax.calculate        — query,    preview calculator (for admin UI)
commerce.tax.create           — mutation, create rule (requires commerce.tax.manage)
commerce.tax.update           — mutation, update rule
commerce.tax.remove           — mutation, delete rule
commerce.tax.toggleActive     — mutation, active flag toggle
commerce.tax.seedDefaultTaxRules — mutation, seed sample US/CA rules for new sites
```

### 3.2 Calculation helpers (exists, exported from `commerce/tax.ts`)

```ts
export function calculateTaxFromRules(
  rules: TaxRule[],
  address: TaxAddress & { pricesIncludeTax?: boolean },
  taxableAmount: number,
): { taxAmount: number; appliedRate: number; matchedRules: TaxRule[] };

export function calculateTaxForLinesFromRules(
  rules: TaxRule[],
  lines: Array<{ amount: number; taxClass?: string }>,
  address: TaxAddress & { taxClass?: string; pricesIncludeTax?: boolean },
  options?: { pricesIncludeTax?: boolean },
): {
  taxAmount: number;
  byClass: Array<{ taxClass: string; taxableAmount: number; taxAmount: number; ratePercent: number }>;
};
```

### 3.3 Wave 11 new queries / mutations / actions

```
commerce.tax.checkTaxPreview          — public query, cart preview (non-authoritative)
commerce.tax.calculateAuthoritative   — internal query, checkout + subscription renewal
commerce.tax.reportByJurisdiction     — query, sales-by-jurisdiction for a date range
commerce.tax.listClasses              — query, manage tax classes table
commerce.tax.createClass              — mutation
commerce.tax.updateClass              — mutation
commerce.tax.deleteClass              — mutation
commerce.tax.getRateHistory           — query, audit trail of rule edits
commerce.tax.actions.calculateViaStripe — Node action, Stripe Tax integration
```

### 3.4 Wave 11 webhook integration

Extend `/webhooks/stripe` with:
- `tax.settings.updated` (if enrolled in Stripe Tax) → log
- `customer.tax_id.created` / `.updated` → persist VAT IDs back onto `commerce_customer_profiles`

---

## 4. Admin UI

### 4.1 Existing: `/commerce/settings/tax` (single page)

- Rule list table (name, country, state, postal pattern, class, rate %, active)
- Add/edit rule inline
- Preview tool — enter country/state/postal/class/amount → shows computed tax
- "Seed defaults" button (creates CA/US example rules)

### 4.2 Wave 11 UI additions

- **Tax Classes route** — `/commerce/settings/tax/classes` with CRUD for managed classes; referenced as a dropdown in the product editor's existing `taxClass` field.
- **Rate history route** — `/commerce/settings/tax/rules/$ruleId/history` shows the audit log for a single rule.
- **Reports route** — `/commerce/reports/tax` shows sales-by-jurisdiction + sales-by-class for a date range (backed by `commerce_order_tax_lines`).
- **Provider switch** — a dropdown in the Tax settings page: `"Rules engine" | "Stripe Tax"`. Switching to Stripe Tax requires valid Stripe credentials and nexus enrollment (confirmation modal).

### 4.3 Product editor integration (partial)

Product editor at `CommerceProductEditor.tsx` already has a tax-class text input. Wave 11 replaces this with a Select driven by `commerce.tax.listClasses`.

Add a new "Taxable" toggle (default on) bound to `commerce_products.isTaxable` — off for gift cards, donation products, certain digital services.

### 4.4 Customer profile UI

`/dashboard/account/billing` gains a "Tax exemption" section:
- VAT ID / reseller certificate number input
- Exemption reason dropdown
- Admin-side verification flag (customer submits → admin approves → `taxExemptVerifiedAt` set)

---

## 5. Events

- `tax.rule_created` — payload: ruleId, actorId
- `tax.rule_updated` — payload: ruleId, actorId, diff
- `tax.rule_deleted` — payload: ruleId, actorId
- `tax.rate_changed` — payload: ruleId, oldRate, newRate (subscribable by audit log + email alerts)
- `tax.exempt_granted` — payload: userId, adminId, reason
- `tax.exempt_revoked` — payload: userId, adminId, reason
- `tax.provider_switched` — payload: fromMode, toMode, actorId

All emitted via `helpers/events.emitEvent` and routed through the Event Dispatcher System.

---

## 6. Capabilities

- `commerce.tax.manage` — create/update/delete tax rules, classes, settings. Granted to Administrator by default.
- `commerce.tax.view` — view-only access to rules + reports. Granted to Administrator, Editor.
- `commerce.customers.tax_exempt` — approve/revoke tax-exempt status on a customer. Administrator only.

Wire via `helpers/permissions.requireCan(ctx, "commerce.tax.manage")` on every mutation.

---

## 7. Integration points (one-paragraph each)

### Cart
Cart displays a tax preview via `calculateTaxForLinesFromRules` keyed on the user's current default address (from profile) or guest-default store address. Display-only; shows the customer an approximate tax so the cart total feels real.

### Checkout
At finalize (`commerce/checkout.ts` in the `completePurchase` path), the authoritative `calculateTaxForLinesFromRules` runs with the actual billing/shipping address (selected by `settings.taxRateBasis`). Result is frozen onto `commerce_orders.taxAmount` + per-line rows in `commerce_order_tax_lines`. The invoice sent to Stripe carries `amount` including tax.

### Subscriptions
`commerceSubscriptions/internals.ts` calls the engine inside `createDueInvoices` per renewal. Proration invoices (`proration.ts`) call the engine on the net proration amount. Stub today returns `taxAmount: 0` for subscription invoices; Wave 11 wires the engine in.

### WordPress sync
Imported product's WooCommerce `tax_class` (e.g. `"reduced-rate"`) round-trips into our `taxClass` field; WooCommerce `tax_status` ("taxable" / "shipping" / "none") maps to our future `isTaxable` flag.

### Membership + Restriction
Content-Restriction gating runs before tax computation — restricted content simply never reaches the cart, so no tax surface. Membership plans have no tax-specific semantics; they're consumed products and taxed per their product's class.

---

## 8. Acceptance criteria

### 8.1 Rules engine (CURRENT — must not regress)

- [x] Tax rule CRUD works (implemented).
- [x] Per-class grouping on multi-class carts (implemented in `calculateTaxForLinesFromRules`).
- [x] Postal-pattern matching (star-glob) (implemented).
- [x] `pricesIncludeTax` un-grossing (implemented).
- [x] `taxRateBasis` routing — billing vs shipping vs store (read at `checkout.ts:81`).
- [x] Subscription invoices carry `taxAmount` field (scaffolded; stub value).
- [x] Admin UI renders rules + preview (implemented).
- [x] Tests pass for helpers (`commerce/__tests__/taxHelpers.test.ts`).

### 8.2 Wave 11 new work

- [ ] `commerce_tax_classes` table + CRUD + UI.
- [ ] `commerce_order_tax_lines` table — written at checkout finalize, one row per rule match.
- [ ] `commerce_tax_rate_history` table — rule-edit audit log.
- [ ] `commerce_products.isTaxable` + `commerce_product_variants.isTaxable` schema fields.
- [ ] `users.isTaxExempt` + `users.taxExemptId` + `users.taxExemptReason` + `users.taxExemptVerifiedAt`.
- [ ] Shipping-tax support via `shippingTaxClass` setting — shipping line computed at same rate as the chosen class.
- [ ] Stripe Tax integration: `actions.calculateViaStripe` Node action + settings gate + fallback to rules.
- [ ] Remove `@ts-nocheck` from `commerce/tax.ts` (currently line 1).
- [ ] Admin routes: `/commerce/settings/tax/classes`, `/commerce/settings/tax/rules/$id/history`, `/commerce/reports/tax`.
- [ ] Customer profile "Tax exemption" panel.
- [ ] Product editor: Select-driven `taxClass` + "Taxable" toggle.
- [ ] Subscription renewal invoices use the real engine (not stub 0).
- [ ] Events wired: `tax.rule_created/updated/deleted/rate_changed`, `tax.exempt_granted/revoked`, `tax.provider_switched`.
- [ ] Reports: sales-by-jurisdiction + sales-by-class for date range.

### 8.3 Compliance checks (must pass before enabling Stripe Tax mode in prod)

- [ ] US multi-state scenario: CA buyer + NY shipping address + store in TX → `taxRateBasis: "shipping"` routes correctly to NY rules.
- [ ] EU VAT scenario: DE buyer + DE shipping → DE VAT rate applies. UK buyer + DE shipping → UK reverse-charge metadata tagged (no DE VAT charged to UK business w/ valid VAT ID).
- [ ] `pricesIncludeTax: true` + tax class change: changing a product's class updates the displayed price (tax-inclusive display) + the un-grossed subtotal in the order.
- [ ] Rate change mid-order: admin edits a rule → existing draft orders recompute; paid orders stay frozen; history row written.
- [ ] Stripe fallback: Stripe Tax API returns 5xx → engine falls back to rules → order still completes + admin alert fires.
- [ ] Zero-amount invoice short-circuit: `totalAmount: 0` bypasses Stripe entirely, records `provider: "rules"`, `taxAmount: 0`.

---

## 9. Open architecture decisions

1. **Shipping tax inheritance** — When `shippingTaxClass === "standard"` and a cart has mixed classes, should shipping tax at the standard rate, or prorate across classes? WooCommerce does both (configurable). Default to "use shippingTaxClass directly" for MVP.
2. **Stripe Tax nexus enrollment** — Stripe Tax requires per-state / per-country enrollment in their dashboard. We can't automate this; the settings page must link out to the Stripe dashboard + show enrollment status per jurisdiction (future polish).
3. **VAT ID validation** — VIES (EU) + HMRC (UK) + IRS EIN check have different rate limits. Belongs to Customer System, not Tax System; Tax System consumes the pre-verified `isTaxExempt` flag.
4. **Rate history retention** — `commerce_tax_rate_history` grows unbounded with admin activity. Add a weekly cron to trim rows older than 7 years (US statute of limitations + 2-year buffer).

---

## 10. Out-of-scope & deferred

- **Full Avalara / TaxJar alternative providers** — Stripe Tax only for V1. Avalara would reuse the provider-mode pattern; defer until a customer needs it.
- **Cross-border duties / tariffs** — customs is not sales tax; belongs to a separate DDP (delivered-duty-paid) system if ever built.
- **Tax holiday support** — time-windowed rules. Deferred; current "effective dates" in `commerce_tax_rate_history` + a future `rule.effectiveFrom` / `effectiveTo` pair can unblock.
- **1099-K generation** — belongs to Commerce Analytics System or a dedicated Tax Reporting System if scope grows.

---

## 11. Out-of-the-box seed defaults

New ConvexPress sites should come pre-seeded with a minimal rule set admins
can keep or delete. Current `seedDefaultTaxRules` seeds a US CA example.
Wave 11 should expand to at least:

- US: CA (7.25%), NY (4% + city avg), TX (6.25%), FL (6%), WA (6.5%)
- CA (Canada): GST (5%) + provincial (ON 8%, BC 7%, QC 9.975%)
- EU: DE VAT (19%), FR VAT (20%), UK VAT (20%)
- AU: GST (10%)

With a prominent banner: "Sample rates — verify with your accountant
before processing real transactions."

---

## 12. Definition of Done (Wave 11)

Wave 11 is complete when:

1. All Wave-11 acceptance-criteria checkboxes in §8.2 are ticked.
2. Backend type-check passes without `--typecheck=disable` and without `@ts-nocheck` on `commerce/tax.ts`.
3. Test suite adds tax-rate-matching tests covering: multi-state routing, postal-pattern matching, `pricesIncludeTax` un-grossing, zero-tier short-circuit, B2B exempt short-circuit, per-class grouping.
4. Admin can switch between rules engine and Stripe Tax modes, see the effect immediately in the cart preview, and view per-jurisdiction sales reports.
5. A new customer sign-up + cart-checkout flow end-to-end produces a Stripe Charge with the correct tax amount and an order with matching `commerce_order_tax_lines` rows.

---

## 13. References

- Current implementation: `ConvexPress-Admin/packages/backend/convex/commerce/tax.ts` (655 lines).
- Test suite: `ConvexPress-Admin/packages/backend/convex/commerce/__tests__/taxHelpers.test.ts`.
- Admin UI: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.tax.tsx`.
- Stripe integration architecture: `agents/knowledge/stripe-integration.md`.
- Commerce Core PRD (origin of the original thin Tax Requirements section): `.codex/docs/COMMERCE-CORE-PLUGIN-PRD.md` §Tax Requirements, §Tax Settings.
- Audit backlog: `.codex/audit-backlog/system-audit-gaps.md` §Tax System (pre-Wave 11).
- Related PRDs:
  - `specs/ConvexPress/systems/checkout-system/PRD.md`
  - `specs/ConvexPress/systems/order-system/PRD.md`
  - `specs/ConvexPress/systems/customer-system/PRD.md`
  - `specs/ConvexPress/systems/discount-system/PRD.md` (sibling deficient PRD — write next)
- Airtable: ConvexPress base `[redacted-airtable-base-id]`, Systems table, record `[redacted-airtable-record-id]`.
