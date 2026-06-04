# High Audit Backlog

Source: `audits/codex-backlog/system-audit-gaps.md`
Generated: 2026-06-04
Severity mapping: `P1 - High`

This file consolidates all high-priority audit results into two execution lanes:

- Agent-doable: work that can be designed, implemented, tested, documented, and smoke-tested without a human decision or external account action.
- Needs human: product policy, credentials, legal/compliance, production-account setup, or final operator acceptance.

## Summary

- Systems: 36
- Most urgent technical theme: commerce depth, customer/account flows, support ops, shipping integrations, analytics, content governance, and notification/event completeness.
- Most urgent human theme: tax policy, provider decisions, integration credentials, and scope choices for draft or parity-heavy systems.

## Systems

| System | Status | Agent-doable work | Needs human |
| --- | --- | --- | --- |
| Product Category System | 30%, In Development | Add hierarchy guards, path/sort/count fields, visibility/featured/nav fields, public category routes, events, admin drag tree, move/reorder queries, incremental counts. | Confirm product-category UX and SEO/navigation behavior. |
| Tax System | 32%, In Development | Draft PRD, add tax classes, taxable flags, shipping tax support, per-line tax storage, rate history, settings wiring, type cleanup, reports scaffold. | Choose tax provider or in-house scope; obtain legal/accounting tax policy for regions, exemptions, VAT, shipping tax. |
| Discount System | 35%, In Development | Draft PRD, add restriction/usage/stacking fields, free-shipping coupon type, usage table, admin edit route, events, Stripe coupon bridge, Woo importer coverage. | Approve discount stacking rules, promo policy, and Stripe promotion-code usage model. |
| Membership Plan System | 100%, Production Ready | Keep PRD/KB/current skill docs aligned; regression-test subscription-to-grant and role-elevation paths. | Operator walkthrough and acceptance of pricing/membership model. |
| Airtable Sync System | 40%, In Development | Draft PRD, persist connections/mappings/jobs/logs, add cron/manual trigger, dry-run/diff preview, retry/backoff, settings UI. | Decide if scope is blueprint-only sync or customer-content bidirectional sync. Provide Airtable bases/keys for real validation. |
| Subscription System | 100%, Production Ready | Keep PRD/KB aligned; maintain tests around offer/order-form/template/checkout/dunning. | Operator walkthrough with Stripe Billing test cases. |
| Content Restriction System | 95%, Production Ready | Backfill PRD/KB, verify website `checkAccess` coverage, add editor metabox polish, category/term rules, password loop verification, access-log analytics. | Confirm restriction UX, teaser copy, and paid-access policy. |
| Digital Products System | 55%, Not Started | Wire order-paid token/license generation, refund revocation, email templates, download endpoint, events, analytics route, expiry cron, type cleanup. | Approve digital license/download policy, refund revocation rules, and file-delivery acceptance. |
| Subscription Billing System | 100%, Production Ready | Keep billing docs/tests current; finish non-blocking invoice PDF portal polish if desired. | Operator walkthrough of renewals, dunning, cancellation, invoice, and Stripe webhooks. |
| Subscription Entitlement System | 95%, Production Ready | Exercise usage-metering under tests, document layered entitlement model, verify website guards and role elevation. | Decide whether metered usage is launch scope; acceptance of entitlement semantics. |
| Ticket Agent Tools | 58%, In Development | Write PRD/KB, wire canned responses, assignee/tag editors, bulk actions, merge, mentions/events, shortcuts, AI reply suggestion, workload dashboard. | Decide AI reply provider/cost limits and collaboration workflow expectations. |
| Inventory System | 65%, In Development | Consolidate reserve/commit/release paths, trigger alerts, event emission, admin inventory UI, per-product thresholds, variant alert keys, notifications, storefront-safe stock query, MCP tools, type cleanup. | Confirm stock display policy, low-stock thresholds, and back-in-stock notification rules. |
| Customer System | 70%, In Development | Build admin detail route/nav, expand self-service profile, email-change/account-deletion flows, events/notifications, dedicated capabilities, auto-provision customer profile, address-in-use checks, type cleanup. | Approve GDPR deletion/anonymization policy, marketing consent fields, and customer profile requirements. |
| Tabbed Editor Shell | 70%, In Development | Extract shared shell components, add date-range provider/URL params, register revisions tab, accessibility roles/keyboard nav, mobile overflow, accurate last-saved, reusable media field. | Confirm editor UX polish priorities and product-detail shell scope. |
| Ticket Lifecycle System | 70%, In Development | Add SLA breach fields/events, state machine guards, parent/related tickets, escalation rules, history trail, PRD/KB. | Approve SLA targets, escalation policy, and ticket status workflow. |
| UPS Direct Integration | 70%, In Development | Fix weight precision, residential flag, label format/stock, structured errors, OAuth events, capabilities, verify rate probe, account snapshot, UI panels, tests. | Provide UPS credentials, accepted service/label formats, and clarify pickup/manifest scope. |
| FedEx Direct Integration | 72%, In Development | Add dedicated OAuth table/locks, retry/error policy, address validation, events, One Rate package mapping, code-path consolidation, admin controls, validations, tests. | Provide FedEx credentials/account number, packaging/service choices, international customs requirements. |
| Product Variants System | 75%, In Development | Finalize PRD to match embedded option model, emit events, add raw source metadata, denormalized product variant fields, swatch/image display types, dedicated variant route, availability query, JSON-LD. | Decide embedded vs normalized attribute architecture and back-in-stock variant scope. |
| ShipStation Integration | 75%, In Development | Register webhook route, add webhook registration action/UI, shared error/retry helpers, address validation provider, events, status mapping, capabilities, adapter consolidation, TTL fix, direct label path. | Provide ShipStation/ShipEngine credentials, webhook environment, label format, and address-validation preference. |
| Support Deflection System | 78%, In Development | Write PRD/KB, route through AI Content Generation, auto-response email, multi-turn session mode, formula toggle, proactive suggestions, confidence gating. | Decide AI provider/model/cost policy and what confidence should block ticket creation. |
| KB Search & Analytics | 80%, In Development | Write PRD/KB, wire search tracking, click-throughs, duration beacon, admin panels, top articles, optional AI/RAG search toggle. | Decide whether public search source toggle and AI search are launch scope. |
| Shipping Zone System | 80%, In Development | Rebuild zone admin UX, add create route, count/enriched queries, structured errors, audit logs, better events, Playwright tests. | Confirm zone/fallback ordering policy and supported region/postcode patterns. |
| Password Management System | 82%, In Development | Write PRD, rate-limit reset flows, add must-reset flag, forgot-username, admin reset notification, KB refresh, timing-safe token compare. | Decide password policy, force-reset rules for imported users, and admin notification preference. |
| Returns & Refunds System | 82%, Not Started | Write PRD/KB, managed reason taxonomy, store-credit ledger, return-label generation, order-level refund route, PayPal refunds, stuck-refund cron. | Approve return/refund/restocking/tax/shipping policy and carrier return-label provider. |
| AI Content Generation | 85%, In Development | Surface Generate All button, add logs/cost capture, Zod output validation/retries, parallel topic generation, rate limits, docs cleanup, optional prompt overrides. | Decide provider/model defaults, cost ceilings, and per-site prompt customization policy. |
| User Profile System | 88%, In Development | Backfill PRD, verify auth cleanup internals, migrate legacy users consumers, align Clerk sync docs/location, inspect admin user routes. | Decide `pending` status/email verification model and profile field policy. |
| Analytics System | 90%, In Development | Build site-wide analytics route/nav, section sentinels, rate limiting, bot filtering, batched rollups, list-table views column, dashboard widget. | Decide bot/geo/privacy policy and analytics retention/consent behavior. |
| KB Category System | 90%, In Development | Write PRD/KB, register expert, clarify active/published semantics, add color/meta SEO fields, expose reorder UI. | Confirm category model and SEO field requirements. |
| Comment System | 95%, In Development | Backfill PRD, optional author denormalization refresh, safety-net purge cron. | Decide whether anonymous comment parity or Gravatar should remain out of scope. |
| Content Editor System | 95%, In Development | Backfill PRD, add full-screen/distraction-free toggle, reusable-block admin routes, verify raw JSON toggle, confirm editor-lock cleanup cron. | Confirm editor polish scope and administrator-only raw JSON policy. |
| Email Notification System | 95%, In Development | Build real weekly digest aggregation, device fingerprinting for new-device emails, cursor pagination, E2E notification tests, Svix rotation docs. | Provide/confirm email provider credentials, sender domain/DNS, and digest content/cadence policy. |
| KB Article System | 95%, In Development | Backfill PRD/KB, audit comments moderation UI, benchmark workflow approval against tickets integration. | Confirm KB editorial workflow and moderation expectations. |
| Media System | 95%, In Development | Settings-driven image sizes, storage-warning emails, verify HTTP upload endpoint, batched notifications, optional aggregate counts. | Decide storage quota thresholds, thumbnail defaults, and media-center integration direction. |
| Site Notification System | 97%, In Development | Add listener filter conditions, emit/fix SEO/webhook/login notification triggers, correlationId bulk summaries, optional website bell placement. | Decide notification noise policy and where customer/admin notifications should appear. |
| Menu System | 98%, In Development | Backfill PRD, optional page.updated listener, verify menu-location bootstrap. | Confirm menu drift behavior on slug changes and launch menu locations. |
| Taxonomy System | 98%, In Development | Backfill PRD, verify slug-manual tracking, smoke merge/reparent flows, QA post edit assign/unassign. | Decide v2 scope for custom taxonomies, term meta, term images, and per-taxonomy feeds. |

## Agent-First Execution Order

1. Close high-impact commerce dependencies: Product Category, Tax, Discount, Digital Products, Inventory, Returns, Variants.
2. Stabilize customer/account surfaces: Customer, Password, User Profile, Content Restriction.
3. Harden support/KB: Ticket Agent Tools, Ticket Lifecycle, Support Deflection, KB Search, KB Category.
4. Finish provider integration reliability: UPS, FedEx, ShipStation.
5. Backfill PRDs/KB docs and tests for production-ready-but-undocumented systems.

## Human Gates

1. Tax, refund, discount, membership, and account-deletion policy.
2. Carrier, payment, email, AI, and Airtable provider credentials.
3. Acceptance of support workflows, editor UX priorities, and customer-facing notification behavior.
