# VexCart → ConvexPress PRD Migration Report

**Date:** 2026-04-22
**Source:** `/Users/worsin/Development/VexCart/docs/`
**Target:** `/Users/worsin/Development/ConvexPress/specs/ConvexPress/systems/`

---

## Summary

Sixteen commerce-tech PRDs migrated from VexCart to ConvexPress. **17,341 lines** of spec content now live at the conventional `specs/ConvexPress/systems/<slug>/PRD.md` path. Each file opens with an adaptation banner stating origin date + ConvexPress environment constraints.

## What was migrated

| # | VexCart source | ConvexPress target | Lines |
|---|---|---|---|
| 1 | `PRD-SHOPPING-CART.md` | `cart-system/PRD.md` | 1,427 |
| 2 | `PRD-CHECKOUT-SYSTEM.md` | `checkout-system/PRD.md` | 1,466 |
| 3 | `PRD-ORDER-MANAGEMENT.md` | `order-system/PRD.md` | 1,217 |
| 4 | `PRD-PAYMENT-SYSTEM.md` | `payment-system/PRD.md` | 1,517 |
| 5 | `PRD-PRODUCT-CATALOG.md` | `product-system/PRD.md` | 1,448 |
| 6 | `PRD-INVENTORY-SYSTEM.md` | `inventory-system/PRD.md` | 1,112 |
| 7 | `PRD-CATEGORY-SYSTEM.md` | `product-category-system/PRD.md` | 848 |
| 8 | `PRD-DRAFT-SUBSCRIPTION-PRODUCTS.md` | `subscription-system/PRD.md` | 1,616 |
| 9 | `PRD-DRAFT-PRODUCT-VARIANTS.md` | `product-variants-system/PRD.md` | 831 |
| 10 | `PRD-DRAFT-PRODUCT-BUNDLES.md` | `product-bundles-system/PRD.md` | 876 |
| 11 | `PRD-DRAFT-DIGITAL-PRODUCTS.md` | `digital-products-system/PRD.md` | 809 |
| 12 | `PRD-DRAFT-REVIEWS-RATINGS.md` | `reviews-ratings-system/PRD.md` | 827 |
| 13 | `PRD-DRAFT-WISHLIST-SYSTEM.md` | `wishlist-system/PRD.md` | 522 |
| 14 | `PRD-DRAFT-CUSTOMER-SUPPORT.md` | `customer-support-system/PRD.md` | 874 |
| 15 | `PRD-DRAFT-ANALYTICS-REPORTING.md` | `commerce-analytics-system/PRD.md` | 757 |
| 16 | `PRD-CUSTOMER-ACCOUNTS.md` | `customer-system/PRD.md` | 1,194 |

## What was NOT migrated (and why)

ConvexPress already owns its equivalent systems. VexCart versions remain in
the VexCart repo as historical reference.

| VexCart source | Why skipped |
|---|---|
| `PRD-AUTH-SYSTEM.md` | ConvexPress uses Convex Auth + Clerk. See `.claude/docs/AUTH-SYSTEM.md`. |
| `PRD-EMAIL-NOTIFICATION-SYSTEM.md` | ConvexPress Email Notification System is canonical. |
| `PRD-EVENT-SYSTEM.md` | ConvexPress Event Dispatcher System is canonical. |
| `PRD-MEDIA-LIBRARY.md` | ConvexPress Media System is canonical. |
| `PRD-ROLE-PERMISSION-SYSTEM.md` | ConvexPress Role & Capability System uses WordPress roles. |
| `PRD-SITE-NOTIFICATION-SYSTEM.md` | ConvexPress Site Notification System is canonical. |
| `PRD-DRAFT-API-SYSTEM.md` | ConvexPress API System is canonical. |
| `PRD-DRAFT-SEARCH-SYSTEM.md` | ConvexPress Search System is canonical. |
| `PRD-ADMIN-DASHBOARD.md` | Superseded by Dashboard System + admin-shell-ui. |
| `PRD-TEMPLATE.md` | Utility template, not a real PRD. |

## Adaptation banner

Every ported file opens with:

```markdown
> **Origin:** Ported from VexCart on 2026-04-22.
> **Environment:** ConvexPress CMS + Commerce (WordPress-replacement architecture).
> **Auth stack:** Admin uses Convex Auth; website uses Clerk. Not VexCart's auth model.
> **Roles:** WordPress-standard — Administrator / Editor / Author / Contributor / Subscriber.
> **No themes, widgets, or plugins** in ConvexPress — AI builds custom per-site.
> **Package manager:** Bun (not npm/pnpm).
> **See `agents/knowledge/stripe-integration.md`** for the site-wide Stripe provider architecture; this PRD's payment/tax references should be read through that lens.
```

This banner is the override contract: when the PRD body and the ConvexPress
environment constraints conflict, the banner wins.

## Mechanical substitutions applied

Every file had these find/replaces run:

- `VexCart-Admin` → `ConvexPress-Admin`
- `VexCart-Website` → `ConvexPress-Website`
- `@vexcart/` → `@convexpress/`
- `vexcart.com` → `convexpress.com`
- `vexcart.` → `convexpress.`
- `VexCart` → `ConvexPress`
- `vexcart` → `convexpress`

## Deeper semantic adaptations NOT yet done

The mechanical substitutions handle product name + repo paths. The
following deeper changes still reference VexCart-era semantics verbatim
and should be rewritten inline as each system is next touched:

1. **Capability names** — VexCart capability codes may differ from
   ConvexPress. E.g., VexCart's `commerce.cart.*` needs verification against
   `capabilities.ts`.
2. **Role names** — the banner says WordPress-standard roles; body text in
   some PRDs still references VexCart role slugs (`customer`, `admin`,
   `merchant`) instead of the WordPress 5 (`Administrator`/`Editor`/
   `Author`/`Contributor`/`Subscriber`).
3. **Event codes** — VexCart may use different naming conventions than
   ConvexPress's Event Dispatcher. Verify against
   `.claude/docs/EVENT-DISPATCHER-SYSTEM.md` when consuming.
4. **Schema table prefixes** — most ConvexPress commerce tables use the
   `commerce_*` prefix (e.g. `commerce_tax_rules`). Verify PRD schema
   sections match actual `ConvexPress-Admin/packages/backend/convex/schema/commerce.ts`.
5. **Cross-PRD references** — some PRDs reference siblings by old VexCart
   filename (`PRD-TAX-CALCULATION`, `PRD-DISCOUNTS`). Those never existed
   in VexCart either; they're aspirational cross-refs. Either write them
   or remove the reference.
6. **UCP (Universal Commerce Protocol)** — VexCart's checkout PRD mentions
   UCP + MCP tools for AI agents. Verify ConvexPress carries this scope;
   if not, flag the section as "deferred to post-MVP."
7. **Tax + Discount sections in checkout/order PRDs** — scattered inline
   tax content (VexCart never wrote a standalone Tax PRD). The Tax System
   audit at `.codex/audit-backlog/system-audit-gaps.md` covers what's
   actually built in ConvexPress; the inline PRD refs may drift.

## Next actions

1. **Stage 1 (immediate)** — commit the migration as-is. Banner + mechanical
   substitutions are safe; nothing is broken, the PRDs just reference some
   VexCart-era details that are now clearly flagged.
2. **Stage 2 (per-system rewrites)** — when each commerce system is next
   touched for a Wave, do the semantic rewrite of that PRD inline
   (capabilities, role names, schema, cross-refs). Use the banner as the
   override for environment-specific constraints.
3. **Stage 3 (register with Airtable)** — each of the 16 new PRDs
   corresponds to an existing or to-be-created system record in the
   ConvexPress Airtable base. Update PRD link fields on those records.

## Verification

```bash
find specs/ConvexPress/systems -name "PRD.md" | wc -l
# should be 16 new + existing shipping PRDs + 4 product/analytics PRDs

ls specs/ConvexPress/systems/cart-system/PRD.md
# should exist
```
