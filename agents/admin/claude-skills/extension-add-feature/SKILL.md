---
name: extension-add-feature
description: Use when adding or changing fields, behavior, actions, routes or capabilities in an existing ConvexPress extension.
---

# Extend an installed ConvexPress feature

Read `extension-kit/README.md` and `extension-kit/WORKFLOW.md` from
`ConvexPress-Admin`, then inspect the existing extension and its consumers.
Extend that implementation without re-scaffolding it. Infer identity/scope from
the task and source; ask only when an unresolved choice changes the work.

## Trace the change

For a public slug such as `community-events`, the backend module is
`community_events`; read the installed plugin metadata rather than guessing
its settings key or defaults. Locate backend schema/handlers/tests, Admin
manifest/editor/canonical routes, Website DTOs/API/parts/public routes, template
surfaces and customer Dashboard declaration/pages/routes. Existing local installs
may use `extensions.local`; preserve their actual layout.

| Requested change | Required propagation |
| --- | --- |
| Public field | Schema and input validation, authorized mutation, public projection/DTO, native control, intended Website/Dashboard consumers and templates |
| Private field | Schema, authorized reads/writes and native control; verify public DTOs omit it |
| Action | Registered operator capability or existing customer/public authority, plugin gate, validation, stale/duplicate behavior and actual caller |
| Route/surface | Canonical route, guard, owned navigation/manifest/catalog declarations, data boundary and template surface |
| Required stored field | Explicit migration/default semantics for existing records and revisions; no implicit data loss |

Keep plugin gates in backend readers/actions as well as route loaders. Preserve
optimistic edits, public visibility, extension-owned data, customer/operator
separation and recovery. Use existing capabilities where appropriate; register
and test a new capability before claiming access works. Do not grant blanket
operator authority to a customer action.

## Implement and verify

Write a focused failing regression for a demonstrated defect or meaningful new
behavior; implement the complete affected path. Test backward compatibility for
old records and enabled/disabled access. Do not rename unrelated code or change
unrelated settings.

Regenerate affected extension indexes, template mirrors and canonical routes
using WORKFLOW.md. Refresh source-derived API contracts from repository root
with `node scripts/admin/generate-site-contracts.mjs`; use `--check` to verify.
Do not hand-edit generated indexes or tolerate stale API types until deployment.
Catalogs and route files are legitimate source inputs; the central plugin union
and navigation list remain scanner-owned.

Run affected actual-handler/consumer tests, backend strict types, Admin types
and build, Website types/build/lint/template checks as applicable to the change.
For a public field, verify its actual native save/reopen and published Website
value, plus any Dashboard consumer. Preserve original records and installed
features during authorized deployment. Existing source tests do not establish
that the matching runtime is installed.

Report the implemented behavior, compatibility/permission implications, exact
checks, installed artifacts, live results and outstanding prerequisites. Do not
re-run the new-extension generator over an existing feature. Use
`extension-audit` for a read-only review and `extension-build` for a new feature.
