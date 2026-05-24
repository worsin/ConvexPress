# ConvexPress PRD Depth Audit

**Date:** 2026-04-22
**Scope:** 72 Airtable Systems + local `specs/ConvexPress/systems/**/PRD.md` files

## Summary

- Airtable Systems checked: 72
- Systems with linked System Expert records: 72
- Canonical PRD paths missing on disk: 0
- Full PRDs: 44
- Scaffold PRDs still needing expansion: 28
- Extra subsystem PRDs not represented as top-level Airtable Systems: 23

## Recently Expanded PRDs From Claude's Wave 11 Work

| System | Lines | PRD |
|---|---:|---|
| Tax System | 436 | `specs/ConvexPress/systems/tax-system/PRD.md` |
| Discount System | 270 | `specs/ConvexPress/systems/discount-system/PRD.md` |
| Returns & Refunds System | 238 | `specs/ConvexPress/systems/returns-and-refunds-system/PRD.md` |
| Subscription Billing System | 215 | `specs/ConvexPress/systems/subscription-billing-system/PRD.md` |
| Subscription Entitlement System | 170 | `specs/ConvexPress/systems/subscription-entitlement-system/PRD.md` |
| Content Restriction System | 223 | `specs/ConvexPress/systems/content-restriction-system/PRD.md` |
| WordPress Sync System | 191 | `specs/ConvexPress/systems/wordpress-sync-system/PRD.md` |
| KB Article System | 183 | `specs/ConvexPress/systems/kb-article-system/PRD.md` |
| KB Category System | 147 | `specs/ConvexPress/systems/kb-category-system/PRD.md` |
| KB Collections System | 172 | `specs/ConvexPress/systems/kb-collections-system/PRD.md` |
| KB Search & Analytics | 184 | `specs/ConvexPress/systems/kb-search-and-analytics/PRD.md` |
| Support Analytics System | 173 | `specs/ConvexPress/systems/support-analytics-system/PRD.md` |
| Support Integration System | 171 | `specs/ConvexPress/systems/support-integration-system/PRD.md` |
| Support Deflection System | 145 | `specs/ConvexPress/systems/support-deflection-system/PRD.md` |
| Ticket Lifecycle System | 195 | `specs/ConvexPress/systems/ticket-lifecycle-system/PRD.md` |
| Ticket Agent Tools | 160 | `specs/ConvexPress/systems/ticket-agent-tools/PRD.md` |
| Ticket Widget System | 182 | `specs/ConvexPress/systems/ticket-widget-system/PRD.md` |
| Airtable Sync System | 185 | `specs/ConvexPress/systems/airtable-sync-system/PRD.md` |
| Recipe System | 212 | `specs/ConvexPress/systems/recipe-system/PRD.md` |

## Scaffold PRDs Remaining

These are valid canonical paths and are wired in Airtable, but they are still scaffolds and should be expanded before relying on them as full product contracts.

| System | Priority | Lines | PRD |
|---|---|---:|---|
| API System | P2 - Medium | 42 | `specs/ConvexPress/systems/api-system/PRD.md` |
| Audit Log System | P2 - Medium | 42 | `specs/ConvexPress/systems/audit-log-system/PRD.md` |
| Auth System | P0 - Critical | 42 | `specs/ConvexPress/systems/auth-system/PRD.md` |
| Comment System | P1 - High | 42 | `specs/ConvexPress/systems/comment-system/PRD.md` |
| Content Editor System | P1 - High | 42 | `specs/ConvexPress/systems/content-editor-system/PRD.md` |
| Custom Field System | P2 - Medium | 42 | `specs/ConvexPress/systems/custom-field-system/PRD.md` |
| Dashboard System | P0 - Critical | 42 | `specs/ConvexPress/systems/dashboard-system/PRD.md` |
| Email Notification System | P1 - High | 42 | `specs/ConvexPress/systems/email-notification-system/PRD.md` |
| Event Dispatcher System | P0 - Critical | 42 | `specs/ConvexPress/systems/event-dispatcher-system/PRD.md` |
| Gallery System | P2 - Medium | 42 | `specs/ConvexPress/systems/gallery-system/PRD.md` |
| Media System | P1 - High | 42 | `specs/ConvexPress/systems/media-system/PRD.md` |
| Membership Plan System | P1 - High | 42 | `specs/ConvexPress/systems/membership-plan-system/PRD.md` |
| Menu System | P1 - High | 42 | `specs/ConvexPress/systems/menu-system/PRD.md` |
| Page System | P0 - Critical | 42 | `specs/ConvexPress/systems/page-system/PRD.md` |
| Password Management System | P1 - High | 42 | `specs/ConvexPress/systems/password-management-system/PRD.md` |
| Post System | P0 - Critical | 42 | `specs/ConvexPress/systems/post-system/PRD.md` |
| Registration System | P0 - Critical | 42 | `specs/ConvexPress/systems/registration-system/PRD.md` |
| Revision System | P2 - Medium | 42 | `specs/ConvexPress/systems/revision-system/PRD.md` |
| Role & Capability System | P0 - Critical | 42 | `specs/ConvexPress/systems/role-capability-system/PRD.md` |
| Routing System | P0 - Critical | 42 | `specs/ConvexPress/systems/routing-system/PRD.md` |
| RSS/Feed System | P3 - Low | 42 | `specs/ConvexPress/systems/rss-feed-system/PRD.md` |
| Search System | P2 - Medium | 42 | `specs/ConvexPress/systems/search-system/PRD.md` |
| SEO System | P2 - Medium | 42 | `specs/ConvexPress/systems/seo-system/PRD.md` |
| Settings System | P0 - Critical | 42 | `specs/ConvexPress/systems/settings-system/PRD.md` |
| Site Notification System | P1 - High | 42 | `specs/ConvexPress/systems/site-notification-system/PRD.md` |
| Sitemap System | P2 - Medium | 42 | `specs/ConvexPress/systems/sitemap-system/PRD.md` |
| Taxonomy System | P1 - High | 42 | `specs/ConvexPress/systems/taxonomy-system/PRD.md` |
| User Profile System | P1 - High | 42 | `specs/ConvexPress/systems/user-profile-system/PRD.md` |

## Extra PRDs Not Linked To Airtable Systems

These are mostly granular shipping/product subsystem specs. Decide whether each should become a top-level System row or remain a child PRD under a parent system.

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

## Recommendation

Keep the Airtable Systems table at 72 top-level systems unless the team wants to track granular shipping methods/providers as first-class systems. The next documentation wave should expand the 28 scaffold PRDs, prioritizing P0/P1 scaffolds first: Post, Page, Event Dispatcher, Auth, Role & Capability, Settings, Dashboard, Registration, Routing, Media, Site Notification, Taxonomy, Email Notification, Comment, User Profile, Membership Plan, and Password Management.
