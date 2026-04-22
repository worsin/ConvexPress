# ConvexPress System PRDs

Canonical product requirements docs, one per system. Filenames are `PRD.md`
inside each system directory.

## Commerce (ported from VexCart 2026-04-22)

Sixteen PRDs were migrated from `/Users/worsin/Development/VexCart/docs/` on
2026-04-22. Each file opens with an adaptation banner summarizing origin +
ConvexPress environment constraints. Lexical substitutions (product name,
repo paths, package prefixes) were applied automatically; deeper semantic
rewrites (capability names, event codes) are TODO as each system is
touched next.

| System | Slug | Source |
|---|---|---|
| Cart System | `cart-system/` | VexCart `PRD-SHOPPING-CART.md` |
| Checkout System | `checkout-system/` | VexCart `PRD-CHECKOUT-SYSTEM.md` |
| Order System | `order-system/` | VexCart `PRD-ORDER-MANAGEMENT.md` |
| Payment System | `payment-system/` | VexCart `PRD-PAYMENT-SYSTEM.md` |
| Product System | `product-system/` | VexCart `PRD-PRODUCT-CATALOG.md` |
| Inventory System | `inventory-system/` | VexCart `PRD-INVENTORY-SYSTEM.md` |
| Product Category System | `product-category-system/` | VexCart `PRD-CATEGORY-SYSTEM.md` |
| Subscription System | `subscription-system/` | VexCart `PRD-DRAFT-SUBSCRIPTION-PRODUCTS.md` |
| Product Variants System | `product-variants-system/` | VexCart `PRD-DRAFT-PRODUCT-VARIANTS.md` |
| Product Bundles System | `product-bundles-system/` | VexCart `PRD-DRAFT-PRODUCT-BUNDLES.md` |
| Digital Products System | `digital-products-system/` | VexCart `PRD-DRAFT-DIGITAL-PRODUCTS.md` |
| Reviews & Ratings System | `reviews-ratings-system/` | VexCart `PRD-DRAFT-REVIEWS-RATINGS.md` |
| Wishlist System | `wishlist-system/` | VexCart `PRD-DRAFT-WISHLIST-SYSTEM.md` |
| Customer Support System | `customer-support-system/` | VexCart `PRD-DRAFT-CUSTOMER-SUPPORT.md` |
| Commerce Analytics System | `commerce-analytics-system/` | VexCart `PRD-DRAFT-ANALYTICS-REPORTING.md` |
| Customer System | `customer-system/` | VexCart `PRD-CUSTOMER-ACCOUNTS.md` |

## Shipping (ConvexPress-native)

Pre-existing ConvexPress specs for shipping:

- `shipping-index/` — top-level shipping architecture
- `shipping-zones-system/`, `shipping-classes-system/`, `shipping-packages-system/`
- `shipping-rules-engine/`, `rate-calculation-pipeline/`
- `shipping-method-*/` — 11 method-specific PRDs
- `shipping-provider-*/` — 5 provider integrations (UPS/USPS/FedEx/DHL/ShipStation)
- `shipping-labels-system/`, `shipping-manifests-system/`, `shipping-tracking-system/`
- `ship-from-locations-system/`
- `address-validation-system/`

## Products & content

- `product-addons-system/`, `product-attributes-system/`, `product-variations-system/`
- `analytics-system/`, `ga4-integration-system/`
- `ai-content-generation/`, `tabbed-editor-shell/`

## Deliberately NOT migrated from VexCart

ConvexPress already owns its equivalents; the VexCart versions were left in
place as historical reference only.

- `PRD-AUTH-SYSTEM.md` — ConvexPress uses Convex Auth (admin) + Clerk (website). See `.claude/docs/AUTH-SYSTEM.md`.
- `PRD-EMAIL-NOTIFICATION-SYSTEM.md` — ConvexPress's own Email Notification System is canonical.
- `PRD-EVENT-SYSTEM.md` — replaced by the ConvexPress Event Dispatcher System.
- `PRD-MEDIA-LIBRARY.md` — replaced by the ConvexPress Media System.
- `PRD-ROLE-PERMISSION-SYSTEM.md` — replaced by the ConvexPress Role & Capability System (WordPress-standard roles).
- `PRD-SITE-NOTIFICATION-SYSTEM.md` — ConvexPress's own Site Notification System is canonical.
- `PRD-DRAFT-API-SYSTEM.md` — replaced by the ConvexPress API System.
- `PRD-DRAFT-SEARCH-SYSTEM.md` — replaced by the ConvexPress Search System.
- `PRD-ADMIN-DASHBOARD.md` — superseded by ConvexPress's Dashboard System + admin-shell-ui.
- `PRD-TEMPLATE.md` — utility template, not a real PRD.

## Banner contract

Every ported PRD's banner states:

- **Origin:** date of VexCart → ConvexPress migration
- **Environment:** ConvexPress CMS + Commerce (WordPress-replacement)
- **Auth stack:** Convex Auth admin + Clerk website
- **Roles:** WordPress-standard Administrator/Editor/Author/Contributor/Subscriber
- **No themes/widgets/plugins** (AI-built custom per-site)
- **Package manager:** Bun
- **Cross-link** to `docs/stripe-integration.md` for payment architecture

The banner is the source of truth for environment constraints when a PRD
and a ConvexPress memory conflict.
