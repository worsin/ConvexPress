# Medium Audit Backlog

Source: `audits/codex-backlog/system-audit-gaps.md`
Generated: 2026-06-04
Severity mapping: `P2 - Medium`

This file consolidates all medium-priority audit results into two execution lanes:

- Agent-doable: work that can be designed, implemented, tested, documented, and smoke-tested without a human decision or external account action.
- Needs human: product policy, credentials, legal/compliance, production-account setup, or final operator acceptance.

## Summary

- Systems: 20
- Most urgent technical theme: support/channel breadth, content/SEO polish, API/documentation traceability, and carrier edge-case hardening.
- Most urgent human theme: external channel/provider choices, PRD scope decisions, and production validation of SEO/feeds/search/import behavior.

## Systems

| System | Status | Agent-doable work | Needs human |
| --- | --- | --- | --- |
| Support Integration System | 10%, In Development | Write PRD/KB, add channel settings schema/UI, inbound email httpAction, Slack phase-1 receiver, outbound reply dispatch, rate limits, health checks. | Choose initial support channels/providers and provide credentials/OAuth app setup. |
| Support Analytics System | 45%, In Development | Write PRD/KB, daily rollups, agent metrics, SLA policy/breach tracking, trend charts, heatmaps, category reports, CSV export, unified analytics hub. | Approve SLA metrics, CSAT survey shape, report cadence, and digest recipients. |
| Recipe System | 55%, In Development | Write PRD/KB/expert, structured ingredients/instructions, Recipe JSON-LD, ratings, cuisine/course taxonomy, print view, video field, scaling helper, events, revisions, type/theme cleanup. | Confirm recipe feature parity target and structured content migration expectations. |
| Reviews & Ratings System | 55%, Not Started | Finalize implementation plan, emit review events, request-email flow, report/flag feature, JSON-LD, auto-approve policy, settings page, optional images/pros/cons, type/theme cleanup. | Finalize PRD scope, decide Google integration/images/pros/cons, approve moderation policy. |
| DHL Express Integration | 60%, In Development | Fix verifyConnection parity, typed provider errors, contract conformance, country/city/precision edge cases, tests, audit events, default package fallback. | Provide DHL credentials and confirm supported markets/package defaults. |
| KB Collections System | 70%, In Development | Clarify and document model, surface collections on help homepage, article-assignment UI, batch reorder, order/icon/status fields, PRD/KB. | Decide Intercom-style hierarchy vs current curation overlay. |
| Wishlist System | 70%, Not Started | Finalize PRD, add price/notification fields and guest table, emit events, listeners for price/back-in-stock, guest merge, limits, dropdown UI, admin management, type cleanup. | Approve wishlist notification thresholds, list limits, and guest wishlist behavior. |
| Ticket Widget System | 72%, In Development | Write PRD/KB/expert, unread query, attachments, widget color/position settings, consume/remove unused settings, offline retry, guest ticket option. | Decide anonymous ticket policy, operating hours, widget positioning/color defaults. |
| USPS Direct Integration | 72%, In Development | Emit B10 events, normalize errors, 401 retry, 404 unknown tracking, ZIP/weight/international/date guards, tests, retire legacy paths, admin selectors/log viewer. | Provide USPS credentials/scopes and choose settings namespace/USPS service defaults. |
| GA4 Integration System | 80%, In Development | Consolidate analytics settings routes, add Measurement ID injection, fix disconnect cache purge, emit error events, SHA-256 query hash, cleanup schema/docs. | Provide GA4 credentials/property/measurement ID and consent/DNT policy. |
| Gallery System | 80%, In Development | Write PRD/KB/expert, TipTap gallery node, slideshow layout, drag reorder, linkUrl rendering, load-more support, lifecycle events. | Confirm gallery parity target and preferred layouts/lightbox behavior. |
| API System | 85%, In Development | Rescope PRD, rate-limit headers, OpenAPI spec, API usage analytics, webhook retry tests, capability seed verification, optional REST webhook endpoints. | Decide whether headless commerce API and JWT shopper-context auth are launch scope. |
| Product Bundles System | 88%, Not Started | Finalize PRD, expert docs, reactive cascades, subscription bundles, BOGO UI, product-editor dependency notices, reusable components, media-id migration, scheduled availability. | Decide BOGO/subscription bundle launch scope and bundle image/media policy. |
| Revision System | 90%, In Development | Wire autosave to editor tick, backfill PRD, optional cursor pagination, optional custom-field snapshots. | Confirm custom-field/postmeta snapshot scope. |
| Search System | 92%, In Development | Rewrite PRD to live Convex-first scope, seed listeners, index custom fields, did-you-mean, password guard, recency boost, cursor pagination. | Decide whether Meilisearch becomes primary, optional, or removed from top-level settings. |
| WordPress Sync System | 92%, In Development | Write PRD/KB/expert, permalink redirect table, optional WXR import, optional ongoing cron sync, post-import role review UI. | Decide one-shot import vs ongoing sync, provide source-site credentials/data for real import validation. |
| Custom Field System | 95%, In Development | Backfill PRD, verify/export import UI, confirm Revision integration. | Decide whether field value revision history is required for launch. |
| Sitemap System | 95%, In Development | Backfill PRD, taxonomy.updated subscriber, optimize post/page invalidation, verify public rewrites, resolve static/dynamic robots conflict, fix/get signature, smoke sitemap updates. | Confirm production hosting rewrite behavior and robots/sitemap policy. |
| SEO System | 96%, In Development | Backfill PRD, update KB checklist, dedupe SEO metabox files, confirm homepage/archive coverage, E2E noindex/robots/JSON-LD tests. | Confirm SEO defaults, AI bot policy, and external rich-results validation expectations. |
| Audit Log System | 98%, In Development | Backfill PRD, plumb user-agent/session id, add integration tests for events and retention. | Decide retention period and audit export/compliance requirements. |

## Agent-First Execution Order

1. Build missing docs and expert ownership for undocumented but active systems.
2. Fix provider/API/search/SEO correctness gaps that are low-risk but high-leverage.
3. Add missing UI polish for content/support systems after critical commerce work is stable.

## Human Gates

1. Provider credentials and OAuth/app setup for GA4, USPS, DHL, Slack/email/SMS.
2. Scope decisions for headless API, Reviews, Bundles, Search, WordPress ongoing sync, and KB Collections.
3. SEO/feed validation against real deployed domains.
