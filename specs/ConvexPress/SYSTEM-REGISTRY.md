# ConvexPress System Registry

Generated: 2026-04-22
Airtable base: `appqpJ8QQkoKsH02O` (ConvexPress)

This registry is the repo-side snapshot of parity between the Airtable `Systems` table and `System Experts` table. Every Airtable system listed here has exactly one linked System Expert record, a canonical PRD under `specs/ConvexPress/systems/`, a Codex expert prompt under `.codex/agents/experts/`, and a knowledge companion under `.codex/docs/`.

## Summary

- Airtable Systems: 72
- Full PRDs: 44
- Scaffold PRDs still needing expansion: 28
- Additional subsystem PRDs not linked to Airtable Systems: 23

| System | Status | Priority | PRD Lines | PRD Depth | PRD | Codex Expert | Knowledge Doc |
|---|---|---:|---:|---|---|---|---|
| AI Content Generation | In Development | P1 - High | 327 | Full | `specs/ConvexPress/systems/ai-content-generation/PRD.md` | `.codex/agents/experts/ai-content-generation.md` | `.codex/docs/AI-CONTENT-GENERATION.md` |
| Airtable Sync System | In Development | P1 - High | 185 | Full | `specs/ConvexPress/systems/airtable-sync-system/PRD.md` | `.codex/agents/experts/airtable-sync-system.md` | `.codex/docs/AIRTABLE-SYNC-SYSTEM.md` |
| Analytics System | In Development | P1 - High | 672 | Full | `specs/ConvexPress/systems/analytics-system/PRD.md` | `.codex/agents/experts/analytics-system.md` | `.codex/docs/ANALYTICS-SYSTEM.md` |
| API System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/api-system/PRD.md` | `.codex/agents/experts/api-system.md` | `.codex/docs/API-SYSTEM.md` |
| Audit Log System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/audit-log-system/PRD.md` | `.codex/agents/experts/audit-log-system.md` | `.codex/docs/AUDIT-LOG-SYSTEM.md` |
| Auth System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/auth-system/PRD.md` | `.codex/agents/experts/auth-system.md` | `.codex/docs/AUTH-SYSTEM.md` |
| Cart System | In Development | P0 - Critical | 1434 | Full | `specs/ConvexPress/systems/cart-system/PRD.md` | `.codex/agents/experts/cart-system.md` | `.codex/docs/CART-SYSTEM.md` |
| Checkout System | In Development | P0 - Critical | 1473 | Full | `specs/ConvexPress/systems/checkout-system/PRD.md` | `.codex/agents/experts/checkout-system.md` | `.codex/docs/CHECKOUT-SYSTEM.md` |
| Comment System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/comment-system/PRD.md` | `.codex/agents/experts/comment-system.md` | `.codex/docs/COMMENT-SYSTEM.md` |
| Content Editor System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/content-editor-system/PRD.md` | `.codex/agents/experts/content-editor-system.md` | `.codex/docs/CONTENT-EDITOR-SYSTEM.md` |
| Content Restriction System | In Development | P1 - High | 223 | Full | `specs/ConvexPress/systems/content-restriction-system/PRD.md` | `.codex/agents/experts/content-restriction-system.md` | `.codex/docs/CONTENT-RESTRICTION-SYSTEM.md` |
| Custom Field System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/custom-field-system/PRD.md` | `.codex/agents/experts/custom-field-system.md` | `.codex/docs/CUSTOM-FIELD-SYSTEM.md` |
| Customer System | In Development | P1 - High | 1200 | Full | `specs/ConvexPress/systems/customer-system/PRD.md` | `.codex/agents/experts/customer-system.md` | `.codex/docs/CUSTOMER-SYSTEM.md` |
| Dashboard System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/dashboard-system/PRD.md` | `.codex/agents/experts/dashboard-system.md` | `.codex/docs/DASHBOARD-SYSTEM.md` |
| DHL Express Integration | In Development | P2 - Medium | 805 | Full | `specs/ConvexPress/systems/shipping-provider-dhl/PRD.md` | `.codex/agents/experts/shipping-provider-dhl.md` | `.codex/docs/SHIPPING-PROVIDER-DHL.md` |
| Digital Products System | Not Started | P1 - High | 815 | Full | `specs/ConvexPress/systems/digital-products-system/PRD.md` | `.codex/agents/experts/digital-products-system.md` | `.codex/docs/DIGITAL-PRODUCTS-SYSTEM.md` |
| Discount System | In Development | P1 - High | 270 | Full | `specs/ConvexPress/systems/discount-system/PRD.md` | `.codex/agents/experts/discount-system.md` | `.codex/docs/DISCOUNT-SYSTEM.md` |
| Email Notification System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/email-notification-system/PRD.md` | `.codex/agents/experts/email-notification-system.md` | `.codex/docs/EMAIL-NOTIFICATION-SYSTEM.md` |
| Event Dispatcher System | Production Ready | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/event-dispatcher-system/PRD.md` | `.codex/agents/experts/event-dispatcher-system.md` | `.codex/docs/EVENT-DISPATCHER-SYSTEM.md` |
| FedEx Direct Integration | In Development | P1 - High | 856 | Full | `specs/ConvexPress/systems/shipping-provider-fedex/PRD.md` | `.codex/agents/experts/shipping-provider-fedex.md` | `.codex/docs/SHIPPING-PROVIDER-FEDEX.md` |
| GA4 Integration System | In Development | P2 - Medium | 679 | Full | `specs/ConvexPress/systems/ga4-integration-system/PRD.md` | `.codex/agents/experts/ga4-integration-system.md` | `.codex/docs/GA4-INTEGRATION-SYSTEM.md` |
| Gallery System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/gallery-system/PRD.md` | `.codex/agents/experts/gallery-system.md` | `.codex/docs/GALLERY-SYSTEM.md` |
| Inventory System | In Development | P1 - High | 1118 | Full | `specs/ConvexPress/systems/inventory-system/PRD.md` | `.codex/agents/experts/inventory-system.md` | `.codex/docs/INVENTORY-SYSTEM.md` |
| KB Article System | In Development | P1 - High | 183 | Full | `specs/ConvexPress/systems/kb-article-system/PRD.md` | `.codex/agents/experts/kb-article-system.md` | `.codex/docs/KB-ARTICLE-SYSTEM.md` |
| KB Category System | In Development | P1 - High | 147 | Full | `specs/ConvexPress/systems/kb-category-system/PRD.md` | `.codex/agents/experts/kb-category-system.md` | `.codex/docs/KB-CATEGORY-SYSTEM.md` |
| KB Collections System | In Development | P2 - Medium | 172 | Full | `specs/ConvexPress/systems/kb-collections-system/PRD.md` | `.codex/agents/experts/kb-collections-system.md` | `.codex/docs/KB-COLLECTIONS-SYSTEM.md` |
| KB Search & Analytics | In Development | P1 - High | 184 | Full | `specs/ConvexPress/systems/kb-search-and-analytics/PRD.md` | `.codex/agents/experts/kb-search-and-analytics.md` | `.codex/docs/KB-SEARCH-AND-ANALYTICS.md` |
| Media System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/media-system/PRD.md` | `.codex/agents/experts/media-system.md` | `.codex/docs/MEDIA-SYSTEM.md` |
| Membership Plan System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/membership-plan-system/PRD.md` | `.codex/agents/experts/membership-plan-system.md` | `.codex/docs/MEMBERSHIP-PLAN-SYSTEM.md` |
| Menu System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/menu-system/PRD.md` | `.codex/agents/experts/menu-system.md` | `.codex/docs/MENU-SYSTEM.md` |
| Order System | In Development | P0 - Critical | 1227 | Full | `specs/ConvexPress/systems/order-system/PRD.md` | `.codex/agents/experts/order-system.md` | `.codex/docs/ORDER-SYSTEM.md` |
| Page System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/page-system/PRD.md` | `.codex/agents/experts/page-system.md` | `.codex/docs/PAGE-SYSTEM.md` |
| Password Management System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/password-management-system/PRD.md` | `.codex/agents/experts/password-management-system.md` | `.codex/docs/PASSWORD-MANAGEMENT-SYSTEM.md` |
| Payment System | In Development | P0 - Critical | 1522 | Full | `specs/ConvexPress/systems/payment-system/PRD.md` | `.codex/agents/experts/payment-system.md` | `.codex/docs/PAYMENT-SYSTEM.md` |
| Post System | Production Ready | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/post-system/PRD.md` | `.codex/agents/experts/post-system.md` | `.codex/docs/POST-SYSTEM.md` |
| Product Bundles System | Not Started | P2 - Medium | 881 | Full | `specs/ConvexPress/systems/product-bundles-system/PRD.md` | `.codex/agents/experts/product-bundles-system.md` | `.codex/docs/PRODUCT-BUNDLES-SYSTEM.md` |
| Product Category System | In Development | P1 - High | 853 | Full | `specs/ConvexPress/systems/product-category-system/PRD.md` | `.codex/agents/experts/product-category-system.md` | `.codex/docs/PRODUCT-CATEGORY-SYSTEM.md` |
| Product System | In Development | P0 - Critical | 1456 | Full | `specs/ConvexPress/systems/product-system/PRD.md` | `.codex/agents/experts/product-system.md` | `.codex/docs/PRODUCT-SYSTEM.md` |
| Product Variants System | In Development | P1 - High | 836 | Full | `specs/ConvexPress/systems/product-variants-system/PRD.md` | `.codex/agents/experts/product-variants-system.md` | `.codex/docs/PRODUCT-VARIANTS-SYSTEM.md` |
| Recipe System | In Development | P2 - Medium | 212 | Full | `specs/ConvexPress/systems/recipe-system/PRD.md` | `.codex/agents/experts/recipe-system.md` | `.codex/docs/RECIPE-SYSTEM.md` |
| Registration System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/registration-system/PRD.md` | `.codex/agents/experts/registration-system.md` | `.codex/docs/REGISTRATION-SYSTEM.md` |
| Returns & Refunds System | Not Started | P1 - High | 238 | Full | `specs/ConvexPress/systems/returns-and-refunds-system/PRD.md` | `.codex/agents/experts/returns-and-refunds-system.md` | `.codex/docs/RETURNS-AND-REFUNDS-SYSTEM.md` |
| Reviews & Ratings System | Not Started | P2 - Medium | 834 | Full | `specs/ConvexPress/systems/reviews-ratings-system/PRD.md` | `.codex/agents/experts/reviews-ratings-system.md` | `.codex/docs/REVIEWS-RATINGS-SYSTEM.md` |
| Revision System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/revision-system/PRD.md` | `.codex/agents/experts/revision-system.md` | `.codex/docs/REVISION-SYSTEM.md` |
| Role & Capability System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/role-capability-system/PRD.md` | `.codex/agents/experts/role-capability-system.md` | `.codex/docs/ROLE-CAPABILITY-SYSTEM.md` |
| Routing System | In Development | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/routing-system/PRD.md` | `.codex/agents/experts/routing-system.md` | `.codex/docs/ROUTING-SYSTEM.md` |
| RSS/Feed System | In Development | P3 - Low | 42 | Scaffold | `specs/ConvexPress/systems/rss-feed-system/PRD.md` | `.codex/agents/experts/rss-feed-system.md` | `.codex/docs/RSS-FEED-SYSTEM.md` |
| Search System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/search-system/PRD.md` | `.codex/agents/experts/search-system.md` | `.codex/docs/SEARCH-SYSTEM.md` |
| SEO System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/seo-system/PRD.md` | `.codex/agents/experts/seo-system.md` | `.codex/docs/SEO-SYSTEM.md` |
| Settings System | Production Ready | P0 - Critical | 42 | Scaffold | `specs/ConvexPress/systems/settings-system/PRD.md` | `.codex/agents/experts/settings-system.md` | `.codex/docs/SETTINGS-SYSTEM.md` |
| Shipping Rate Engine | In Development | P0 - Critical | 773 | Full | `specs/ConvexPress/systems/rate-calculation-pipeline/PRD.md` | `.codex/agents/experts/rate-calculation-pipeline.md` | `.codex/docs/RATE-CALCULATION-PIPELINE.md` |
| Shipping Zone System | In Development | P1 - High | 835 | Full | `specs/ConvexPress/systems/shipping-zones-system/PRD.md` | `.codex/agents/experts/shipping-zones-system.md` | `.codex/docs/SHIPPING-ZONES-SYSTEM.md` |
| ShipStation Integration | In Development | P1 - High | 922 | Full | `specs/ConvexPress/systems/shipping-provider-shipstation/PRD.md` | `.codex/agents/experts/shipping-provider-shipstation.md` | `.codex/docs/SHIPPING-PROVIDER-SHIPSTATION.md` |
| Site Notification System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/site-notification-system/PRD.md` | `.codex/agents/experts/site-notification-system.md` | `.codex/docs/SITE-NOTIFICATION-SYSTEM.md` |
| Sitemap System | In Development | P2 - Medium | 42 | Scaffold | `specs/ConvexPress/systems/sitemap-system/PRD.md` | `.codex/agents/experts/sitemap-system.md` | `.codex/docs/SITEMAP-SYSTEM.md` |
| Subscription Billing System | In Development | P1 - High | 215 | Full | `specs/ConvexPress/systems/subscription-billing-system/PRD.md` | `.codex/agents/experts/subscription-billing-system.md` | `.codex/docs/SUBSCRIPTION-BILLING-SYSTEM.md` |
| Subscription Entitlement System | In Development | P1 - High | 170 | Full | `specs/ConvexPress/systems/subscription-entitlement-system/PRD.md` | `.codex/agents/experts/subscription-entitlement-system.md` | `.codex/docs/SUBSCRIPTION-ENTITLEMENT-SYSTEM.md` |
| Subscription System | In Development | P1 - High | 1624 | Full | `specs/ConvexPress/systems/subscription-system/PRD.md` | `.codex/agents/experts/subscription-system.md` | `.codex/docs/SUBSCRIPTION-SYSTEM.md` |
| Support Analytics System | In Development | P2 - Medium | 173 | Full | `specs/ConvexPress/systems/support-analytics-system/PRD.md` | `.codex/agents/experts/support-analytics-system.md` | `.codex/docs/SUPPORT-ANALYTICS-SYSTEM.md` |
| Support Deflection System | In Development | P1 - High | 145 | Full | `specs/ConvexPress/systems/support-deflection-system/PRD.md` | `.codex/agents/experts/support-deflection-system.md` | `.codex/docs/SUPPORT-DEFLECTION-SYSTEM.md` |
| Support Integration System | In Development | P2 - Medium | 171 | Full | `specs/ConvexPress/systems/support-integration-system/PRD.md` | `.codex/agents/experts/support-integration-system.md` | `.codex/docs/SUPPORT-INTEGRATION-SYSTEM.md` |
| Tabbed Editor Shell | In Development | P1 - High | 540 | Full | `specs/ConvexPress/systems/tabbed-editor-shell/PRD.md` | `.codex/agents/experts/tabbed-editor-shell.md` | `.codex/docs/TABBED-EDITOR-SHELL.md` |
| Tax System | In Development | P1 - High | 436 | Full | `specs/ConvexPress/systems/tax-system/PRD.md` | `.codex/agents/experts/tax-system.md` | `.codex/docs/TAX-SYSTEM.md` |
| Taxonomy System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/taxonomy-system/PRD.md` | `.codex/agents/experts/taxonomy-system.md` | `.codex/docs/TAXONOMY-SYSTEM.md` |
| Ticket Agent Tools | In Development | P1 - High | 160 | Full | `specs/ConvexPress/systems/ticket-agent-tools/PRD.md` | `.codex/agents/experts/ticket-agent-tools.md` | `.codex/docs/TICKET-AGENT-TOOLS.md` |
| Ticket Lifecycle System | In Development | P1 - High | 195 | Full | `specs/ConvexPress/systems/ticket-lifecycle-system/PRD.md` | `.codex/agents/experts/ticket-lifecycle-system.md` | `.codex/docs/TICKET-LIFECYCLE-SYSTEM.md` |
| Ticket Widget System | In Development | P2 - Medium | 182 | Full | `specs/ConvexPress/systems/ticket-widget-system/PRD.md` | `.codex/agents/experts/ticket-widget-system.md` | `.codex/docs/TICKET-WIDGET-SYSTEM.md` |
| UPS Direct Integration | In Development | P1 - High | 870 | Full | `specs/ConvexPress/systems/shipping-provider-ups/PRD.md` | `.codex/agents/experts/shipping-provider-ups.md` | `.codex/docs/SHIPPING-PROVIDER-UPS.md` |
| User Profile System | In Development | P1 - High | 42 | Scaffold | `specs/ConvexPress/systems/user-profile-system/PRD.md` | `.codex/agents/experts/user-profile-system.md` | `.codex/docs/USER-PROFILE-SYSTEM.md` |
| USPS Direct Integration | In Development | P2 - Medium | 1082 | Full | `specs/ConvexPress/systems/shipping-provider-usps/PRD.md` | `.codex/agents/experts/shipping-provider-usps.md` | `.codex/docs/SHIPPING-PROVIDER-USPS.md` |
| Wishlist System | Not Started | P2 - Medium | 527 | Full | `specs/ConvexPress/systems/wishlist-system/PRD.md` | `.codex/agents/experts/wishlist-system.md` | `.codex/docs/WISHLIST-SYSTEM.md` |
| WordPress Sync System | In Development | P2 - Medium | 191 | Full | `specs/ConvexPress/systems/wordpress-sync-system/PRD.md` | `.codex/agents/experts/wordpress-sync-system.md` | `.codex/docs/WORDPRESS-SYNC-SYSTEM.md` |

## Additional Subsystem PRDs

These PRDs exist under the canonical specs tree but are not currently top-level Airtable Systems. Treat them as child/subsystem specs unless the Systems table is intentionally expanded.

| PRD | Lines |
|---|---:|
| `specs/ConvexPress/systems/address-validation-system/PRD.md` | 639 |
| `specs/ConvexPress/systems/commerce-analytics-system/PRD.md` | 763 |
| `specs/ConvexPress/systems/customer-support-system/PRD.md` | 881 |
| `specs/ConvexPress/systems/product-addons-system/PRD.md` | 631 |
| `specs/ConvexPress/systems/product-attributes-system/PRD.md` | 252 |
| `specs/ConvexPress/systems/product-variations-system/PRD.md` | 473 |
| `specs/ConvexPress/systems/ship-from-locations-system/PRD.md` | 677 |
| `specs/ConvexPress/systems/shipping-classes-system/PRD.md` | 649 |
| `specs/ConvexPress/systems/shipping-labels-system/PRD.md` | 1042 |
| `specs/ConvexPress/systems/shipping-manifests-system/PRD.md` | 663 |
| `specs/ConvexPress/systems/shipping-method-dimensional/PRD.md` | 686 |
| `specs/ConvexPress/systems/shipping-method-flat-rate/PRD.md` | 554 |
| `specs/ConvexPress/systems/shipping-method-free/PRD.md` | 474 |
| `specs/ConvexPress/systems/shipping-method-live-rate/PRD.md` | 905 |
| `specs/ConvexPress/systems/shipping-method-local-delivery/PRD.md` | 538 |
| `specs/ConvexPress/systems/shipping-method-local-pickup/PRD.md` | 565 |
| `specs/ConvexPress/systems/shipping-method-price-based/PRD.md` | 403 |
| `specs/ConvexPress/systems/shipping-method-quantity-based/PRD.md` | 542 |
| `specs/ConvexPress/systems/shipping-method-table-rate/PRD.md` | 980 |
| `specs/ConvexPress/systems/shipping-method-weight-based/PRD.md` | 511 |
| `specs/ConvexPress/systems/shipping-packages-system/PRD.md` | 643 |
| `specs/ConvexPress/systems/shipping-rules-engine/PRD.md` | 849 |
| `specs/ConvexPress/systems/shipping-tracking-system/PRD.md` | 874 |
