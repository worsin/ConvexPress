---
name: template-audit
description: Use when reviewing a ConvexPress template pack, checking SDK contract compliance, stale Admin mirrors, Core fallback, or readiness after surface and Customizer changes.
---

Audit the requested pack against the current SDK and its actual Website consumers.
Read `ConvexPress-Website/template-kit/CONTRACT.md`, the pack's `DESIGN.md` and
`template.json`, and the affected surface view models. Separate owned surfaces
from deliberate Core fallback; a wrapper that forwards all props is valid reuse,
but does not establish a distinct design or a new contract.

From `ConvexPress-Website/apps/web`:

```sh
bun run check:templates
bun run check:templates:ssr
```

The first command checks manifest/files, field contracts, forbidden pack imports
and colors, and exact generated Admin mirrors. It is read-only. To isolate
synchronization drift, run `node ../../scripts/sync-template-packs.mjs --check`.
Record failed paths before any repair. If repair is in scope, run
`bun run sync:templates`, review all changed manifests/mirrors, then repeat the
audit. A passing result after silent regeneration hides the initial defect.

| Evidence | Required boundary |
| --- | --- |
| Static check | Actual installed manifests and generated mirrors; no automatic writes |
| Type check | Website and affected Admin consumers; use their package scripts |
| SSR | Changed components and resolver entries, including omitted-surface fallback |
| Actual Website | Requested pack, relevant data/action states, desktop/mobile and keyboard |

Inspect the SSR entry's pack list: existing four-pack coverage does not by itself
prove a newly added pack. Exercise its owned surfaces and Core fallback explicitly.
Use real exported view models, preserve authored canonical content, and cover
applicable loading, empty, failure and access states. Verify Customizer declarations
against defaults, finite variants, module consumers and `data-customize` targeting.
Pack source must not fetch backend data or embed example business records.

For an isolated trial, follow `template-build`'s paired Website/Admin layout and
run copied scripts. Keep imports and canonical blocks inside the copied tree;
symlinking source can accidentally exercise the original app. Reuse dependencies,
not environment files or credentials. A simulated dependency proves forwarding,
not that the real dependency renders. Static, type and SSR checks do not replace
the requested actual Website or native editor acceptance.

Report findings with file/caller, reproduced behavior, scope and next exit check.
Report passed commands and runtime states separately, including untested states.
Preserve existing content/settings and owned evidence. Audit alone does not
authorize publishing, activation or deployment; follow the session's scope.
