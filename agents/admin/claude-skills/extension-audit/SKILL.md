---
name: extension-audit
description: Use when reviewing an existing ConvexPress extension's wiring, authorization, generated contracts or backend/Admin/Website/Dashboard integration without changing it.
---

# Audit a ConvexPress extension

Produce evidence-backed findings without changing source, site data or settings.
Read `extension-kit/README.md` and `extension-kit/WORKFLOW.md` from
`ConvexPress-Admin`. Inspect the selected extension's current implementation;
older manual examples are not the complete installed contract.

## Establish identity

Infer the extension and requested audit scope from the task. Locate its actual
backend, Admin and Website roots, including `extensions.local` if used. Public
slug `community-events` maps to backend module `community_events`; compare the
installed manifests' ID, settings key, default enablement and dependencies rather
than constructing keys by string concatenation. Record which artifacts/runtime
are being assessed.

## Inspect the complete path

| Boundary | Evidence required |
| --- | --- |
| Backend | Unique tables/indexes, validators, plugin metadata, actual-handler tests, lifecycle and stale-edit guards |
| Authorization | Registered operator capabilities; customer/public actions' own authority; plugin gates in readers/actions as well as routes |
| Public data | Explicit DTO/projection, visibility and publication checks, site scope, bounded queries; private fields excluded |
| Admin | Owned manifest/nav/editor, canonical guarded routes, source-derived API contracts |
| Website | Manifest, typed API/DTO, parts, public routes, catalog declarations, Core surfaces and pack overrides |
| Dashboard | Backend contribution/access policy, Website declaration/page/route, matching catalog surfaces/registry IDs |
| Lifecycle | Evidence for draft invisibility, publication, stale edit, cancellation/archive and disable/re-enable data preservation |

For public actions such as RSVP, inspect their existing abuse and ownership
checks. Do not incorrectly require operator `manage_options` on a customer
handler. For search, confirm own-table identity and request-time plugin/public
visibility checks. Distinguish actual stored compatibility from assumptions
based on generated field names.

## Check generated output without repairing it

Inspect indexes, route trees, template mirrors and API declarations against
source. Use verified read-only check modes, such as Website `check:templates`
and root `node scripts/admin/generate-site-contracts.mjs --check`, when needed.
Never run write-mode codegen, sync, scaffolding, build, deployment or enablement
in the user's checkout as an audit step. If a generator lacks a check mode,
report the suspected drift or compare generation in an isolated temporary copy,
keeping the original unchanged. Do not refresh output before reporting whether
it was stale.

Scanner-owned registries should come from extension declarations. Catalog entries
and canonical route files are legitimate source inputs; their existence is not
proof of a broken manual install. A missing Website or Dashboard consumer is a
specific integration gap, not a handoff that can be presumed complete.

## Report

For each finding give severity, exact source location, failed workflow/evidence
and a bounded repair. Separate source checks, installed-artifact evidence, actual
runtime results and untested/provider-dependent requirements. Do not infer live
denial or successful publication from a guard's presence. Reuse existing valid
receipts with their scope and age stated. Report unchanged-state verification
for any temporary-copy check. Use `extension-add-feature` for authorized repairs;
use `extension-build` only for a new extension.
