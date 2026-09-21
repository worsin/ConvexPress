# Staged featured-page consumer

`portable/` contains exact copies of the authoritative staged backend `contracts.ts`, `planner.ts`, `resolve.ts` and their four generated runtime dependencies. Do not edit them here. `manifest.json` records source hashes. There is no server adapter, Convex graph, provider client or private query in this package.

After canonical changes, run from the repository root:

```sh
bun run sync:blocks
bun run sync:blocks:backend-foundation
bun run sync:blocks:portable-data
bun run check:blocks
bun run check:blocks:backend-foundation
```

The portable helper refuses imports outside its closed dependency list, root/staged generated mismatch and stale copies. `check:blocks` includes portable freshness. Isolation tests execute the copied planner/validator outside this checkout with only installed Zod.

`createDemoContentPageHost()` is an explicit trusted-code, demo-only capability. It issues opaque WeakMap grants after the authoritative envelope validator succeeds. Stored nodes, attrs, JSON objects and capability-name strings cannot create a grant. Installation binds the complete tree/policy and current website/instance, document, revision and viewer key. Reinstallation revokes the prior generation even when new data fails validation. Invalidation notifies mounted consumers so a prepared card cannot retain the old result. The renderer still checks the whole tree and all layout/anchor/plugin/capability rules; only the exact `core/featured-page` reference binding is consumed by this adapter.

The isolated BlockDemo reader returns explicitly synthetic fixtures and never calls a live backend. Context keys are demo labels, not credentials or proof of authentication. A structural envelope or in-memory demo grant is **not a public authorization token**. No production installer or registered canonical endpoint exists. Public activation still requires an authorized server-owned current tree/policy, actual current-viewer transport/cache binding, a registered return validator and aggregate read accounting. The existing backend foundation README owns those prerequisites.
