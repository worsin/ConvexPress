# Plugin Boundary Audit

Date: 2026-04-09
Context: follow-up audit after VexCart commerce gap analysis

## Decision

Integration layers should **not** be represented as standalone plugins in the plugin manager.

If two systems are enabled and they are supposed to work together, the integration should be considered part of the system runtime, not a third toggle.

That means:

- no plugin whose main purpose is "bridge", "sync", or "integration"
- no plugin whose main purpose is enabling communication between already-enabled systems
- no plugin toggle for a carrier/provider adapter if shipping is already enabled
- no plugin toggle for Woo import/sync if it is operational tooling under commerce rather than a user-facing product capability

## Plugin Rule

A thing qualifies as a plugin only if it is a real user-facing or admin-facing feature domain with its own:

- data model
- runtime behavior
- settings worth enabling/disabling as a feature
- admin and/or website surfaces
- meaningful standalone business value

A thing does **not** qualify as a plugin if it is mainly:

- an integration between two enabled systems
- a bridge layer
- import/export tooling
- provider connectivity
- sync plumbing
- background interoperability logic

## Current Registry Audit

Current live plugin registry in code:

- `commerce`
- `commerceSubscriptions`
- `membership`
- `knowledgeBase`
- `tickets`
- `customFields`
- `recipes`
- `gallery`

Result:

- the live code registry is currently clean
- there are no obvious integration-only plugins in the current plugin manager

Source:

- [registry.ts](/Users/worsin/Development/ConvexPress/ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts)

## Airtable Plugin Inventory Audit

The Airtable `Plugins` table currently includes:

- `ConvexPress Commerce`
- `ConvexPress Subscriptions`
- `ConvexPress Membership`
- `ConvexPress Knowledge Base`
- `ConvexPress Tickets`
- `ConvexPress Gallery`
- `ConvexPress Recipes`
- `ConvexPress Shipping`
- `ConvexPress Support Bridge`

Problem entries:

### `ConvexPress Shipping`

This is questionable as a standalone plugin.

Reason:

- shipping is already a first-class commerce capability
- users enabling commerce will expect shipping behavior to exist as part of commerce
- carrier/provider integration should be configuration within shipping/commerce, not a separate plugin decision

Recommended treatment:

- treat shipping as a subsystem under `commerce`
- keep shipping settings, shipping routes, shipping schema, shipping providers
- do **not** surface shipping as its own plugin toggle in the plugin manager

### `ConvexPress Support Bridge`

This should not be a plugin.

Reason:

- it is explicitly described as a bridge between tickets and KB
- if `tickets` and `knowledgeBase` are enabled, their cooperation should be automatic
- no one will want to separately toggle the existence of their bridge logic

Recommended treatment:

- remove the concept of `Support Bridge` as a plugin
- keep support orchestration logic in `support/*`
- treat it as always-on integration behavior between:
  - `tickets`
  - `knowledgeBase`
  - optional customer portal/support surfaces

## Planned Docs Audit

The planning docs still include one major integration-shaped plugin:

### `commerceWooSync`

This appears in:

- [COMMERCE-PLUGIN-SUITE-INVENTORY.md](/Users/worsin/Development/ConvexPress/.codex/docs/COMMERCE-PLUGIN-SUITE-INVENTORY.md)
- [COMMERCE-PLUGIN-SUITE-ROADMAP.md](/Users/worsin/Development/ConvexPress/.codex/docs/COMMERCE-PLUGIN-SUITE-ROADMAP.md)
- [COMMERCE-PLUGIN-SUITE-MASTER-IMPLEMENTATION-PLAN.md](/Users/worsin/Development/ConvexPress/.codex/docs/COMMERCE-PLUGIN-SUITE-MASTER-IMPLEMENTATION-PLAN.md)
- [VEXCART-COMMERCE-PLUGIN-STRATEGY.md](/Users/worsin/Development/ConvexPress/.codex/docs/VEXCART-COMMERCE-PLUGIN-STRATEGY.md)

Assessment:

- `commerceWooSync` should **not** be a plugin in the user/admin plugin manager
- it is import/sync tooling
- it is not a business capability a site owner thinks of as a product feature

Recommended treatment:

- demote `commerceWooSync` from plugin status
- reclassify it as:
  - commerce tooling
  - admin-only integration tooling
  - optional operations module under commerce

It may still exist in code, but it should not be treated as a plugin toggle.

## Revised Commerce Plugin Set

These are still valid as real plugins:

- `commerce`
- `commerceSubscriptions`
- `membership`
- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`

This one is optional later but still qualifies as a real plugin if built:

- `commerceFulfillment`

Reason:

- fulfillment can plausibly be a real operational domain with its own workflows, queue, staff UI, and data model
- it is more than just a bridge

## Revised Non-Plugin Set

These should be treated as non-plugin integration or tooling layers:

- shipping provider integrations
- ticket/KB bridge logic
- WooCommerce sync/import tooling
- payment provider adapters
- carrier adapters
- cross-plugin event bridges
- subscription-to-membership entitlement propagation

These should be automatic when their parent systems are enabled and configured.

## Impact On Gap Analysis

This changes how the earlier VexCart carry-over audit should be interpreted.

### Keep as plugin gaps

- `commerceDigital`
- `commerceReviews`
- `commerceWishlists`
- `commerceBundles`
- `commerceReturns`
- possibly `commerceFulfillment`

### Do not keep as plugin gaps

- `commerceWooSync`
- shipping as a standalone plugin
- support bridge as a standalone plugin

### Reframe them instead as

- integration/runtime gaps
- admin tooling gaps
- configuration gaps
- interoperability gaps

## Revised Execution Guidance For Claude

When Claude continues the VexCart carry-over work, use this rule:

1. Build standalone plugins only for true product/business domains.
2. Build integrations as always-on behavior inside already-enabled systems.
3. Do not add new plugin manager toggles for bridges, syncs, or adapters.
4. If both source systems are enabled, their integration should generally just work.

Concrete examples:

- if `commerceSubscriptions` and `membership` are both enabled, entitlement bridging should just run
- if `tickets` and `knowledgeBase` are both enabled, support deflection and article linking should just work
- if `commerce` shipping is enabled and a carrier is configured, live rates should just work
- if Woo import tooling exists, it should live under commerce admin tooling, not as a plugin toggle

## Bottom Line

The plugin manager should represent feature domains, not wiring.

Current code is mostly aligned with that rule.

The main cleanup needed is conceptual:

- stop treating sync/bridge/integration layers as plugins in docs and Airtable
- keep the plugin surface focused on real capabilities
- move integration logic into automatic system behavior
